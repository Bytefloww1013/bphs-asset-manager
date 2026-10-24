import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { createdAt } from '#kernel/db/columns.ts'

export const programs = sqliteTable(
  'programs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** The Program ID people type. Unique whatever the letter case, which the index below holds. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    /** A program that has held an asset is deactivated, never deleted. */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('uq_programs_code').on(sql`${t.code} collate nocase`), index('ix_programs_name').on(t.name)],
)
