import { employeeRef, employees } from '#foundation/employees/server/index.ts'
import { programs } from '#foundation/programs/server/index.ts'
import { asc, desc, eq, sql } from 'drizzle-orm'
import type { DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, invalid } from '#kernel/lib/errors.ts'
import { hooks } from '#kernel/registry.ts'
import type { Lookups } from '../shared/index.ts'
import { assetBrands, assetTypes, conditionRatings } from './schema.ts'

export function requireActiveRating(db: DbLike, id: number) {
  const rating = db.select().from(conditionRatings).where(eq(conditionRatings.id, id)).get()
  if (!rating) throw invalid('Choose a condition rating.', { field: 'conditionRatingId' })
  if (!rating.isActive) throw conflict('rating_inactive', `The "${rating.name}" rating is no longer in use.`)
  return rating
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
export function loadLookups(db: DbLike): Lookups & Record<string, unknown> {
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
    // Then what other modules add (the `lookups` hook), in registry order.
    ...Object.fromEntries(hooks('lookups').map((part) => [part.key, part.load(db)])),
  }
}
