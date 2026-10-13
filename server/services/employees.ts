import { eq, sql } from 'drizzle-orm'
import type { EmployeeCreateInput, EmployeeUpdateInput } from '../../shared/schemas.ts'
import type { EmployeeRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, notFound } from '../lib/errors.ts'
import { fullName } from './refs.ts'

interface RawEmployee {
  id: number
  code: string
  firstName: string
  lastName: string
  department: string | null
  jobTitle: string | null
  archivedAt: number | null
  createdAt: number
  held: number
  total: number
  digitalHeld: number
  digitalTotal: number
  assessed: number
  grievances: number
  grievancesOpenOwned: number
  account: string | null
}

/** Deleting is only for a record entered by mistake: anything that points at the employee keeps them. */
function deleteBlocked(row: RawEmployee): { code: string; reason: string } | null {
  if (row.total > 0 || row.digitalTotal > 0) return { code: 'has_history', reason: 'Has assignment history. Archive instead; history is never deleted.' }
  if (row.assessed > 0) {
    return { code: 'has_history', reason: `Assessed the condition on ${row.assessed} ${row.assessed === 1 ? 'record' : 'records'}. Archive instead; history is never deleted.` }
  }
  // Says no more than that: which grievance, and what it is about, is not for the asset side to show.
  if (row.grievances > 0) return { code: 'has_history', reason: 'Named on a grievance. Archive instead; history is never deleted.' }
  if (row.account) return { code: 'linked_user', reason: `Linked to the account ${row.account}. Unlink it on Users first.` }
  return null
}

function toRow(row: RawEmployee): EmployeeRow {
  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    name: fullName(row.firstName, row.lastName),
    department: row.department,
    jobTitle: row.jobTitle,
    state: row.archivedAt ? 'archived' : 'active',
    assetsHeld: row.held,
    digitalHeld: row.digitalHeld,
    openGrievancesOwned: row.grievancesOpenOwned,
    hasHistory: row.total > 0 || row.digitalTotal > 0,
    deleteBlocked: deleteBlocked(row)?.reason ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

const listRaw = (db: DbLike, id?: number) =>
  db
    .all<RawEmployee>(sql`
      select e.id as id, e.code as code, e.first_name as firstName, e.last_name as lastName,
             e.department as department, e.job_title as jobTitle, e.archived_at as archivedAt, e.created_at as createdAt,
             coalesce(sum(case when a.id is not null and a.returned_at is null then 1 else 0 end), 0) as held,
             count(a.id) as total,
             (select count(*) from digital_assignments d where d.employee_id = e.id and d.returned_at is null) as digitalHeld,
             (select count(*) from digital_assignments d where d.employee_id = e.id) as digitalTotal,
             (select count(*) from conditions c where c.assessed_by_id = e.id) as assessed,
             (select count(*) from grievances g where g.owner_id = e.id) + (select count(*) from grievance_people p where p.employee_id = e.id)
               + (select count(*) from grievance_entries x join users du on du.id = x.documented_by_user_id where du.employee_id = e.id) as grievances,
             (select count(*) from grievances g where g.owner_id = e.id and g.status not in ('closed', 'voided')) as grievancesOpenOwned,
             (select min(u.email) from users u where u.employee_id = e.id) as account
      from employees e left join assignments a on a.employee_id = e.id
      ${id ? sql`where e.id = ${id}` : sql``}
      group by e.id
      order by e.last_name collate nocase, e.first_name collate nocase`)

export function listEmployees(db: DbLike, id?: number): EmployeeRow[] {
  return listRaw(db, id).map(toRow)
}

function getEmployee(db: DbLike, id: number): EmployeeRow {
  const row = listEmployees(db, id)[0]
  if (!row) throw notFound('Employee')
  return row
}

function assertCodeFree(db: DbLike, code: string, exceptId?: number) {
  const dup = db.select({ id: employees.id }).from(employees).where(sql`${employees.code} = ${code} collate nocase`).get()
  if (dup && dup.id !== exceptId) {
    throw conflict('duplicate_employee', `Employee ID ${code} already exists.`, { field: 'code' })
  }
}

export function createEmployee(db: Db, actor: Actor, input: EmployeeCreateInput): EmployeeRow {
  const id = db.transaction((tx) => {
    assertCodeFree(tx, input.code)
    const row = tx
      .insert(employees)
      .values({
        code: input.code,
        firstName: input.firstName,
        lastName: input.lastName,
        department: input.department ?? null,
        jobTitle: input.jobTitle ?? null,
      })
      .returning({ id: employees.id })
      .get()
    writeAudit(tx, actor, { action: 'create', entityType: 'employee', entityId: row.id, details: `employee_id=${input.code}` })
    return row.id
  })
  return getEmployee(db, id)
}

export function updateEmployee(db: Db, actor: Actor, id: number, input: EmployeeUpdateInput): EmployeeRow {
  db.transaction((tx) => {
    const current = tx.select().from(employees).where(eq(employees.id, id)).get()
    if (!current) throw notFound('Employee')
    const patch: Partial<typeof employees.$inferInsert> = {}
    const changes: string[] = []
    const track = <K extends 'code' | 'firstName' | 'lastName' | 'department' | 'jobTitle'>(key: K, label: string) => {
      const next = input[key]
      if (next === undefined) return
      const value = (next ?? null) as string | null
      if (value === current[key]) return
      patch[key] = value as never
      changes.push(`${label}: ${current[key] ?? '—'} → ${value ?? '—'}`)
    }
    if (input.code !== undefined && input.code !== current.code) assertCodeFree(tx, input.code, id)
    track('code', 'employee_id')
    track('firstName', 'first_name')
    track('lastName', 'last_name')
    track('department', 'department')
    track('jobTitle', 'job_title')
    if (changes.length === 0) return
    tx.update(employees).set(patch).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, { action: 'update', entityType: 'employee', entityId: id, details: `employee_id=${patch.code ?? current.code} · ${changes.join('; ')}` })
  })
  return getEmployee(db, id)
}

export function setEmployeeArchived(db: Db, actor: Actor, id: number, archived: boolean): EmployeeRow {
  db.transaction((tx) => {
    const current = getEmployee(tx, id)
    if ((current.state === 'archived') === archived) return
    if (archived && current.assetsHeld > 0) {
      throw conflict('holds_assets', `${current.name} still holds ${current.assetsHeld} asset(s). Return them before archiving.`)
    }
    if (archived && current.digitalHeld > 0) {
      throw conflict('holds_assets', `${current.name} still has ${current.digitalHeld} digital asset(s). Unassign them before archiving.`)
    }
    // A grievance that is still open needs an owner who is here. Says how many, never which.
    if (archived && current.openGrievancesOwned > 0) {
      const n = current.openGrievancesOwned
      throw conflict('owns_grievances', `${current.name} owns ${n} ${n === 1 ? 'grievance that is' : 'grievances that are'} not closed. Give ${n === 1 ? 'it' : 'them'} to another owner before archiving.`)
    }
    tx.update(employees).set({ archivedAt: archived ? new Date() : null }).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'employee',
      entityId: id,
      details: `employee_id=${current.code} · ${archived ? 'archived' : 'restored'}`,
    })
  })
  return getEmployee(db, id)
}

export function deleteEmployee(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const raw = listRaw(tx, id)[0]
    if (!raw) throw notFound('Employee')
    const current = toRow(raw)
    const blocked = deleteBlocked(raw)
    if (blocked) throw conflict(blocked.code, `${current.name} cannot be deleted. ${blocked.reason}`)
    tx.delete(employees).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'employee', entityId: id, details: `employee_id=${current.code}` })
  })
}
