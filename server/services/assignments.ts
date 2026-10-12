import { and, eq, isNull, sql } from 'drizzle-orm'
import type { IssueInput, ReturnBulkInput, ReturnInput } from '../../shared/schemas.ts'
import type { AssignmentRow, ReturnBulkResult } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { assetTypes, assets, assignments, conditions, employees, users } from '../db/schema.ts'
import { actorLabel, writeAudit, type Actor } from '../lib/audit.ts'
import { HttpError, conflict, notFound, rowFailure } from '../lib/errors.ts'
import { daysBetween } from '../lib/time.ts'
import { employeeRef, fullName, assessorFor, requireActiveRating, requireEmployee } from './refs.ts'

interface OpenRow {
  id: number
  assetId: number
  assetTag: string
  assetType: string
  issuedAt: number
  eId: number
  eCode: string
  eFirst: string
  eLast: string
  eDept: string | null
  issueRating: string | null
  issuedByEmail: string
}

const OPEN_SQL = sql`
  select a.id as id, a.asset_id as assetId, s.tag as assetTag, t.name as assetType, a.issued_at as issuedAt,
         e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept,
         r.name as issueRating, u.email as issuedByEmail
  from assignments a
  join assets s on s.id = a.asset_id
  join asset_types t on t.id = s.type_id
  join employees e on e.id = a.employee_id
  join users u on u.id = a.issued_by_id
  left join conditions c on c.assignment_id = a.id and c.kind = 'issue'
  left join condition_ratings r on r.id = c.rating_id
  where a.returned_at is null`

function toRow(row: OpenRow, now: Date): AssignmentRow {
  const issuedAt = new Date(row.issuedAt)
  return {
    id: row.id,
    assetId: row.assetId,
    assetTag: row.assetTag,
    assetType: row.assetType,
    employee: { id: row.eId, code: row.eCode, name: fullName(row.eFirst, row.eLast), department: row.eDept },
    issuedAt: issuedAt.toISOString(),
    issueRating: row.issueRating,
    daysOut: daysBetween(issuedAt, now),
    issuedBy: actorLabel(row.issuedByEmail),
  }
}

/** Open Assignments, longest-out first. */
export function listOpenAssignments(db: DbLike): AssignmentRow[] {
  const now = new Date()
  return db.all<OpenRow>(sql`${OPEN_SQL} order by a.issued_at asc, a.id asc`).map((row) => toRow(row, now))
}

export function getAssignment(db: DbLike, id: number): AssignmentRow | null {
  const now = new Date()
  const row = db.all<OpenRow>(sql`${OPEN_SQL} and a.id = ${id}`)[0]
  return row ? toRow(row, now) : null
}

/** Issue an asset inside an already-open transaction. Returns the new Assignment id. */
export function issueInTx(tx: DbLike, actor: Actor, input: IssueInput, now = new Date()): number {
  const found = tx
    .select({ asset: assets, type: assetTypes.name })
    .from(assets)
    .innerJoin(assetTypes, eq(assetTypes.id, assets.typeId))
    .where(eq(assets.id, input.assetId))
    .get()
  if (!found) throw notFound('Asset')
  const { asset } = found
  if (asset.status === 'retired') throw conflict('asset_retired', `${asset.tag} is retired and cannot be issued.`)

  const employee = requireEmployee(tx, input.employeeId)
  if (employee.archivedAt) {
    throw conflict('employee_archived', `${fullName(employee.firstName, employee.lastName)} is archived.`)
  }
  const rating = requireActiveRating(tx, input.conditionRatingId)
  const assessedById = assessorFor(tx, input.assessedById, actor)

  const open = tx
    .select({ id: assignments.id, first: employees.firstName, last: employees.lastName })
    .from(assignments)
    .innerJoin(employees, eq(employees.id, assignments.employeeId))
    .where(and(eq(assignments.assetId, asset.id), isNull(assignments.returnedAt)))
    .get()
  if (open) {
    throw conflict('asset_already_assigned', `${asset.tag} is already assigned to ${fullName(open.first, open.last)}.`, {
      assignmentId: open.id,
    })
  }

  const assignment = tx
    .insert(assignments)
    .values({ assetId: asset.id, employeeId: employee.id, issuedAt: now, issuedById: actor.id })
    .returning({ id: assignments.id })
    .get()
  tx.insert(conditions)
    .values({
      assetId: asset.id,
      assignmentId: assignment.id,
      kind: 'issue',
      ratingId: rating.id,
      assessedById,
      notes: input.notes ?? null,
      recordedById: actor.id,
      recordedAt: now,
    })
    .run()
  writeAudit(tx, actor, {
    action: 'issue',
    entityType: 'assignment',
    entityId: assignment.id,
    details: `${asset.tag} → ${employee.code} · ${rating.name}`,
    at: now,
  })
  return assignment.id
}

export function issueAsset(db: Db, actor: Actor, input: IssueInput): AssignmentRow {
  const id = db.transaction((tx) => issueInTx(tx, actor, input))
  return getAssignment(db, id)!
}

/** Close an Assignment inside an open transaction. */
export function returnInTx(tx: DbLike, actor: Actor, assignmentId: number, input: ReturnInput, now = new Date()) {
  const found = tx
    .select({ assignment: assignments, asset: assets, employee: employees })
    .from(assignments)
    .innerJoin(assets, eq(assets.id, assignments.assetId))
    .innerJoin(employees, eq(employees.id, assignments.employeeId))
    .where(eq(assignments.id, assignmentId))
    .get()
  if (!found) throw notFound('Assignment')
  const { assignment, asset, employee } = found

  if (assignment.returnedAt) {
    const closer = assignment.returnedById
      ? tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, assignment.returnedById)).get()
      : undefined
    // Not always a colleague a moment ago: it can be the same person in another tab, or a sheet left open since yesterday.
    const byYou = closer?.id === actor.id
    const who = byYou ? ' by you' : closer ? ` by ${actorLabel(closer.email)}` : ''
    throw new HttpError(409, 'already_returned', `${asset.tag} has already been returned${who}.`, {
      assignmentId: assignment.id,
      returnedAt: assignment.returnedAt.toISOString(),
      returnedBy: closer ? actorLabel(closer.email) : null,
      returnedByYou: byYou,
    })
  }

  const rating = requireActiveRating(tx, input.conditionRatingId)
  const assessedById = assessorFor(tx, input.assessedById, actor)

  tx.update(assignments).set({ returnedAt: now, returnedById: actor.id }).where(eq(assignments.id, assignment.id)).run()
  tx.insert(conditions)
    .values({
      assetId: asset.id,
      assignmentId: assignment.id,
      kind: 'return',
      ratingId: rating.id,
      assessedById,
      notes: input.notes ?? null,
      recordedById: actor.id,
      recordedAt: now,
    })
    .run()
  writeAudit(tx, actor, {
    action: 'return',
    entityType: 'assignment',
    entityId: assignment.id,
    details: `${asset.tag} ← ${employee.code} · ${rating.name}`,
    at: now,
  })
  return { assetTag: asset.tag, employee: employeeRef(employee) }
}

export function returnAssignment(db: Db, actor: Actor, id: number, input: ReturnInput) {
  return db.transaction((tx) => returnInTx(tx, actor, id, input))
}

/** Each Assignment is returned on its own so one stale row never blocks the rest. */
export function returnMany(db: Db, actor: Actor, input: ReturnBulkInput): ReturnBulkResult {
  const result: ReturnBulkResult = { returned: [], failed: [] }
  const log = { done: false }
  for (const id of input.ids) {
    try {
      db.transaction((tx) => returnInTx(tx, actor, id, input))
      result.returned.push(id)
    } catch (error) {
      result.failed.push({ id, message: rowFailure(error, log) })
    }
  }
  return result
}
