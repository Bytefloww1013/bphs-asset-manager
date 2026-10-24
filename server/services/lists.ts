import { sql } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DbLike } from '../db/client.ts'
import { conflict } from '../lib/errors.ts'

// ---- Every list's rule -------------------------------------------------------------

/**
 * A list with nothing active in it leaves the forms with nothing to offer: no asset can be added without a type, and nothing can be
 * issued or returned without a rating. So the last active item can be neither switched off nor deleted.
 */
export function assertNotLastActive(
  db: DbLike,
  // Any lookup list's table: each has an `is_active` column.
  table: SQLiteTable,
  item: { id: number; name: string; isActive: boolean },
  noun: string,
) {
  if (!item.isActive) return
  const others =
    db.get<{ n: number }>(sql`select count(*) as n from ${table} where is_active = 1 and id <> ${item.id}`)?.n ?? 0
  if (others === 0)
    throw conflict('last_active', `"${item.name}" is the only active ${noun}. Activate or add another first.`)
}
