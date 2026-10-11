import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.ts'

export type Db = ReturnType<typeof createDb>['db']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Either the root connection or an open transaction. */
export type DbLike = Db | Tx

const MIGRATIONS = path.join(import.meta.dirname, 'migrations')

/** Open (and create if needed) the SQLite file. Pass ':memory:' in tests. */
export function createDb(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = NORMAL')
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export function runMigrations(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS })
}
