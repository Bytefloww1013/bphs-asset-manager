import { eq, sql } from 'drizzle-orm'
import type { Db, DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, notFound } from '#kernel/lib/errors.ts'
import { assertNotLastActive } from '#kernel/services/lists.ts'
import type { GrievanceCategoryRow } from '../shared/types.ts'
import { grievanceCategories } from './schema.ts'
import { writeGrievanceAudit } from './write-audit.ts'

// The same rules as the lists on the Lists screen: rename, deactivate, delete only if unused, and the last active one stays.
// Its changes go to the Grievance Audit Log.

export function listGrievanceCategories(db: DbLike, id?: number): GrievanceCategoryRow[] {
  return db
    .all<GrievanceCategoryRow>(sql`
    select c.id as id, c.name as name, c.is_active as isActive, count(g.id) as grievanceCount
    from grievance_categories c left join grievances g on g.category_id = c.id
    ${id ? sql`where c.id = ${id}` : sql``}
    group by c.id order by c.is_active desc, c.name collate nocase`)
    .map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function categoryRow(db: DbLike, id: number): GrievanceCategoryRow {
  const row = listGrievanceCategories(db, id)[0]
  if (!row) throw notFound('Category')
  return row
}

function assertCategoryNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db
    .select({ id: grievanceCategories.id })
    .from(grievanceCategories)
    .where(sql`${grievanceCategories.name} = ${name} collate nocase`)
    .get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_name', `A category named "${name}" already exists.`, { field: 'name' })
}

export function createGrievanceCategory(db: Db, actor: Actor, name: string): GrievanceCategoryRow {
  const id = db.transaction((tx) => {
    assertCategoryNameFree(tx, name)
    const row = tx.insert(grievanceCategories).values({ name }).returning({ id: grievanceCategories.id }).get()
    writeGrievanceAudit(tx, actor, { action: 'create', entityType: 'category', entityId: row.id, details: name })
    return row.id
  })
  return categoryRow(db, id)
}

export function updateGrievanceCategory(
  db: Db,
  actor: Actor,
  id: number,
  input: { name?: string; isActive?: boolean },
): GrievanceCategoryRow {
  db.transaction((tx) => {
    const current = tx.select().from(grievanceCategories).where(eq(grievanceCategories.id, id)).get()
    if (!current) throw notFound('Category')
    const changes: string[] = []
    const patch: Partial<typeof grievanceCategories.$inferInsert> = {}
    if (input.name !== undefined && input.name !== current.name) {
      assertCategoryNameFree(tx, input.name, id)
      patch.name = input.name
      changes.push(`name: ${current.name} → ${input.name}`)
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      if (!input.isActive) assertNotLastActive(tx, grievanceCategories, current, 'category')
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(grievanceCategories).set(patch).where(eq(grievanceCategories.id, id)).run()
    writeGrievanceAudit(tx, actor, {
      action: 'update',
      entityType: 'category',
      entityId: id,
      details: `${patch.name ?? current.name} · ${changes.join('; ')}`,
    })
  })
  return categoryRow(db, id)
}

export function deleteGrievanceCategory(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = categoryRow(tx, id)
    if (row.grievanceCount > 0) {
      throw conflict('in_use', `${row.grievanceCount} grievance(s) use "${row.name}". Deactivate it instead.`)
    }
    assertNotLastActive(tx, grievanceCategories, row, 'category')
    tx.delete(grievanceCategories).where(eq(grievanceCategories.id, id)).run()
    writeGrievanceAudit(tx, actor, {
      action: 'delete',
      entityType: 'category',
      entityId: id,
      details: `unused category "${row.name}"`,
    })
  })
}
