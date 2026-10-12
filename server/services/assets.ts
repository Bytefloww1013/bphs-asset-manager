import { eq, sql, type SQL } from 'drizzle-orm'
import { defaultRating } from '../../shared/constants.ts'
import { assetBulkRowFields, type AssetBulkInput, type AssetCreateInput, type AssetUpdateInput } from '../../shared/schemas.ts'
import type {
  AssetBulkResult,
  AssetDetail,
  AssetRow,
  ConditionEntry,
  ConditionSummary,
  HistoryRow,
} from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { assetTypes, assets, conditionRatings, conditions, employees } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound, rowFailure } from '../lib/errors.ts'
import { describeRowProblem } from '../lib/rows.ts'
import { daysBetween } from '../lib/time.ts'
import { issueInTx } from './assignments.ts'
import { assessorFor, fullName, requireActiveRating } from './refs.ts'

interface AssetBase {
  id: number
  tag: string
  typeId: number
  type: string
  serial: string | null
  status: 'in_service' | 'retired'
  createdAt: number
}
interface OpenAssignment {
  assetId: number
  assignmentId: number
  issuedAt: number
  eId: number | null
  eCode: string | null
  eFirst: string | null
  eLast: string | null
  eDept: string | null
  pId: number | null
  pCode: string | null
  pName: string | null
}
interface LatestCondition {
  assetId: number
  ratingId: number
  rating: string
  notes: string | null
  recordedAt: number
}

/** Every asset with its derived state, holder, latest condition and days out. */
export function loadAssetRows(db: DbLike, only?: { id?: number; tag?: string }): AssetRow[] {
  const now = new Date()
  const where = only?.id
    ? sql`where s.id = ${only.id}`
    : only?.tag
      ? sql`where s.tag = ${only.tag}`
      : sql``
  const base = db.all<AssetBase>(sql`
    select s.id as id, s.tag as tag, s.type_id as typeId, t.name as type, s.serial as serial,
           s.status as status, s.created_at as createdAt
    from assets s join asset_types t on t.id = s.type_id ${where}
    order by s.tag collate nocase`)
  if (base.length === 0) return []
  // Asked for one asset, read only its rows below instead of every asset's.
  const one = only ? base[0]!.id : null
  const forOne = (column: SQL, word: 'and' | 'where') => (one === null ? sql`` : sql`${sql.raw(word)} ${column} = ${one}`)

  const open = new Map(
    db
      .all<OpenAssignment>(sql`
        select a.asset_id as assetId, a.id as assignmentId, a.issued_at as issuedAt,
               e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept,
               p.id as pId, p.code as pCode, p.name as pName
        from assignments a left join employees e on e.id = a.employee_id left join programs p on p.id = a.program_id
        where a.returned_at is null ${forOne(sql`a.asset_id`, 'and')}`)
      .map((row) => [row.assetId, row]),
  )
  const latest = new Map(
    db
      .all<LatestCondition>(sql`
        select c.asset_id as assetId, c.rating_id as ratingId, r.name as rating, c.notes as notes, c.recorded_at as recordedAt
        from conditions c join condition_ratings r on r.id = c.rating_id
        where c.id in (select max(id) from conditions ${forOne(sql`asset_id`, 'where')} group by asset_id)`)
      .map((row) => [row.assetId, row]),
  )
  const returned = new Map(
    db
      .all<{ assetId: number; at: number }>(
        sql`select asset_id as assetId, max(returned_at) as at from assignments where returned_at is not null ${forOne(sql`asset_id`, 'and')} group by asset_id`,
      )
      .map((row) => [row.assetId, row.at]),
  )
  const counts = new Map(
    db
      .all<{ assetId: number; n: number }>(sql`select asset_id as assetId, count(*) as n from assignments ${forOne(sql`asset_id`, 'where')} group by asset_id`)
      .map((row) => [row.assetId, row.n]),
  )

  return base.map((row): AssetRow => {
    const assignment = open.get(row.id)
    const last = latest.get(row.id)
    const condition: ConditionSummary | null = last
      ? { ratingId: last.ratingId, rating: last.rating, notes: last.notes, recordedAt: new Date(last.recordedAt).toISOString() }
      : null
    const lastReturned = returned.get(row.id)
    const issuedAt = assignment ? new Date(assignment.issuedAt) : null
    return {
      id: row.id,
      tag: row.tag,
      typeId: row.typeId,
      type: row.type,
      serial: row.serial,
      status: row.status,
      state: row.status === 'retired' ? 'retired' : assignment ? 'assigned' : 'in_storage',
      holder:
        assignment && assignment.eId !== null
          ? {
              id: assignment.eId,
              code: assignment.eCode!,
              name: fullName(assignment.eFirst!, assignment.eLast!),
              department: assignment.eDept,
            }
          : null,
      program: assignment && assignment.pId !== null ? { id: assignment.pId, code: assignment.pCode!, name: assignment.pName! } : null,
      assignmentId: assignment?.assignmentId ?? null,
      condition,
      issuedAt: issuedAt ? issuedAt.toISOString() : null,
      daysOut: issuedAt ? daysBetween(issuedAt, now) : null,
      lastReturnedAt: lastReturned ? new Date(lastReturned).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      hasHistory: (counts.get(row.id) ?? 0) > 0,
    }
  })
}

export function getAssetRow(db: DbLike, id: number): AssetRow {
  const row = loadAssetRows(db, { id })[0]
  if (!row) throw notFound('Asset')
  return row
}

export function getAssetDetail(db: DbLike, tag: string): AssetDetail {
  const asset = loadAssetRows(db, { tag: tag.toUpperCase() })[0]
  if (!asset) throw notFound('Asset')
  const now = new Date()

  const history = db
    .all<{
      id: number
      issuedAt: number
      returnedAt: number | null
      eId: number | null
      eCode: string | null
      eFirst: string | null
      eLast: string | null
      eDept: string | null
      pId: number | null
      pCode: string | null
      pName: string | null
      issueRating: string | null
      returnRating: string | null
      issuedBy: string
      returnedBy: string | null
    }>(sql`
      select a.id as id, a.issued_at as issuedAt, a.returned_at as returnedAt,
             e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept,
             p.id as pId, p.code as pCode, p.name as pName,
             ri.name as issueRating, rr.name as returnRating, ui.email as issuedBy, ur.email as returnedBy
      from assignments a
      left join employees e on e.id = a.employee_id
      left join programs p on p.id = a.program_id
      join users ui on ui.id = a.issued_by_id
      left join users ur on ur.id = a.returned_by_id
      left join conditions ci on ci.assignment_id = a.id and ci.kind = 'issue'
      left join condition_ratings ri on ri.id = ci.rating_id
      left join conditions cr on cr.assignment_id = a.id and cr.kind = 'return'
      left join condition_ratings rr on rr.id = cr.rating_id
      where a.asset_id = ${asset.id}
      order by a.issued_at desc, a.id desc`)
    .map((row): HistoryRow => {
      const issuedAt = new Date(row.issuedAt)
      const returnedAt = row.returnedAt ? new Date(row.returnedAt) : null
      return {
        id: row.id,
        employee: row.eId === null ? null : { id: row.eId, code: row.eCode!, name: fullName(row.eFirst!, row.eLast!), department: row.eDept },
        program: row.pId === null ? null : { id: row.pId, code: row.pCode!, name: row.pName! },
        issuedAt: issuedAt.toISOString(),
        returnedAt: returnedAt ? returnedAt.toISOString() : null,
        issueRating: row.issueRating,
        returnRating: row.returnRating,
        issuedBy: row.issuedBy,
        returnedBy: row.returnedBy,
        daysHeld: daysBetween(issuedAt, returnedAt ?? now),
      }
    })

  const entries = db
    .all<{
      id: number
      kind: ConditionEntry['kind']
      rating: string
      notes: string | null
      first: string | null
      last: string | null
      recordedBy: string
      recordedAt: number
      assignmentId: number | null
    }>(sql`
      select c.id as id, c.kind as kind, r.name as rating, c.notes as notes, e.first_name as first, e.last_name as last,
             u.email as recordedBy, c.recorded_at as recordedAt, c.assignment_id as assignmentId
      from conditions c
      join condition_ratings r on r.id = c.rating_id
      join users u on u.id = c.recorded_by_id
      left join employees e on e.id = c.assessed_by_id
      where c.asset_id = ${asset.id}
      order by c.recorded_at desc, c.id desc`)
    .map(
      (row): ConditionEntry => ({
        id: row.id,
        kind: row.kind,
        rating: row.rating,
        notes: row.notes,
        assessedBy: row.first && row.last ? fullName(row.first, row.last) : null,
        recordedBy: row.recordedBy,
        recordedAt: new Date(row.recordedAt).toISOString(),
        assignmentId: row.assignmentId,
      }),
    )

  return { asset, history, conditions: entries }
}

function requireType(db: DbLike, id: number) {
  const type = db.select().from(assetTypes).where(eq(assetTypes.id, id)).get()
  if (!type || !type.isActive) throw invalid('Choose an active asset type.', { field: 'typeId' })
  return type
}

function assertTagFree(db: DbLike, tag: string, exceptId?: number) {
  const dup = db.select({ id: assets.id }).from(assets).where(sql`${assets.tag} = ${tag} collate nocase`).get()
  if (dup && dup.id !== exceptId) {
    throw conflict('duplicate_tag', `Asset tag ${tag} already exists.`, { field: 'tag' })
  }
}

function createInTx(tx: DbLike, actor: Actor, input: AssetCreateInput, now: Date): number {
  const type = requireType(tx, input.typeId)
  const rating = requireActiveRating(tx, input.conditionRatingId)
  assertTagFree(tx, input.tag)

  const asset = tx
    .insert(assets)
    .values({ tag: input.tag, typeId: type.id, serial: input.serial ?? null, createdAt: now })
    .returning({ id: assets.id })
    .get()
  writeAudit(tx, actor, { action: 'create', entityType: 'asset', entityId: asset.id, details: `${input.tag} · ${type.name}`, at: now })

  if (input.holderId || input.programId) {
    issueInTx(
      tx,
      actor,
      {
        assetId: asset.id,
        employeeId: input.holderId,
        programId: input.programId,
        conditionRatingId: rating.id,
        assessedById: input.assessedById,
        notes: input.notes,
      },
      now,
    )
  } else {
    tx.insert(conditions)
      .values({
        assetId: asset.id,
        kind: 'intake',
        ratingId: rating.id,
        assessedById: assessorFor(tx, input.assessedById, actor),
        notes: input.notes ?? null,
        recordedById: actor.id,
        recordedAt: now,
      })
      .run()
  }
  return asset.id
}

export function createAsset(db: Db, actor: Actor, input: AssetCreateInput): AssetRow {
  const id = db.transaction((tx) => createInTx(tx, actor, input, new Date()))
  return getAssetRow(db, id)
}

/** Paste-from-spreadsheet import. Rows are independent; bad rows are reported by number. */
export function createAssetsBulk(db: Db, actor: Actor, input: AssetBulkInput): AssetBulkResult {
  const types = db.select().from(assetTypes).all()
  const ratings = db.select().from(conditionRatings).all().filter((rating) => rating.isActive)
  const people = db.select().from(employees).all().filter((employee) => !employee.archivedAt)
  const byName = <T extends { name: string }>(list: T[], value: string) =>
    list.find((item) => item.name.toLowerCase() === value.toLowerCase())
  const fallbackRating = defaultRating(ratings)

  const result: AssetBulkResult = { created: 0, errors: [] }
  const log = { done: false }
  input.rows.forEach((row, index) => {
    const line = index + 1
    const fail = (message: string) => result.errors.push({ row: line, message })
    if (!row.tag) return fail('Missing asset tag.')
    const fields = assetBulkRowFields.safeParse({ tag: row.tag, serial: row.serial })
    if (!fields.success) return fail(`${describeRowProblem(fields.error, { tag: 'Asset tag', serial: 'Serial number' })}.`)
    const type = byName(types, row.type)
    if (!type || !type.isActive) return fail(`Unknown asset type "${row.type}".`)
    const rating = row.condition ? byName(ratings, row.condition) : fallbackRating
    if (!rating) return fail(`Unknown condition "${row.condition ?? ''}".`)
    let holderId: number | null = null
    if (row.holder) {
      const q = row.holder.toLowerCase()
      const matches = people.filter((e) => e.code.toLowerCase() === q || fullName(e.firstName, e.lastName).toLowerCase() === q)
      if (matches.length !== 1) return fail(matches.length === 0 ? `No employee matches "${row.holder}".` : `"${row.holder}" matches more than one employee.`)
      holderId = matches[0]!.id
    }
    try {
      db.transaction((tx) =>
        createInTx(
          tx,
          actor,
          {
            tag: fields.data.tag,
            typeId: type.id,
            serial: fields.data.serial ?? null,
            conditionRatingId: rating.id,
            holderId,
          },
          new Date(),
        ),
      )
      result.created += 1
    } catch (error) {
      fail(rowFailure(error, log))
    }
  })
  return result
}

export function updateAsset(db: Db, actor: Actor, id: number, input: AssetUpdateInput): AssetRow {
  db.transaction((tx) => {
    const current = tx.select().from(assets).where(eq(assets.id, id)).get()
    if (!current) throw notFound('Asset')
    const changes: string[] = []
    const patch: Partial<typeof assets.$inferInsert> = {}

    if (input.tag !== undefined && input.tag !== current.tag) {
      assertTagFree(tx, input.tag, id)
      patch.tag = input.tag
      changes.push(`tag: ${current.tag} → ${input.tag}`)
    }
    if (input.typeId !== undefined && input.typeId !== current.typeId) {
      const before = tx.select().from(assetTypes).where(eq(assetTypes.id, current.typeId)).get()
      const next = requireType(tx, input.typeId)
      patch.typeId = next.id
      changes.push(`type: ${before?.name ?? current.typeId} → ${next.name}`)
    }
    if (input.serial !== undefined && (input.serial ?? null) !== current.serial) {
      patch.serial = input.serial ?? null
      changes.push(`serial: ${current.serial ?? '—'} → ${input.serial ?? '—'}`)
    }
    if (changes.length === 0) return
    tx.update(assets).set(patch).where(eq(assets.id, id)).run()
    writeAudit(tx, actor, { action: 'update', entityType: 'asset', entityId: id, details: `${patch.tag ?? current.tag} · ${changes.join('; ')}` })
  })
  return getAssetRow(db, id)
}

export function setAssetStatus(db: Db, actor: Actor, id: number, status: 'in_service' | 'retired'): AssetRow {
  db.transaction((tx) => {
    const current = getAssetRow(tx, id)
    if (current.status === status) return
    if (status === 'retired' && current.state === 'assigned') {
      throw conflict('asset_assigned', `${current.tag} is assigned to ${(current.holder ?? current.program)?.name}. Return it before retiring.`)
    }
    tx.update(assets).set({ status }).where(eq(assets.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'asset',
      entityId: id,
      details: `${current.tag} · status: ${current.status} → ${status}`,
    })
  })
  return getAssetRow(db, id)
}

export function deleteAsset(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const current = getAssetRow(tx, id)
    if (current.hasHistory) {
      throw conflict('has_history', `${current.tag} has assignment history. Retire it instead; history is never deleted.`)
    }
    tx.delete(assets).where(eq(assets.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'asset', entityId: id, details: `${current.tag} · ${current.type}` })
  })
}
