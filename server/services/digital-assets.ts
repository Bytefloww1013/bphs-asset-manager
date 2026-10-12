import { and, eq, isNull, sql } from 'drizzle-orm'
import type { DigitalAssetCreateInput, DigitalAssetUpdateInput, DigitalIssueInput } from '../../shared/schemas.ts'
import type { DigitalAssetDetail, DigitalAssetRow, DigitalHistoryRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { digitalAssetTypes, digitalAssets, digitalAssignments } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'
import { fullName, requireEmployee } from './refs.ts'

interface RawDigitalAsset {
  id: number
  code: string
  typeId: number
  type: string
  account: string
  status: 'in_service' | 'inactive'
  createdAt: number
  total: number
  assignmentId: number | null
  issuedAt: number | null
  eId: number | null
  eCode: string | null
  eFirst: string | null
  eLast: string | null
  eDept: string | null
}

/** DA-00001 from the row's own id. Ids only count up, so an Asset ID is never handed out twice, even after a delete. */
const codeFor = (id: number) => `DA-${String(id).padStart(5, '0')}`

function toRow(row: RawDigitalAsset): DigitalAssetRow {
  const issued = row.assignmentId !== null
  return {
    id: row.id,
    code: row.code,
    typeId: row.typeId,
    type: row.type,
    account: row.account,
    status: row.status,
    // Inactive can only be set while nothing is issued, so the two never disagree.
    state: issued ? 'active' : row.status === 'inactive' ? 'inactive' : 'not_issued',
    employee: issued ? { id: row.eId!, code: row.eCode!, name: fullName(row.eFirst!, row.eLast!), department: row.eDept } : null,
    assignmentId: row.assignmentId,
    issuedAt: row.issuedAt === null ? null : new Date(row.issuedAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    hasHistory: row.total > 0,
  }
}

/** Every digital asset with its derived status, who it is issued to and since when. */
export function listDigitalAssets(db: DbLike, id?: number): DigitalAssetRow[] {
  return db
    .all<RawDigitalAsset>(sql`
      select d.id as id, d.code as code, d.type_id as typeId, t.name as type, d.account as account, d.status as status,
             d.created_at as createdAt,
             (select count(*) from digital_assignments h where h.digital_asset_id = d.id) as total,
             a.id as assignmentId, a.issued_at as issuedAt,
             e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept
      from digital_assets d
      join digital_asset_types t on t.id = d.type_id
      left join digital_assignments a on a.digital_asset_id = d.id and a.returned_at is null
      left join employees e on e.id = a.employee_id
      ${id ? sql`where d.id = ${id}` : sql``}
      order by d.id`)
    .map(toRow)
}

function getDigitalAsset(db: DbLike, id: number): DigitalAssetRow {
  const row = listDigitalAssets(db, id)[0]
  if (!row) throw notFound('Digital asset')
  return row
}

export function getDigitalAssetDetail(db: DbLike, id: number): DigitalAssetDetail {
  const asset = getDigitalAsset(db, id)
  const history = db
    .all<{
      id: number
      issuedAt: number
      returnedAt: number | null
      issuedBy: string
      returnedBy: string | null
      eId: number
      eCode: string
      eFirst: string
      eLast: string
      eDept: string | null
    }>(sql`
      select a.id as id, a.issued_at as issuedAt, a.returned_at as returnedAt, ui.email as issuedBy, ur.email as returnedBy,
             e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept
      from digital_assignments a
      join employees e on e.id = a.employee_id
      join users ui on ui.id = a.issued_by_id
      left join users ur on ur.id = a.returned_by_id
      where a.digital_asset_id = ${id}
      order by a.issued_at desc, a.id desc`)
    .map(
      (row): DigitalHistoryRow => ({
        id: row.id,
        employee: { id: row.eId, code: row.eCode, name: fullName(row.eFirst, row.eLast), department: row.eDept },
        issuedAt: new Date(row.issuedAt).toISOString(),
        returnedAt: row.returnedAt === null ? null : new Date(row.returnedAt).toISOString(),
        issuedBy: row.issuedBy,
        returnedBy: row.returnedBy,
      }),
    )
  return { asset, history }
}

function requireActiveType(db: DbLike, typeId: number) {
  const type = db.select().from(digitalAssetTypes).where(eq(digitalAssetTypes.id, typeId)).get()
  if (!type || !type.isActive) throw invalid('Choose an active digital asset type.', { field: 'typeId' })
  return type
}

/** Issue a seat that is known to exist. `at` is when it was issued: now, or an earlier moment the form gave. */
function issueInTx(tx: DbLike, actor: Actor, assetId: number, input: DigitalIssueInput, now: Date) {
  const asset = getDigitalAsset(tx, assetId)
  if (asset.employee) {
    throw conflict('asset_already_assigned', `${asset.code} is already issued to ${asset.employee.name}. Unassign it first.`, {
      assignmentId: asset.assignmentId,
    })
  }
  if (asset.status === 'inactive') throw conflict('asset_inactive', `${asset.code} is inactive. Reactivate it before issuing.`)

  const employee = requireEmployee(tx, input.employeeId)
  if (employee.archivedAt) {
    throw conflict('employee_archived', `${fullName(employee.firstName, employee.lastName)} is archived.`)
  }

  const at = input.issuedAt ? new Date(input.issuedAt) : now
  if (at.getTime() > now.getTime()) throw invalid('The issue date cannot be in the future.', { field: 'issuedAt' })
  // A seat is with one person at a time, in the history as well as today.
  const last = tx.get<{ at: number | null }>(
    sql`select max(returned_at) as at from digital_assignments where digital_asset_id = ${assetId}`,
  )
  if (last?.at != null && at.getTime() < last.at) {
    throw invalid(`The issue date cannot be before ${asset.code} was last unassigned.`, { field: 'issuedAt' })
  }

  const assignment = tx
    .insert(digitalAssignments)
    .values({ digitalAssetId: assetId, employeeId: employee.id, issuedAt: at, issuedById: actor.id })
    .returning({ id: digitalAssignments.id })
    .get()
  writeAudit(tx, actor, {
    action: 'issue',
    entityType: 'digitalasset',
    entityId: assetId,
    details: `${asset.code} → ${employee.code} · ${asset.type}${input.issuedAt ? ` · issued ${at.toISOString().slice(0, 10)}` : ''}`,
    at: now,
  })
  return assignment.id
}

export function createDigitalAsset(db: Db, actor: Actor, input: DigitalAssetCreateInput): DigitalAssetRow {
  const id = db.transaction((tx) => {
    const type = requireActiveType(tx, input.typeId)
    // The Asset ID is made from the id the database gives the row, so the row is written first and named second.
    const row = tx
      .insert(digitalAssets)
      .values({ code: `pending-${crypto.randomUUID()}`, typeId: type.id, account: input.account })
      .returning({ id: digitalAssets.id })
      .get()
    const code = codeFor(row.id)
    tx.update(digitalAssets).set({ code }).where(eq(digitalAssets.id, row.id)).run()
    const now = new Date()
    writeAudit(tx, actor, { action: 'create', entityType: 'digitalasset', entityId: row.id, details: `${code} · ${type.name} · ${input.account}`, at: now })
    if (input.employeeId) issueInTx(tx, actor, row.id, { employeeId: input.employeeId }, now)
    return row.id
  })
  return getDigitalAsset(db, id)
}

export function updateDigitalAsset(db: Db, actor: Actor, id: number, input: DigitalAssetUpdateInput): DigitalAssetRow {
  db.transaction((tx) => {
    const current = getDigitalAsset(tx, id)
    const patch: Partial<typeof digitalAssets.$inferInsert> = {}
    const changes: string[] = []
    if (input.typeId !== undefined && input.typeId !== current.typeId) {
      const type = requireActiveType(tx, input.typeId)
      patch.typeId = type.id
      changes.push(`type: ${current.type} → ${type.name}`)
    }
    if (input.account !== undefined && input.account !== current.account) {
      patch.account = input.account
      changes.push(`account: ${current.account} → ${input.account}`)
    }
    if (changes.length === 0) return
    tx.update(digitalAssets).set(patch).where(eq(digitalAssets.id, id)).run()
    writeAudit(tx, actor, { action: 'update', entityType: 'digitalasset', entityId: id, details: `${current.code} · ${changes.join('; ')}` })
  })
  return getDigitalAsset(db, id)
}

/** Inactive is set by hand and only on a seat nobody holds; it keeps the seat from being issued until it is reactivated. */
export function setDigitalAssetStatus(db: Db, actor: Actor, id: number, status: 'in_service' | 'inactive'): DigitalAssetRow {
  db.transaction((tx) => {
    const current = getDigitalAsset(tx, id)
    if (current.status === status) return
    if (status === 'inactive' && current.employee) {
      throw conflict('asset_assigned', `${current.code} is issued to ${current.employee.name}. Unassign it first.`)
    }
    tx.update(digitalAssets).set({ status }).where(eq(digitalAssets.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'digitalasset',
      entityId: id,
      details: `${current.code} · ${status === 'inactive' ? 'marked inactive' : 'reactivated'}`,
    })
  })
  return getDigitalAsset(db, id)
}

export function issueDigitalAsset(db: Db, actor: Actor, id: number, input: DigitalIssueInput): DigitalAssetRow {
  db.transaction((tx) => issueInTx(tx, actor, id, input, new Date()))
  return getDigitalAsset(db, id)
}

export function unassignDigitalAsset(db: Db, actor: Actor, id: number): DigitalAssetRow {
  db.transaction((tx) => {
    const current = getDigitalAsset(tx, id)
    if (!current.employee || current.assignmentId === null) {
      throw conflict('not_assigned', `${current.code} is not issued to anyone.`)
    }
    const now = new Date()
    tx.update(digitalAssignments)
      .set({ returnedAt: now, returnedById: actor.id })
      .where(and(eq(digitalAssignments.id, current.assignmentId), isNull(digitalAssignments.returnedAt)))
      .run()
    writeAudit(tx, actor, {
      action: 'return',
      entityType: 'digitalasset',
      entityId: id,
      details: `${current.code} ← ${current.employee.code} · ${current.type}`,
      at: now,
    })
  })
  return getDigitalAsset(db, id)
}

/** Deleting is only for a seat entered by mistake: one that has ever been issued keeps its place in the history. */
export function deleteDigitalAsset(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const current = getDigitalAsset(tx, id)
    if (current.hasHistory) {
      throw conflict('has_history', `${current.code} has assignment history. Mark it inactive instead; history is never deleted.`)
    }
    tx.delete(digitalAssets).where(eq(digitalAssets.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'digitalasset', entityId: id, details: `${current.code} · ${current.type} · ${current.account}` })
  })
}
