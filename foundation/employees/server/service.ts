import { writeAudit } from '#foundation/audit/server/index.ts'
import { employees } from './schema.ts'
import {
  employeeImporter,
  type EmployeeCreateInput,
  type EmployeeRow,
  type EmployeeUpdateInput,
} from '../shared/index.ts'
import { eq, sql } from 'drizzle-orm'
import { WORKSPACES } from '#shared/constants.ts'
import { canUseWorkspace, type Grantee } from '#shared/permissions.ts'
import { permissionResources } from '#shared/registry.ts'
import type { Db, DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, notFound } from '#kernel/lib/errors.ts'
import type { Blocker, ImportStore } from '#kernel/modules.ts'
import { hooks } from '#kernel/registry.ts'
import { fullName } from './refs.ts'
import {
  employeesWhere,
  HIDDEN_BLOCK,
  type EmployeeFigures,
  type EmployeeReference,
  type EmployeeViewer,
} from './references.ts'

interface RawEmployee {
  id: number
  code: string
  firstName: string
  lastName: string
  department: string | null
  jobTitle: string | null
  archivedAt: number | null
  createdAt: number
  account: string | null
}

/** An employee no module has anything on. */
const NO_FIGURES: EmployeeFigures = {
  assetsHeld: 0,
  digitalHeld: 0,
  openGrievancesOwned: 0,
  openReviewsReviewing: 0,
  openCapsResponsible: 0,
  hasHistory: false,
}

/** Every module's answer about these employees (all of them, with `ids` left out), by employee, in registry order. */
function referencesOf(db: DbLike, viewer: EmployeeViewer, ids?: readonly number[]) {
  const answers = hooks('employee.references').map((references) => references(db, viewer, ids))
  return (id: number): EmployeeReference[] => answers.flatMap((answer) => answer.get(id) ?? [])
}

/** Deleting is only for a record entered by mistake: anything that points at the employee keeps them. */
function deleteBlocker(row: RawEmployee, references: readonly EmployeeReference[]): Blocker | null {
  const blocker = references.find((reference) => reference.deleteBlocker)?.deleteBlocker
  if (blocker) return blocker
  if (row.account)
    return {
      code: 'linked_user',
      reason: `Linked to the account ${row.account}. Link that account to someone else on Users first.`,
    }
  return null
}

/** Workspaces whose records belong to accounts, not employees (`aboutAccounts`), so nothing about an employee is kept there. */
const ACCOUNT_WORKSPACES: readonly string[] = permissionResources()
  .filter((resource) => resource.aboutAccounts)
  .map((resource) => resource.key)
const seesEverything = (user: Grantee) =>
  WORKSPACES.filter((workspace) => !ACCOUNT_WORKSPACES.includes(workspace)).every((workspace) =>
    canUseWorkspace(user, workspace),
  )

/** An employee as `viewer` may see them: each module leaves out of its figures what the viewer may not see there. */
function toRow(row: RawEmployee, references: readonly EmployeeReference[], viewer: Grantee): EmployeeRow {
  const figures = { ...NO_FIGURES }
  for (const reference of references) Object.assign(figures, reference.figures)
  const blocker = deleteBlocker(row, references)
  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    name: fullName(row.firstName, row.lastName),
    department: row.department,
    jobTitle: row.jobTitle,
    state: row.archivedAt ? 'archived' : 'active',
    ...figures,
    deleteBlocked: blocker && (seesEverything(viewer) ? blocker.reason : HIDDEN_BLOCK),
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

const listRaw = (db: DbLike, ids?: readonly number[]) =>
  db.all<RawEmployee>(sql`
    select e.id as id, e.code as code, e.first_name as firstName, e.last_name as lastName,
           e.department as department, e.job_title as jobTitle, e.archived_at as archivedAt, e.created_at as createdAt,
           (select min(u.email) from users u where u.employee_id = e.id) as account
    from employees e ${employeesWhere(ids)}
    order by e.last_name collate nocase, e.first_name collate nocase`)

/** Every employee, or one, as `viewer` may see them. */
export function listEmployees(db: DbLike, viewer: EmployeeViewer, id?: number): EmployeeRow[] {
  const ids = id ? [id] : undefined
  const references = referencesOf(db, viewer, ids)
  return listRaw(db, ids).map((row) => toRow(row, references(row.id), viewer))
}

function getEmployee(db: DbLike, viewer: EmployeeViewer, id: number): EmployeeRow {
  const row = listEmployees(db, viewer, id)[0]
  if (!row) throw notFound('Employee')
  return row
}

/** One employee, and what every module has to do with them. */
function loadEmployee(db: DbLike, viewer: EmployeeViewer, id: number) {
  const row = listRaw(db, [id])[0]
  if (!row) throw notFound('Employee')
  return { row, name: fullName(row.firstName, row.lastName), references: referencesOf(db, viewer, [id])(id) }
}

function assertCodeFree(db: DbLike, code: string, exceptId?: number) {
  const dup = db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`${employees.code} = ${code} collate nocase`)
    .get()
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
    writeAudit(tx, actor, {
      action: 'create',
      entityType: 'employee',
      entityId: row.id,
      details: `employee_id=${input.code}`,
    })
    return row.id
  })
  return getEmployee(db, actor, id)
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
      const value = next ?? null
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
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'employee',
      entityId: id,
      details: `employee_id=${patch.code ?? current.code} · ${changes.join('; ')}`,
    })
  })
  return getEmployee(db, actor, id)
}

export function setEmployeeArchived(db: Db, actor: Actor, id: number, archived: boolean): EmployeeRow {
  db.transaction((tx) => {
    const { row, name, references } = loadEmployee(tx, actor, id)
    if (!!row.archivedAt === archived) return
    // Something of another module still needs them here. Each says how many, never which, and nothing the actor may not see.
    const blocker = archived && references.find((reference) => reference.archiveBlocker)?.archiveBlocker
    if (blocker) throw conflict(blocker.code, `${name} ${blocker.reason}`)
    tx.update(employees)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(employees.id, id))
      .run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'employee',
      entityId: id,
      details: `employee_id=${row.code} · ${archived ? 'archived' : 'restored'}`,
    })
  })
  return getEmployee(db, actor, id)
}

export function deleteEmployee(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const { row, name, references } = loadEmployee(tx, actor, id)
    const blocked = deleteBlocker(row, references)
    if (blocked)
      throw conflict(
        blocked.code,
        `${name} cannot be deleted. ${seesEverything(actor) ? blocked.reason : HIDDEN_BLOCK}`,
      )
    tx.delete(employees).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'employee',
      entityId: id,
      details: `employee_id=${row.code}`,
    })
  })
}

/** The Import page's employees: a row whose Employee ID is taken is skipped, never updated. */
export const employeeImport: ImportStore = {
  importer: employeeImporter,
  existingKeys: (db) =>
    db
      .select({ code: employees.code })
      .from(employees)
      .all()
      .map((row) => row.code),
  create(tx, actor, record) {
    const row = tx
      .insert(employees)
      .values({
        code: record.code!,
        firstName: record.firstName!,
        lastName: record.lastName!,
        department: record.department || null,
        jobTitle: record.jobTitle || null,
      })
      .returning({ id: employees.id })
      .get()
    writeAudit(tx, actor, {
      action: 'import',
      entityType: 'employee',
      entityId: row.id,
      details: `employee_id=${record.code}`,
    })
  },
}
