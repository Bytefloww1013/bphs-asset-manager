// The custody ledger's API (issue #23), for the modules whose items are issued. Each checks its own rules first, in its own words
// and order; `issue()` and `returnItem()` hold the ledger's again, whatever the caller checked.
import { employees, fullName, requireEmployee } from '#foundation/employees/server/index.ts'
import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import { programs, requireProgram } from '#foundation/programs/server/index.ts'
import type { ProgramRef } from '#foundation/programs/shared/index.ts'
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import type { DbLike } from '#kernel/db/client.ts'
import { users } from '#kernel/db/schema.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { HttpError, conflict, invalid, notFound } from '#kernel/lib/errors.ts'
import { allowHolder, custodyKind, type Holder } from './kinds.ts'
import { assignments } from './schema.ts'

/** Who an issue gives the item to, as `requireHolder()` found them: one of the two. */
export interface CustodyHolder {
  employee: typeof employees.$inferSelect | null
  program: typeof programs.$inferSelect | null
}

/** An assignment and its holder. */
export interface CustodyRecord {
  id: number
  itemId: number
  employee: EmployeeRef | null
  program: ProgramRef | null
  issuedAt: Date
  returnedAt: Date | null
  /** The emails of the accounts that issued it and took it back. */
  issuedBy: string
  returnedBy: string | null
}

interface RawRecord {
  id: number
  itemId: number
  issuedAt: number
  returnedAt: number | null
  issuedBy: string
  returnedBy: string | null
  eId: number | null
  eCode: string | null
  eFirst: string | null
  eLast: string | null
  eDept: string | null
  pId: number | null
  pCode: string | null
  pName: string | null
}

const RECORD_SQL = sql`
  select a.id as id, a.item_id as itemId, a.issued_at as issuedAt, a.returned_at as returnedAt,
         ui.email as issuedBy, ur.email as returnedBy,
         e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept,
         p.id as pId, p.code as pCode, p.name as pName
  from assignments a
  left join employees e on e.id = a.employee_id
  left join programs p on p.id = a.program_id
  join users ui on ui.id = a.issued_by_id
  left join users ur on ur.id = a.returned_by_id`

const toRecord = (row: RawRecord): CustodyRecord => ({
  id: row.id,
  itemId: row.itemId,
  employee:
    row.eId === null
      ? null
      : { id: row.eId, code: row.eCode!, name: fullName(row.eFirst!, row.eLast!), department: row.eDept },
  program: row.pId === null ? null : { id: row.pId, code: row.pCode!, name: row.pName! },
  issuedAt: new Date(row.issuedAt),
  returnedAt: row.returnedAt === null ? null : new Date(row.returnedAt),
  issuedBy: row.issuedBy,
  returnedBy: row.returnedBy,
})

const inList = (column: SQL, ids: readonly number[]) =>
  sql`${column} in (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`

/** The holder an issue names: there, active, and one the kind allows. */
export function requireHolder(
  db: DbLike,
  kind: string,
  input: { employeeId?: number | null; programId?: number | null },
): CustodyHolder {
  // The schema lets one of the two through; the database checks it again on insert.
  const employee = input.employeeId ? requireEmployee(db, input.employeeId) : null
  const program = !employee && input.programId ? requireProgram(db, input.programId) : null
  if (employee?.archivedAt) {
    throw conflict('employee_archived', `${fullName(employee.firstName, employee.lastName)} is archived.`)
  }
  if (program && !program.isActive) throw conflict('program_inactive', `${program.name} is deactivated.`)
  if (!employee && !program) throw invalid('Choose an employee or a program.', { field: 'employeeId' })
  allowHolder(custodyKind(kind), employee ? 'employee' : 'program')
  return { employee, program }
}

/** The open assignment of each item of the kind that has one: of these items, or of all of them. */
export function openFor(db: DbLike, kind: string, itemIds?: readonly number[]): Map<number, CustodyRecord> {
  if (itemIds?.length === 0) return new Map()
  const rows = db.all<RawRecord>(sql`${RECORD_SQL}
    where a.kind = ${kind} and a.returned_at is null ${itemIds ? sql`and ${inList(sql`a.item_id`, itemIds)}` : sql``}`)
  return new Map(rows.map((row) => [row.itemId, toRecord(row)]))
}

/** Everyone who has held the item, newest first. */
export function historyOf(db: DbLike, kind: string, itemId: number): CustodyRecord[] {
  return db
    .all<RawRecord>(sql`${RECORD_SQL}
      where a.kind = ${kind} and a.item_id = ${itemId}
      order by a.issued_at desc, a.id desc`)
    .map(toRecord)
}

/** How many of each kind a holder has now and has ever had. */
export type HeldCounts = ReadonlyMap<string, { held: number; total: number }>

/** What each employee or program has held, by kind: these holders, or all of them. One that never held anything is left out. */
export function heldBy(db: DbLike, holder: Holder, ids?: readonly number[]): Map<number, HeldCounts> {
  if (ids?.length === 0) return new Map()
  const column = sql.raw(holder === 'employee' ? 'a.employee_id' : 'a.program_id')
  const rows = db.all<{ holderId: number; kind: string; held: number; total: number }>(sql`
    select ${column} as holderId, a.kind as kind, sum(a.returned_at is null) as held, count(*) as total
    from assignments a
    where ${column} is not null ${ids ? sql`and ${inList(column, ids)}` : sql``}
    group by ${column}, a.kind`)
  const counts = new Map<number, Map<string, { held: number; total: number }>>()
  for (const row of rows) {
    const byKind = counts.get(row.holderId) ?? new Map<string, { held: number; total: number }>()
    byKind.set(row.kind, { held: row.held, total: row.total })
    counts.set(row.holderId, byKind)
  }
  return counts
}

/** Gives the item to the holder from `issuedAt`, inside the caller's transaction. Returns the new assignment's id. */
export function issue(
  tx: DbLike,
  actor: Actor,
  request: { kind: string; itemId: number; holder: CustodyHolder; issuedAt: Date },
): number {
  const kind = custodyKind(request.kind)
  const blocked = kind.issueBlocked(tx, request.itemId)
  if (blocked) throw conflict(blocked.code, blocked.reason)
  const { employee, program } = request.holder
  allowHolder(kind, employee ? 'employee' : 'program')
  const open = openFor(tx, kind.kind, [request.itemId]).get(request.itemId)
  if (open) {
    throw conflict('asset_already_assigned', `That ${kind.label} is already assigned. ${kind.release} it first.`, {
      assignmentId: open.id,
    })
  }
  return tx
    .insert(assignments)
    .values({
      kind: kind.kind,
      itemId: request.itemId,
      employeeId: employee?.id ?? null,
      programId: program?.id ?? null,
      issuedAt: request.issuedAt,
      issuedById: actor.id,
    })
    .returning({ id: assignments.id })
    .get().id
}

/**
 * Closes an open assignment of the kind at `returnedAt`, inside the caller's transaction. `name` is the item's, as its page shows
 * it, for the 409 when it was already returned.
 */
export function returnItem(
  tx: DbLike,
  actor: Actor,
  request: { kind: string; assignmentId: number; name: string },
  returnedAt: Date,
) {
  const assignment = tx
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, request.assignmentId), eq(assignments.kind, request.kind)))
    .get()
  if (!assignment) throw notFound('Assignment')
  if (assignment.returnedAt) {
    const closer = assignment.returnedById
      ? tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, assignment.returnedById)).get()
      : undefined
    // Not always a colleague a moment ago: it can be the same person in another tab, or a sheet left open since yesterday.
    const byYou = closer?.id === actor.id
    const who = byYou ? ' by you' : closer ? ` by ${closer.email}` : ''
    throw new HttpError(409, 'already_returned', `${request.name} has already been returned${who}.`, {
      assignmentId: assignment.id,
      returnedAt: assignment.returnedAt.toISOString(),
      returnedBy: closer?.email ?? null,
      returnedByYou: byYou,
    })
  }
  tx.update(assignments)
    .set({ returnedAt, returnedById: actor.id })
    .where(and(eq(assignments.id, assignment.id), isNull(assignments.returnedAt)))
    .run()
}
