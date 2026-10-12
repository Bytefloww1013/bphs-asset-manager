import { eq, sql } from 'drizzle-orm'
import type { AssetTypeRow, ConditionRatingRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { assetTypes, conditionRatings } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, notFound } from '../lib/errors.ts'

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

/**
 * A list with nothing active in it leaves the forms with nothing to offer: no asset can be added without a type, and nothing can be
 * issued or returned without a rating. So the last active item can be neither switched off nor deleted.
 */
function assertNotLastActive(db: DbLike, table: typeof assetTypes | typeof conditionRatings, item: { id: number; name: string; isActive: boolean }, noun: string) {
  if (!item.isActive) return
  const others = db.get<{ n: number }>(sql`select count(*) as n from ${table} where is_active = 1 and id <> ${item.id}`)?.n ?? 0
  if (others === 0) throw conflict('last_active', `"${item.name}" is the only active ${noun}. Activate or add another first.`)
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
      if (!input.isActive) assertNotLastActive(tx, assetTypes, current, 'asset type')
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
    assertNotLastActive(tx, assetTypes, row, 'asset type')
    tx.delete(assetTypes).where(eq(assetTypes.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'assettype', entityId: id, details: `unused type "${row.name}"` })
  })
}

// ---- Condition ratings ---------------------------------------------------------------

export function listRatings(db: DbLike): ConditionRatingRow[] {
  return db.all<ConditionRatingRow>(sql`
    select r.id as id, r.name as name, r.score as score, r.is_active as isActive, count(c.id) as snapshotCount
    from condition_ratings r left join conditions c on c.rating_id = r.id
    group by r.id order by r.score desc`).map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
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

/** Two ratings with one score would be the same condition under two names, and the scale would have no order between them. */
function assertRatingScoreFree(db: DbLike, score: number, exceptId?: number) {
  const dup = db.select({ id: conditionRatings.id, name: conditionRatings.name }).from(conditionRatings).where(eq(conditionRatings.score, score)).get()
  if (dup && dup.id !== exceptId) throw conflict('duplicate_score', `"${dup.name}" already has the score ${score}. Choose another.`, { field: 'score' })
}

export function createRating(db: Db, actor: Actor, input: { name: string; score: number }): ConditionRatingRow {
  const id = db.transaction((tx) => {
    assertRatingNameFree(tx, input.name)
    assertRatingScoreFree(tx, input.score)
    const row = tx.insert(conditionRatings).values(input).returning({ id: conditionRatings.id }).get()
    writeAudit(tx, actor, { action: 'create', entityType: 'conditionrating', entityId: row.id, details: `${input.name} · score ${input.score}` })
    return row.id
  })
  return ratingRow(db, id)
}

export function updateRating(db: Db, actor: Actor, id: number, input: { name?: string; score?: number; isActive?: boolean }): ConditionRatingRow {
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
    writeAudit(tx, actor, { action: 'update', entityType: 'conditionrating', entityId: id, details: changes.join('; ') })
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
    writeAudit(tx, actor, { action: 'delete', entityType: 'conditionrating', entityId: id, details: `unused rating "${row.name}"` })
  })
}
