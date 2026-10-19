import { and, eq, isNull, sql } from 'drizzle-orm'
import { RATING_ATTENTION_BELOW } from '../../shared/constants.ts'
import type { IssueInput, ReturnBulkInput, ReturnInput } from '../../shared/schemas.ts'
import type { AssignmentRow, ReturnBulkResult } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { assetTypes, assets, assignments, conditions, employees, programs, users } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { HttpError, conflict, invalid, notFound, rowFailure } from '../lib/errors.ts'
import { daysBetween } from '../lib/time.ts'
import { accountOf, notify, sectionTeam } from './notifications.ts'
import { employeeRef, fullName, assessorFor, programRef, requireActiveRating, requireEmployee, requireProgram } from './refs.ts'

interface OpenRow {
  id: number
  assetId: number
  assetTag: string
  assetType: string
  issuedAt: number
  eId: number | null
  eCode: string | null
  eFirst: string | null
  eLast: string | null
  eDept: string | null
  pId: number | null
  pCode: string | null
  pName: string | null
  issueRating: string | null
  issuedByEmail: string
}

const OPEN_SQL = sql`
  select a.id as id, a.asset_id as assetId, s.tag as assetTag, t.name as assetType, a.issued_at as issuedAt,
         e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept,
         p.id as pId, p.code as pCode, p.name as pName,
         r.name as issueRating, u.email as issuedByEmail
  from assignments a
  join assets s on s.id = a.asset_id
  join asset_types t on t.id = s.type_id
  left join employees e on e.id = a.employee_id
  left join programs p on p.id = a.program_id
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
    employee: row.eId === null ? null : { id: row.eId, code: row.eCode!, name: fullName(row.eFirst!, row.eLast!), department: row.eDept },
    program: row.pId === null ? null : { id: row.pId, code: row.pCode!, name: row.pName! },
    issuedAt: issuedAt.toISOString(),
    issueRating: row.issueRating,
    daysOut: daysBetween(issuedAt, now),
    issuedBy: row.issuedByEmail,
  }
}

/** How the audit log names a holder: an Employee ID as it is, a Program ID marked as one. */
const holderCode = (employee: { code: string } | null, program: { code: string } | null) =>
  employee ? employee.code : `program ${program?.code ?? ''}`

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

/**
 * Issue an asset to an employee, or assign it to a program, inside an already-open transaction. Returns the new Assignment id.
 * The holder's account is told, unless `notifyHolder` is false: a pasted import would flood the inboxes.
 */
export function issueInTx(tx: DbLike, actor: Actor, input: IssueInput, now = new Date(), notifyHolder = true): number {
  const found = tx
    .select({ asset: assets, type: assetTypes.name })
    .from(assets)
    .innerJoin(assetTypes, eq(assetTypes.id, assets.typeId))
    .where(eq(assets.id, input.assetId))
    .get()
  if (!found) throw notFound('Asset')
  const { asset } = found
  if (asset.status === 'retired') throw conflict('asset_retired', `${asset.tag} is retired and cannot be issued.`)

  // The schema lets one of the two through; the database checks it again on insert.
  const employee = input.employeeId ? requireEmployee(tx, input.employeeId) : null
  const program = !employee && input.programId ? requireProgram(tx, input.programId) : null
  if (employee?.archivedAt) {
    throw conflict('employee_archived', `${fullName(employee.firstName, employee.lastName)} is archived.`)
  }
  if (program && !program.isActive) throw conflict('program_inactive', `${program.name} is deactivated.`)
  if (!employee && !program) throw invalid('Choose an employee or a program.', { field: 'employeeId' })
  const rating = requireActiveRating(tx, input.conditionRatingId)
  const assessedById = assessorFor(tx, input.assessedById, actor)

  const open = tx
    .select({ id: assignments.id, first: employees.firstName, last: employees.lastName, program: programs.name })
    .from(assignments)
    .leftJoin(employees, eq(employees.id, assignments.employeeId))
    .leftJoin(programs, eq(programs.id, assignments.programId))
    .where(and(eq(assignments.assetId, asset.id), isNull(assignments.returnedAt)))
    .get()
  if (open) {
    const holder = open.program ?? fullName(open.first ?? '', open.last ?? '')
    throw conflict('asset_already_assigned', `${asset.tag} is already assigned to ${holder}.`, {
      assignmentId: open.id,
    })
  }

  const assignment = tx
    .insert(assignments)
    .values({ assetId: asset.id, employeeId: employee?.id ?? null, programId: program?.id ?? null, issuedAt: now, issuedById: actor.id })
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
    details: `${asset.tag} → ${holderCode(employee, program)} · ${rating.name}`,
    at: now,
  })
  if (notifyHolder && employee) {
    notify(
      tx,
      actor,
      {
        recipients: accountOf(tx, employee.id),
        kind: 'asset_issued',
        sourceKey: `asset:${asset.id}`,
        title: `${asset.tag} was issued to you`,
        body: `${found.type}, issued by ${actor.name}.`,
        link: `/assets/${asset.tag}`,
      },
      now,
    )
  }
  return assignment.id
}

export function issueAsset(db: Db, actor: Actor, input: IssueInput): AssignmentRow {
  const id = db.transaction((tx) => issueInTx(tx, actor, input))
  return getAssignment(db, id)!
}

/** Close an Assignment inside an open transaction. */
export function returnInTx(tx: DbLike, actor: Actor, assignmentId: number, input: ReturnInput, now = new Date()) {
  const found = tx
    .select({ assignment: assignments, asset: assets, employee: employees, program: programs })
    .from(assignments)
    .innerJoin(assets, eq(assets.id, assignments.assetId))
    .leftJoin(employees, eq(employees.id, assignments.employeeId))
    .leftJoin(programs, eq(programs.id, assignments.programId))
    .where(eq(assignments.id, assignmentId))
    .get()
  if (!found) throw notFound('Assignment')
  const { assignment, asset, employee, program } = found

  if (assignment.returnedAt) {
    const closer = assignment.returnedById
      ? tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, assignment.returnedById)).get()
      : undefined
    // Not always a colleague a moment ago: it can be the same person in another tab, or a sheet left open since yesterday.
    const byYou = closer?.id === actor.id
    const who = byYou ? ' by you' : closer ? ` by ${closer.email}` : ''
    throw new HttpError(409, 'already_returned', `${asset.tag} has already been returned${who}.`, {
      assignmentId: assignment.id,
      returnedAt: assignment.returnedAt.toISOString(),
      returnedBy: closer?.email ?? null,
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
    details: `${asset.tag} ← ${holderCode(employee, program)} · ${rating.name}`,
    at: now,
  })
  const poor: PoorReturn | null = rating.score < RATING_ATTENTION_BELOW ? { assignmentId: assignment.id, assetId: asset.id, tag: asset.tag, rating: rating.name } : null
  return { assetTag: asset.tag, employee: employee ? employeeRef(employee) : null, program: program ? programRef(program) : null, poor }
}

interface PoorReturn {
  assignmentId: number
  assetId: number
  tag: string
  rating: string
}

/** Tells the Assets team about returns rated in the attention band: one notification however many came back together. */
function notifyPoorReturns(db: DbLike, actor: Actor, returns: PoorReturn[]) {
  const [first] = returns
  if (!first) return
  const recipients = sectionTeam(db, 'assets')
  if (returns.length === 1) {
    notify(db, actor, {
      recipients,
      kind: 'asset_returned_poor',
      sourceKey: `asset:${first.assetId}`,
      title: `${first.tag} came back rated ${first.rating}`,
      link: `/assets/${first.tag}`,
    })
  } else {
    // The Overview's condition watch lists them all.
    notify(db, actor, {
      recipients,
      kind: 'asset_returned_poor',
      sourceKey: `return-bulk:${first.assignmentId}`,
      title: `${returns.length} assets came back in poor condition`,
      body: returns.map((item) => `${item.tag} (${item.rating})`).join(', '),
      link: '/',
    })
  }
}

export function returnAssignment(db: Db, actor: Actor, id: number, input: ReturnInput) {
  return db.transaction((tx) => {
    const { poor, ...returned } = returnInTx(tx, actor, id, input)
    if (poor) notifyPoorReturns(tx, actor, [poor])
    return returned
  })
}

/** Each Assignment is returned on its own so one stale row never blocks the rest. */
export function returnMany(db: Db, actor: Actor, input: ReturnBulkInput): ReturnBulkResult {
  const result: ReturnBulkResult = { returned: [], failed: [] }
  const log = { done: false }
  const poor: PoorReturn[] = []
  for (const id of input.ids) {
    try {
      const returned = db.transaction((tx) => returnInTx(tx, actor, id, input))
      if (returned.poor) poor.push(returned.poor)
      result.returned.push(id)
    } catch (error) {
      result.failed.push({ id, message: rowFailure(error, log) })
    }
  }
  // Sent after the loop, outside the returns' own transactions, so a bulk return makes one notification and not one per row.
  notifyPoorReturns(db, actor, poor)
  return result
}
