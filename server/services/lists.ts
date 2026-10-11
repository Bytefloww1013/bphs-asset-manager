import { asc, eq, sql } from 'drizzle-orm'
import type { AssetTypeRow, ConditionRatingRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { assetTypes, conditionRatings } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'

// ---- Asset types ---------------------------------------------------------------

export function listAssetTypes(db: DbLike): AssetTypeRow[] {
  return db.all<AssetTypeRow>(sql`
    select t.id as id, t.name as name, t.is_active as isActive, count(a.id) as assetCount
    from asset_types t left join assets a on a.type_id = t.id
    group by t.id order by t.is_active desc, t.name collate nocase`).map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function typeRow(db: DbLike, id: number): AssetTypeRow {
  const row = listAssetTypes(db).find((item) => item.id === id)
  if (!row) throw notFound('Asset type')
  return row
}

function assertTypeNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db.select({ id: assetTypes.id }).from(assetTypes).where(sql`${assetTypes.name} = ${name} collate nocase`).get()
  if (dup && dup.id !== exceptId) throw conflict('duplicate_name', `An asset type named "${name}" already exists.`, { field: 'name' })
}

export function createAssetType(db: Db, actor: Actor, name: string): AssetTypeRow {
  const id = db.transaction((tx) => {
    assertTypeNameFree(tx, name)
    const row = tx.insert(assetTypes).values({ name }).returning({ id: assetTypes.id }).get()
    writeAudit(tx, actor, { action: 'create', entityType: 'assettype', entityId: row.id, details: name })
    return row.id
  })
  return typeRow(db, id)
}

export function updateAssetType(db: Db, actor: Actor, id: number, input: { name?: string; isActive?: boolean }): AssetTypeRow {
  db.transaction((tx) => {
    const current = tx.select().from(assetTypes).where(eq(assetTypes.id, id)).get()
    if (!current) throw notFound('Asset type')
    const changes: string[] = []
    const patch: Partial<typeof assetTypes.$inferInsert> = {}
    if (input.name !== undefined && input.name !== current.name) {
      assertTypeNameFree(tx, input.name, id)
      patch.name = input.name
      changes.push(`name: ${current.name} → ${input.name}`)
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(assetTypes).set(patch).where(eq(assetTypes.id, id)).run()
    writeAudit(tx, actor, { action: 'update', entityType: 'assettype', entityId: id, details: changes.join('; ') })
  })
  return typeRow(db, id)
}

export function deleteAssetType(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = typeRow(tx, id)
    if (row.assetCount > 0) {
      throw conflict('in_use', `${row.assetCount} asset(s) use "${row.name}". Deactivate it instead.`)
    }
    tx.delete(assetTypes).where(eq(assetTypes.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'assettype', entityId: id, details: `unused type "${row.name}"` })
  })
}

// ---- Condition ratings ---------------------------------------------------------------

export function listRatings(db: DbLike): ConditionRatingRow[] {
  return db.all<ConditionRatingRow>(sql`
    select r.id as id, r.name as name, r.sort_order as sortOrder, r.is_active as isActive, count(c.id) as snapshotCount
    from condition_ratings r left join conditions c on c.rating_id = r.id
    group by r.id order by r.sort_order`).map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function ratingRow(db: DbLike, id: number): ConditionRatingRow {
  const row = listRatings(db).find((item) => item.id === id)
  if (!row) throw notFound('Condition rating')
  return row
}

function assertRatingNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db.select({ id: conditionRatings.id }).from(conditionRatings).where(sql`${conditionRatings.name} = ${name} collate nocase`).get()
  if (dup && dup.id !== exceptId) throw conflict('duplicate_name', `A rating named "${name}" already exists.`, { field: 'name' })
}

export function createRating(db: Db, actor: Actor, name: string): ConditionRatingRow {
  const id = db.transaction((tx) => {
    assertRatingNameFree(tx, name)
    const next = (tx.get<{ n: number | null }>(sql`select max(sort_order) as n from condition_ratings`)?.n ?? 0) + 1
    const row = tx.insert(conditionRatings).values({ name, sortOrder: next }).returning({ id: conditionRatings.id }).get()
    writeAudit(tx, actor, { action: 'create', entityType: 'conditionrating', entityId: row.id, details: `${name} · sort_order ${next}` })
    return row.id
  })
  return ratingRow(db, id)
}

export function updateRating(db: Db, actor: Actor, id: number, input: { name?: string; isActive?: boolean }): ConditionRatingRow {
  db.transaction((tx) => {
    const current = tx.select().from(conditionRatings).where(eq(conditionRatings.id, id)).get()
    if (!current) throw notFound('Condition rating')
    const changes: string[] = []
    const patch: Partial<typeof conditionRatings.$inferInsert> = {}
    if (input.name !== undefined && input.name !== current.name) {
      assertRatingNameFree(tx, input.name, id)
      patch.name = input.name
      changes.push(`name: ${current.name} → ${input.name}`)
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(conditionRatings).set(patch).where(eq(conditionRatings.id, id)).run()
    writeAudit(tx, actor, { action: 'update', entityType: 'conditionrating', entityId: id, details: changes.join('; ') })
  })
  return ratingRow(db, id)
}

/** `ids` must list every rating exactly once, best condition first. */
export function reorderRatings(db: Db, actor: Actor, ids: number[]): ConditionRatingRow[] {
  db.transaction((tx) => {
    const all = tx.select({ id: conditionRatings.id }).from(conditionRatings).orderBy(asc(conditionRatings.sortOrder)).all()
    const known = new Set(all.map((row) => row.id))
    if (ids.length !== known.size || !ids.every((id) => known.has(id)) || new Set(ids).size !== ids.length) {
      throw invalid('The new order must list every rating exactly once.')
    }
    ids.forEach((id, index) => tx.update(conditionRatings).set({ sortOrder: index + 1 }).where(eq(conditionRatings.id, id)).run())
    writeAudit(tx, actor, { action: 'update', entityType: 'conditionrating', entityId: null, details: 'scale reordered' })
  })
  return listRatings(db)
}

export function deleteRating(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = ratingRow(tx, id)
    if (row.snapshotCount > 0) {
      throw conflict('in_use', `${row.snapshotCount} condition record(s) use "${row.name}". Deactivate it instead.`)
    }
    tx.delete(conditionRatings).where(eq(conditionRatings.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'conditionrating', entityId: id, details: `unused rating "${row.name}"` })
  })
}
