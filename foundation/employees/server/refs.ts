import { eq, inArray } from 'drizzle-orm'
import type { DbLike } from '#kernel/db/client.ts'
import { invalid, notFound } from '#kernel/lib/errors.ts'
import type { EmployeeRef } from '../shared/types.ts'
import { employees } from './schema.ts'

export const fullName = (first: string, last: string) => `${first} ${last}`.trim()

export function employeeRef(row: typeof employees.$inferSelect): EmployeeRef {
  return { id: row.id, code: row.code, name: fullName(row.firstName, row.lastName), department: row.department }
}

export function requireEmployee(db: DbLike, id: number) {
  const employee = db.select().from(employees).where(eq(employees.id, id)).get()
  if (!employee) throw notFound('Employee')
  return employee
}

/** Refuses anyone who is not in the directory or has been archived: whoever a new record names is here now. */
export function requireActiveEmployees(db: DbLike, ids: number[], field: string) {
  const found = db
    .select({ id: employees.id, archivedAt: employees.archivedAt })
    .from(employees)
    .where(inArray(employees.id, ids))
    .all()
  if (found.length !== ids.length) throw invalid('Someone chosen is no longer in the employee directory.', { field })
  if (found.some((row) => row.archivedAt))
    throw invalid('Someone chosen has been archived. Choose active employees only.', { field })
}
