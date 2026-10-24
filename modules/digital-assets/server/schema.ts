// The digital assets' tables (issue #23): their types and the seats themselves. Their custody is the `assignments` ledger
// (foundation), under the kind `digital-asset`.
import { createdAt } from '#kernel/db/columns.ts'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { DigitalAssetStatus } from '../shared/index.ts'

// A licence or an account, one row per seat that can be given to one employee. Only what names the seat is kept: never a password or key.

export const digitalAssetTypes = sqliteTable('digital_asset_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

export const digitalAssets = sqliteTable(
  'digital_assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** DA-00001, made from the row's own id, which is never handed out twice. */
    code: text('code').notNull().unique(),
    typeId: integer('type_id')
      .notNull()
      .references(() => digitalAssetTypes.id, { onDelete: 'restrict' }),
    /** The License/Account: an email address or a licence reference. */
    account: text('account').notNull(),
    status: text('status').$type<DigitalAssetStatus>().notNull().default('in_service'),
    createdAt: createdAt(),
  },
  (t) => [index('ix_digital_assets_type').on(t.typeId)],
)
