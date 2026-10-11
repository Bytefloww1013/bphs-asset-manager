import { asc, eq } from 'drizzle-orm'
import type { EmployeeRef, Lookups } from '../../shared/types.ts'
import type { DbLike } from '../db/client.ts'
import { assetTypes, conditionRatings, employees } from '../db/schema.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'

export const fullName = (first: string, last: string) => `${first} ${last}`.trim()

export function employeeRef(row: typeof employees.$inferSelect): EmployeeRef {
  return { id: row.id, code: row.code, name: fullName(row.firstName, row.lastName), department: row.department }
}

export function requireActiveRating(db: DbLike, id: number) {
  const rating = db.select().from(conditionRatings).where(eq(conditionRatings.id, id)).get()
  if (!rating) throw invalid('Choose a condition rating.', { field: 'conditionRatingId' })
  if (!rating.isActive) throw conflict('rating_inactive', `The "${rating.name}" rating is no longer in use.`)
  return rating
}

export function requireEmployee(db: DbLike, id: number) {
  const employee = db.select().from(employees).where(eq(employees.id, id)).get()
  if (!employee) throw notFound('Employee')
  return employee
}

export function requireAssessor(db: DbLike, id: number | null | undefined) {
  if (id == null) return null
  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).get()
  if (!employee) throw invalid('Choose who assessed the condition.', { field: 'assessedById' })
  return employee.id
}

/** Everything the forms need to populate their pickers, in one small request. */
export function loadLookups(db: DbLike): Lookups {
  return {
    assetTypes: db
      .select({ id: assetTypes.id, name: assetTypes.name })
      .from(assetTypes)
      .where(eq(assetTypes.isActive, true))
      .orderBy(asc(assetTypes.name))
      .all(),
    conditionRatings: db
      .select({ id: conditionRatings.id, name: conditionRatings.name, sortOrder: conditionRatings.sortOrder })
      .from(conditionRatings)
      .where(eq(conditionRatings.isActive, true))
      .orderBy(asc(conditionRatings.sortOrder))
      .all(),
    employees: db
      .select()
      .from(employees)
      .orderBy(asc(employees.lastName), asc(employees.firstName))
      .all()
      .filter((row) => !row.archivedAt)
      .map(employeeRef),
  }
}
