import { historyOf, issue, requireHolder, returnItem, type CustodyKind } from '#foundation/assignments/server/index.ts'
import { writeAudit } from '#foundation/audit/server/index.ts'
import { fullName } from '#foundation/employees/server/index.ts'
import { accountOf, notify } from '#foundation/notifications/server/index.ts'
import { eq, sql } from 'drizzle-orm'
import type { Db, DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, invalid, notFound } from '#kernel/lib/errors.ts'
import type {
  DigitalAssetCreateInput,
  DigitalAssetDetail,
  DigitalAssetRow,
  DigitalAssetUpdateInput,
  DigitalHistoryRow,
  DigitalIssueInput,
  DigitalUnassignInput,
} from '../shared/index.ts'
import { digitalAssetTypes, digitalAssets } from './schema.ts'

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
    employee: issued
      ? { id: row.eId!, code: row.eCode!, name: fullName(row.eFirst!, row.eLast!), department: row.eDept }
      : null,
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
             (select count(*) from assignments h where h.kind = 'digital-asset' and h.item_id = d.id) as total,
             a.id as assignmentId, a.issued_at as issuedAt,
             e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept
      from digital_assets d
      join digital_asset_types t on t.id = d.type_id
      left join assignments a on a.kind = 'digital-asset' and a.item_id = d.id and a.returned_at is null
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
  // Only ever employees: the kind allows no other holder.
  const history = historyOf(db, digitalAssetCustody.kind, id).map((record): DigitalHistoryRow => ({
    id: record.id,
    employee: record.employee!,
    issuedAt: record.issuedAt.toISOString(),
    returnedAt: record.returnedAt?.toISOString() ?? null,
    issuedBy: record.issuedBy,
    returnedBy: record.returnedBy,
  }))
  return { asset, history }
}

function requireActiveType(db: DbLike, typeId: number) {
  const type = db.select().from(digitalAssetTypes).where(eq(digitalAssetTypes.id, typeId)).get()
  if (!type || !type.isActive) throw invalid('Choose an active digital asset type.', { field: 'typeId' })
  return type
}

/** Why a seat can't be issued now, in the words the Issue sheet shows. */
const inactiveBlocker = (asset: { code: string; status: string }) =>
  asset.status === 'inactive'
    ? { code: 'asset_inactive', reason: `${asset.code} is inactive. Reactivate it before issuing.` }
    : null

/** Digital seats in the custody ledger: only an employee holds one, and the register's Issue and Unassign give them out. */
export const digitalAssetCustody: CustodyKind = {
  kind: 'digital-asset',
  label: 'digital asset',
  holders: ['employee'],
  workspace: 'assets',
  heldFigure: 'digitalHeld',
  holding: (count) => `has ${count} digital asset(s)`,
  release: 'Unassign',
  issueBlocked(db, itemId) {
    const asset = db
      .select({ code: digitalAssets.code, status: digitalAssets.status })
      .from(digitalAssets)
      .where(eq(digitalAssets.id, itemId))
      .get()
    if (!asset) throw notFound('Digital asset')
    return inactiveBlocker(asset)
  },
}

/** Issue a seat that is known to exist. `at` is when it was issued: now, or an earlier moment the form gave. */
function issueInTx(tx: DbLike, actor: Actor, assetId: number, input: DigitalIssueInput, now: Date) {
  const asset = getDigitalAsset(tx, assetId)
  if (asset.employee) {
    throw conflict(
      'asset_already_assigned',
      `${asset.code} is already issued to ${asset.employee.name}. Unassign it first.`,
      {
        assignmentId: asset.assignmentId,
      },
    )
  }
  const inactive = inactiveBlocker(asset)
  if (inactive) throw conflict(inactive.code, inactive.reason)

  const holder = requireHolder(tx, digitalAssetCustody.kind, { employeeId: input.employeeId })
  const employee = holder.employee!

  const at = input.issuedAt ? new Date(input.issuedAt) : now
  if (at.getTime() > now.getTime()) throw invalid('The issue date cannot be in the future.', { field: 'issuedAt' })
  // A seat is with one person at a time, in the history as well as today.
  const last = tx.get<{ at: number | null }>(
    sql`select max(returned_at) as at from assignments where kind = ${digitalAssetCustody.kind} and item_id = ${assetId}`,
  )
  if (last?.at != null && at.getTime() < last.at) {
    throw invalid(`The issue date cannot be before ${asset.code} was last unassigned.`, { field: 'issuedAt' })
  }

  const assignmentId = issue(tx, actor, { kind: digitalAssetCustody.kind, itemId: assetId, holder, issuedAt: at })
  writeAudit(tx, actor, {
    action: 'issue',
    entityType: 'digitalasset',
    entityId: assetId,
    details: `${asset.code} → ${employee.code} · ${asset.type}${input.issuedAt ? ` · issued ${at.toISOString().slice(0, 10)}` : ''}`,
    at: now,
  })
  // To the list: a digital asset has no page of its own.
  notify(
    tx,
    actor,
    {
      recipients: accountOf(tx, employee.id),
      kind: 'digital_issued',
      sourceKey: `digital:${assetId}`,
      title: `${asset.code} was issued to you`,
      body: `${asset.type}, issued by ${actor.name}.`,
      link: '/digital-assets',
    },
    now,
  )
  return assignmentId
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
    writeAudit(tx, actor, {
      action: 'create',
      entityType: 'digitalasset',
      entityId: row.id,
      details: `${code} · ${type.name} · ${input.account}`,
      at: now,
    })
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
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'digitalasset',
      entityId: id,
      details: `${current.code} · ${changes.join('; ')}`,
    })
  })
  return getDigitalAsset(db, id)
}

/** Inactive is set by hand and only on a seat nobody holds; it keeps the seat from being issued until it is reactivated. */
export function setDigitalAssetStatus(
  db: Db,
  actor: Actor,
  id: number,
  status: 'in_service' | 'inactive',
): DigitalAssetRow {
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

export function unassignDigitalAsset(db: Db, actor: Actor, id: number, input: DigitalUnassignInput): DigitalAssetRow {
  db.transaction((tx) => {
    const current = getDigitalAsset(tx, id)
    if (!current.employee || current.assignmentId === null) {
      throw conflict('not_assigned', `${current.code} is not issued to anyone.`)
    }
    // The seat was unassigned and issued again since the person asking last looked: what they confirmed is not what is there.
    if (current.assignmentId !== input.assignmentId) {
      throw conflict(
        'assignment_changed',
        `${current.code} is now issued to ${current.employee.name}. Nothing was unassigned.`,
      )
    }
    const now = new Date()
    returnItem(
      tx,
      actor,
      { kind: digitalAssetCustody.kind, assignmentId: current.assignmentId, name: current.code },
      now,
    )
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
      throw conflict(
        'has_history',
        `${current.code} has assignment history. Mark it inactive instead; history is never deleted.`,
      )
    }
    tx.delete(digitalAssets).where(eq(digitalAssets.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'digitalasset',
      entityId: id,
      details: `${current.code} · ${current.type} · ${current.account}`,
    })
  })
}
