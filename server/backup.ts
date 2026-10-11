/**
 * Online backup of the SQLite database using SQLite's own backup API, so it is safe to run
 * while the app is serving requests (unlike copying the file, which can miss the WAL).
 *
 *   bun run db:backup                      # data/backups/bphs-<timestamp>.sqlite
 *   bun run db:backup /path/to/file        # explicit destination
 *   docker compose exec assets node server/backup.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.ts'

const source = path.join(config.dataDir, 'bphs.sqlite')
if (!fs.existsSync(source)) {
  console.error(`No database at ${source}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
const destination = path.resolve(process.argv[2] ?? path.join(config.dataDir, 'backups', `bphs-${stamp}.sqlite`))
fs.mkdirSync(path.dirname(destination), { recursive: true })

const db = new Database(source, { readonly: true })
await db.backup(destination)
db.close()

// The copy inherits WAL mode, so merely opening it later would leave -wal/-shm files beside it.
// A plain rollback journal makes every backup one self-contained file; the app switches back to WAL on open.
const copy = new Database(destination)
copy.pragma('journal_mode = DELETE')
copy.close()
console.log(`Backed up ${source} to ${destination} (${(fs.statSync(destination).size / 1024).toFixed(0)} KB)`)
