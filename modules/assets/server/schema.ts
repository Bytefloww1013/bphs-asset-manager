// The physical assets' tables (issue #23): asset types, brands, condition ratings, assets and their condition snapshots.
// Their custody is the `assignments` ledger (foundation), which `conditions` points at for each issue and return.
import { assignments } from '#foundation/assignments/server/index.ts'
import { employees } from '#foundation/employees/server/index.ts'
import { createdAt, ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AssetStatus, ConditionKind } from '../shared/index.ts'

// ---- Reference lists --------------------------------------------------------------

export const assetTypes = sqliteTable('asset_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

/** Who made a physical asset. "Unknown" is the archived brand the 0023 migration gave every asset that existed before brands. */
export const assetBrands = sqliteTable('asset_brands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

export const conditionRatings = sqliteTable(
  'condition_ratings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    /**
     * 1 to 100, 100 being as good as new. It is what the rating means: the order of the scale, the colour of its badge,
     * the default choice and the dashboard's condition watch all come from it, never from the name. The default of 0 is
     * only there because SQLite needs one to add a NOT NULL column; every row is given a real score.
     */
    score: integer('score').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('uq_condition_ratings_score').on(t.score)],
)

// ---- Assets ---------------------------------------------------------------------------

export const assets = sqliteTable(
  'assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tag: text('tag').notNull().unique(),
    typeId: integer('type_id')
      .notNull()
      .references(() => assetTypes.id, { onDelete: 'restrict' }),
    brandId: integer('brand_id')
      .notNull()
      .references(() => assetBrands.id, { onDelete: 'restrict' }),
    model: text('model'),
    /** The device's object ID in Microsoft Entra: a UUID, stored lowercase. */
    entraObjectId: text('entra_object_id'),
    serial: text('serial'),
    status: text('status').$type<AssetStatus>().notNull().default('in_service'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ix_assets_type').on(t.typeId),
    index('ix_assets_brand').on(t.brandId),
    index('ix_assets_serial').on(t.serial),
    // Unique when set; any number of assets may have none.
    uniqueIndex('uq_assets_entra_object_id')
      .on(t.entraObjectId)
      .where(sql`${t.entraObjectId} is not null`),
  ],
)

/** A rating + notes snapshot taken when an asset is received, issued or returned. */
export const conditions = sqliteTable(
  'conditions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetId: integer('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    assignmentId: integer('assignment_id').references(() => assignments.id, { onDelete: 'restrict' }),
    kind: text('kind').$type<ConditionKind>().notNull(),
    ratingId: integer('rating_id')
      .notNull()
      .references(() => conditionRatings.id, { onDelete: 'restrict' }),
    assessedById: integer('assessed_by_id').references(() => employees.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    recordedById: integer('recorded_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    recordedAt: ms('recorded_at').notNull(),
  },
  (t) => [index('ix_conditions_asset').on(t.assetId), index('ix_conditions_rating').on(t.ratingId)],
)
