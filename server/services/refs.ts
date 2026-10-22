import { asc, desc, eq, sql } from 'drizzle-orm'
import type { EmployeeRef, Lookups, ProgramRef } from '../../shared/types.ts'
import type { DbLike } from '../db/client.ts'
import { assetBrands, assetTypes, conditionRatings, digitalAssetTypes, employees, programs } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'

export const fullName = (first: string, last: string) => `${first} ${last}`.trim()

export function employeeRef(row: typeof employees.$inferSelect): EmployeeRef {
  return { id: row.id, code: row.code, name: fullName(row.firstName, row.lastName), department: row.department }
}

export function programRef(row: Pick<typeof programs.$inferSelect, 'id' | 'code' | 'name'>): ProgramRef {
  return { id: row.id, code: row.code, name: row.name }
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

export function requireProgram(db: DbLike, id: number) {
  const program = db.select().from(programs).where(eq(programs.id, id)).get()
  if (!program) throw notFound('Program')
  return program
}

function requireAssessor(db: DbLike, id: number | null | undefined) {
  if (id == null) return null
  const employee = db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).get()
  if (!employee) throw invalid('Choose who assessed the condition.', { field: 'assessedById' })
  return employee.id
}

/** Who assessed: the employee sent, nobody when the field was sent empty, and the actor's own employee only when it was not sent at all. */
export function assessorFor(db: DbLike, sent: number | null | undefined, actor: Actor) {
  return requireAssessor(db, sent === undefined ? actor.employeeId : sent)
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
    assetBrands: db
      .select({ id: assetBrands.id, name: assetBrands.name })
      .from(assetBrands)
      .where(eq(assetBrands.isActive, true))
      .orderBy(asc(assetBrands.name))
      .all(),
    conditionRatings: db
      .select({ id: conditionRatings.id, name: conditionRatings.name, score: conditionRatings.score })
      .from(conditionRatings)
      .where(eq(conditionRatings.isActive, true))
      .orderBy(desc(conditionRatings.score))
      .all(),
    employees: db
      .select()
      .from(employees)
      .orderBy(asc(employees.lastName), asc(employees.firstName))
      .all()
      .filter((row) => !row.archivedAt)
      .map(employeeRef),
    programs: db
      .select({ id: programs.id, code: programs.code, name: programs.name })
      .from(programs)
      .where(eq(programs.isActive, true))
      .orderBy(sql`${programs.name} collate nocase`)
      .all(),
    digitalAssetTypes: db
      .select({ id: digitalAssetTypes.id, name: digitalAssetTypes.name })
      .from(digitalAssetTypes)
      .where(eq(digitalAssetTypes.isActive, true))
      .orderBy(asc(digitalAssetTypes.name))
      .all(),
  }
}
