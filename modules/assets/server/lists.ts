import { writeAudit } from '#foundation/audit/server/index.ts'
import { count, eq, sql } from 'drizzle-orm'
import type { Db, DbLike } from '#kernel/db/client.ts'
import { users } from '#kernel/db/schema.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, notFound } from '#kernel/lib/errors.ts'
import { defineLookupList } from '#kernel/modules.ts'
import { assertNotLastActive } from '#kernel/services/lists.ts'
import {
  assetBrandCreateSchema,
  type AssetBrandRow,
  assetBrandUpdateSchema,
  assetTypeCreateSchema,
  type AssetTypeRow,
  assetTypeUpdateSchema,
  type ConditionRatingRow,
  ratingCreateSchema,
  ratingUpdateSchema,
} from '../shared/index.ts'
import { assetBrands, assetTypes, conditionRatings } from './schema.ts'

// ---- Asset types ---------------------------------------------------------------

export function listAssetTypes(db: DbLike, id?: number): AssetTypeRow[] {
  return db
    .all<AssetTypeRow>(sql`
    select t.id as id, t.name as name, t.is_active as isActive, count(a.id) as assetCount
    from asset_types t left join assets a on a.type_id = t.id
    ${id ? sql`where t.id = ${id}` : sql``}
    group by t.id order by t.is_active desc, t.name collate nocase`)
    .map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function typeRow(db: DbLike, id: number): AssetTypeRow {
  const row = listAssetTypes(db, id)[0]
  if (!row) throw notFound('Asset type')
  return row
}

function assertTypeNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db
    .select({ id: assetTypes.id })
    .from(assetTypes)
    .where(sql`${assetTypes.name} = ${name} collate nocase`)
    .get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_name', `An asset type named "${name}" already exists.`, { field: 'name' })
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

export function updateAssetType(
  db: Db,
  actor: Actor,
  id: number,
  input: { name?: string; isActive?: boolean },
): AssetTypeRow {
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
      if (!input.isActive) assertNotLastActive(tx, assetTypes, current, 'asset type')
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(assetTypes).set(patch).where(eq(assetTypes.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'assettype',
      entityId: id,
      details: `${patch.name ?? current.name} · ${changes.join('; ')}`,
    })
  })
  return typeRow(db, id)
}

export function deleteAssetType(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = typeRow(tx, id)
    if (row.assetCount > 0) {
      throw conflict('in_use', `${row.assetCount} asset(s) use "${row.name}". Deactivate it instead.`)
    }
    assertNotLastActive(tx, assetTypes, row, 'asset type')
    tx.delete(assetTypes).where(eq(assetTypes.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'assettype',
      entityId: id,
      details: `unused type "${row.name}"`,
    })
  })
}

// ---- Asset brands ----------------------------------------------------------------
// The same rules as asset types. "Unknown", which the 0023 migration gave every older asset, starts archived.

export function listAssetBrands(db: DbLike, id?: number): AssetBrandRow[] {
  return db
    .all<AssetBrandRow>(sql`
    select b.id as id, b.name as name, b.is_active as isActive, count(a.id) as assetCount
    from asset_brands b left join assets a on a.brand_id = b.id
    ${id ? sql`where b.id = ${id}` : sql``}
    group by b.id order by b.is_active desc, b.name collate nocase`)
    .map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function brandRow(db: DbLike, id: number): AssetBrandRow {
  const row = listAssetBrands(db, id)[0]
  if (!row) throw notFound('Brand')
  return row
}

function assertBrandNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db
    .select({ id: assetBrands.id })
    .from(assetBrands)
    .where(sql`${assetBrands.name} = ${name} collate nocase`)
    .get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_name', `A brand named "${name}" already exists.`, { field: 'name' })
}

export function createAssetBrand(db: Db, actor: Actor, name: string): AssetBrandRow {
  const id = db.transaction((tx) => {
    assertBrandNameFree(tx, name)
    const row = tx.insert(assetBrands).values({ name }).returning({ id: assetBrands.id }).get()
    writeAudit(tx, actor, { action: 'create', entityType: 'assetbrand', entityId: row.id, details: name })
    return row.id
  })
  return brandRow(db, id)
}

export function updateAssetBrand(
  db: Db,
  actor: Actor,
  id: number,
  input: { name?: string; isActive?: boolean },
): AssetBrandRow {
  db.transaction((tx) => {
    const current = tx.select().from(assetBrands).where(eq(assetBrands.id, id)).get()
    if (!current) throw notFound('Brand')
    const changes: string[] = []
    const patch: Partial<typeof assetBrands.$inferInsert> = {}
    if (input.name !== undefined && input.name !== current.name) {
      assertBrandNameFree(tx, input.name, id)
      patch.name = input.name
      changes.push(`name: ${current.name} → ${input.name}`)
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      if (!input.isActive) assertNotLastActive(tx, assetBrands, current, 'brand')
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(assetBrands).set(patch).where(eq(assetBrands.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'assetbrand',
      entityId: id,
      details: `${patch.name ?? current.name} · ${changes.join('; ')}`,
    })
  })
  return brandRow(db, id)
}

export function deleteAssetBrand(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = brandRow(tx, id)
    if (row.assetCount > 0) {
      throw conflict('in_use', `${row.assetCount} asset(s) use "${row.name}". Deactivate it instead.`)
    }
    assertNotLastActive(tx, assetBrands, row, 'brand')
    tx.delete(assetBrands).where(eq(assetBrands.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'assetbrand',
      entityId: id,
      details: `unused brand "${row.name}"`,
    })
  })
}

// ---- Condition ratings ---------------------------------------------------------------

export function listRatings(db: DbLike, id?: number): ConditionRatingRow[] {
  return db
    .all<ConditionRatingRow>(sql`
    select r.id as id, r.name as name, r.score as score, r.is_active as isActive, count(c.id) as snapshotCount
    from condition_ratings r left join conditions c on c.rating_id = r.id
    ${id ? sql`where r.id = ${id}` : sql``}
    group by r.id order by r.score desc`)
    .map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function ratingRow(db: DbLike, id: number): ConditionRatingRow {
  const row = listRatings(db, id)[0]
  if (!row) throw notFound('Condition rating')
  return row
}

function assertRatingNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db
    .select({ id: conditionRatings.id })
    .from(conditionRatings)
    .where(sql`${conditionRatings.name} = ${name} collate nocase`)
    .get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_name', `A rating named "${name}" already exists.`, { field: 'name' })
}

/** Two ratings with one score would be the same condition under two names, and the scale would have no order between them. */
function assertRatingScoreFree(db: DbLike, score: number, exceptId?: number) {
  const dup = db
    .select({ id: conditionRatings.id, name: conditionRatings.name })
    .from(conditionRatings)
    .where(eq(conditionRatings.score, score))
    .get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_score', `"${dup.name}" already has the score ${score}. Choose another.`, {
      field: 'score',
    })
}

export function createRating(db: Db, actor: Actor, input: { name: string; score: number }): ConditionRatingRow {
  const id = db.transaction((tx) => {
    assertRatingNameFree(tx, input.name)
    assertRatingScoreFree(tx, input.score)
    const row = tx.insert(conditionRatings).values(input).returning({ id: conditionRatings.id }).get()
    writeAudit(tx, actor, {
      action: 'create',
      entityType: 'conditionrating',
      entityId: row.id,
      details: `${input.name} · score ${input.score}`,
    })
    return row.id
  })
  return ratingRow(db, id)
}

export function updateRating(
  db: Db,
  actor: Actor,
  id: number,
  input: { name?: string; score?: number; isActive?: boolean },
): ConditionRatingRow {
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
    if (input.score !== undefined && input.score !== current.score) {
      assertRatingScoreFree(tx, input.score, id)
      patch.score = input.score
      changes.push(`score: ${current.score} → ${input.score}`)
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      if (!input.isActive) assertNotLastActive(tx, conditionRatings, current, 'condition rating')
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(conditionRatings).set(patch).where(eq(conditionRatings.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'conditionrating',
      entityId: id,
      details: `${patch.name ?? current.name} · ${changes.join('; ')}`,
    })
  })
  return ratingRow(db, id)
}

export function deleteRating(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = ratingRow(tx, id)
    if (row.snapshotCount > 0) {
      throw conflict('in_use', `${row.snapshotCount} condition record(s) use "${row.name}". Deactivate it instead.`)
    }
    assertNotLastActive(tx, conditionRatings, row, 'condition rating')
    tx.delete(conditionRatings).where(eq(conditionRatings.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'conditionrating',
      entityId: id,
      details: `unused rating "${row.name}"`,
    })
  })
}

// ---- The lists, as registered on the Lookup lists page (`hooks('lists')`) ---------------------------

export const assetTypeList = defineLookupList({
  path: 'asset-types',
  resource: 'assets',
  list: (db) => listAssetTypes(db),
  createSchema: assetTypeCreateSchema,
  create: (db, actor, input) => createAssetType(db, actor, input.name),
  updateSchema: assetTypeUpdateSchema,
  update: updateAssetType,
  remove: deleteAssetType,
})

export const assetBrandList = defineLookupList({
  path: 'asset-brands',
  resource: 'assets',
  list: (db) => listAssetBrands(db),
  createSchema: assetBrandCreateSchema,
  create: (db, actor, input) => createAssetBrand(db, actor, input.name),
  updateSchema: assetBrandUpdateSchema,
  update: updateAssetBrand,
  remove: deleteAssetBrand,
})

export const conditionRatingList = defineLookupList({
  path: 'condition-ratings',
  resource: 'assets',
  list: (db) => listRatings(db),
  createSchema: ratingCreateSchema,
  create: createRating,
  updateSchema: ratingUpdateSchema,
  update: updateRating,
  remove: deleteRating,
})

// ---- Defaults (the `startup` hook) -------------------------------------------------------------

export const DEFAULT_TYPES = ['Laptop', 'Phone', 'Monitor', 'Keyboard', 'Mouse']
/** The 0023 migration also leaves an archived "Unknown", so a new database counts active brands only. */
export const DEFAULT_BRANDS = ['Apple', 'Dell', 'HP', 'Lenovo', 'Logitech', 'Microsoft', 'Samsung']
/** Best condition first, each with its score out of 100. */
export const DEFAULT_RATINGS = [
  { name: 'New', score: 100 },
  { name: 'Good', score: 80 },
  { name: 'Fair', score: 60 },
  { name: 'Poor', score: 30 },
  { name: 'Damaged', score: 10 },
]

/**
 * Fill the reference lists on first run so the forms are usable immediately. A database with users in it is not new: whatever its
 * lists hold is what its admins made of them, and an emptied list must not come back to the defaults at the next restart.
 */
export function ensureDefaultLists(db: Db) {
  // Brands are the exception. No active brand happens only on a database the 0023 migration has just upgraded (admins can't
  // archive or delete the last active one), and without one no physical asset can be added.
  if ((db.select({ n: count() }).from(assetBrands).where(eq(assetBrands.isActive, true)).get()?.n ?? 0) === 0) {
    db.insert(assetBrands)
      .values(DEFAULT_BRANDS.map((name) => ({ name })))
      .onConflictDoNothing()
      .run()
  }
  if ((db.select({ n: count() }).from(users).get()?.n ?? 0) > 0) return
  if ((db.select({ n: count() }).from(assetTypes).get()?.n ?? 0) === 0) {
    db.insert(assetTypes)
      .values(DEFAULT_TYPES.map((name) => ({ name })))
      .run()
  }
  if ((db.select({ n: count() }).from(conditionRatings).get()?.n ?? 0) === 0) {
    db.insert(conditionRatings).values(DEFAULT_RATINGS).run()
  }
}
