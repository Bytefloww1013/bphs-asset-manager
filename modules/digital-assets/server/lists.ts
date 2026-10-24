import { writeAudit } from '#foundation/audit/server/index.ts'
import { asc, eq, sql } from 'drizzle-orm'
import type { Db, DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, notFound } from '#kernel/lib/errors.ts'
import { defineLookupList, type LookupsPart } from '#kernel/modules.ts'
import { assertNotLastActive } from '#kernel/services/lists.ts'
import { namedListCreateSchema, namedListUpdateSchema } from '#shared/schemas.ts'
import type { DigitalAssetTypeRow } from '../shared/index.ts'
import { digitalAssetTypes } from './schema.ts'

// ---- Digital asset types -----------------------------------------------------------
// The same rules as the physical asset types (the assets module), over the digital register.

export function listDigitalAssetTypes(db: DbLike, id?: number): DigitalAssetTypeRow[] {
  return db
    .all<DigitalAssetTypeRow>(sql`
    select t.id as id, t.name as name, t.is_active as isActive, count(d.id) as assetCount
    from digital_asset_types t left join digital_assets d on d.type_id = t.id
    ${id ? sql`where t.id = ${id}` : sql``}
    group by t.id order by t.is_active desc, t.name collate nocase`)
    .map((row) => ({ ...row, isActive: Boolean(row.isActive) }))
}

function digitalTypeRow(db: DbLike, id: number): DigitalAssetTypeRow {
  const row = listDigitalAssetTypes(db, id)[0]
  if (!row) throw notFound('Digital asset type')
  return row
}

function assertDigitalTypeNameFree(db: DbLike, name: string, exceptId?: number) {
  const dup = db
    .select({ id: digitalAssetTypes.id })
    .from(digitalAssetTypes)
    .where(sql`${digitalAssetTypes.name} = ${name} collate nocase`)
    .get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_name', `A digital asset type named "${name}" already exists.`, { field: 'name' })
}

export function createDigitalAssetType(db: Db, actor: Actor, name: string): DigitalAssetTypeRow {
  const id = db.transaction((tx) => {
    assertDigitalTypeNameFree(tx, name)
    const row = tx.insert(digitalAssetTypes).values({ name }).returning({ id: digitalAssetTypes.id }).get()
    writeAudit(tx, actor, { action: 'create', entityType: 'digitalassettype', entityId: row.id, details: name })
    return row.id
  })
  return digitalTypeRow(db, id)
}

export function updateDigitalAssetType(
  db: Db,
  actor: Actor,
  id: number,
  input: { name?: string; isActive?: boolean },
): DigitalAssetTypeRow {
  db.transaction((tx) => {
    const current = tx.select().from(digitalAssetTypes).where(eq(digitalAssetTypes.id, id)).get()
    if (!current) throw notFound('Digital asset type')
    const changes: string[] = []
    const patch: Partial<typeof digitalAssetTypes.$inferInsert> = {}
    if (input.name !== undefined && input.name !== current.name) {
      assertDigitalTypeNameFree(tx, input.name, id)
      patch.name = input.name
      changes.push(`name: ${current.name} → ${input.name}`)
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      if (!input.isActive) assertNotLastActive(tx, digitalAssetTypes, current, 'digital asset type')
      patch.isActive = input.isActive
      changes.push(`active: ${current.isActive} → ${input.isActive}`)
    }
    if (changes.length === 0) return
    tx.update(digitalAssetTypes).set(patch).where(eq(digitalAssetTypes.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'digitalassettype',
      entityId: id,
      details: `${patch.name ?? current.name} · ${changes.join('; ')}`,
    })
  })
  return digitalTypeRow(db, id)
}

export function deleteDigitalAssetType(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const row = digitalTypeRow(tx, id)
    if (row.assetCount > 0) {
      throw conflict('in_use', `${row.assetCount} digital asset(s) use "${row.name}". Deactivate it instead.`)
    }
    assertNotLastActive(tx, digitalAssetTypes, row, 'digital asset type')
    tx.delete(digitalAssetTypes).where(eq(digitalAssetTypes.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'digitalassettype',
      entityId: id,
      details: `unused type "${row.name}"`,
    })
  })
}

// ---- The list, as registered on the Lookup lists page (`hooks('lists')`) ---------------------------

export const digitalAssetTypeList = defineLookupList({
  path: 'digital-asset-types',
  resource: 'assets',
  list: (db) => listDigitalAssetTypes(db),
  createSchema: namedListCreateSchema,
  create: (db, actor, input) => createDigitalAssetType(db, actor, input.name),
  updateSchema: namedListUpdateSchema,
  update: updateDigitalAssetType,
  remove: deleteDigitalAssetType,
})

// ---- The forms' pickers (`/api/lookups`, the `lookups` hook) ---------------------------------------

/** The active digital asset types, after the assets module's own pickers. */
export const digitalLookups: LookupsPart = {
  key: 'digitalAssetTypes',
  load: (db) =>
    db
      .select({ id: digitalAssetTypes.id, name: digitalAssetTypes.name })
      .from(digitalAssetTypes)
      .where(eq(digitalAssetTypes.isActive, true))
      .orderBy(asc(digitalAssetTypes.name))
      .all(),
}
