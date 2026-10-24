// Migration rehearsal (issue #23, slice 7.5): runs the custody merge (migration 0024) on a copy of a database with the app's own
// migrator, and checks that nothing was lost: every table's rows and counters, every physical assignment under its own id, every
// digital one after them, the foreign keys and the delete guards. The database it was given is only copied, never opened.
// With no database it builds a production-shaped one at 0023: the seed of the last version before the merge (from git, in a
// temporary worktree), plus the shapes the seed doesn't make: counters ahead of the highest id (rows deleted since), audit entries
// and notifications about digital seats, an overdue reminder and a bulk return, which name assignments by id.
//
// Run:  node docs/verify/migration-check.mjs                   (the fixture; needs git and `bun install`)
//       node docs/verify/migration-check.mjs --db <backup>     (a copy of that database, as RUNBOOK.md 7 does before upgrading)
// Env:  KEEP=<dir> keeps the migrated copy as <dir>/bphs.sqlite, for the route smoke on it:
//         DATA_DIR=<dir> SERVE_WEB=true PORT=3392 FIXED_NOW=2026-10-01T13:00:00Z TZ=UTC node --import ./docs/verify/fixed-clock.mjs server/index.ts
//         BASE=http://localhost:3392 node docs/verify/routes-smoke.mjs
//       PRE_REF=<commit> seeds the fixture from that commit (default: the one before the commit that added 0024, or HEAD).
// One PASS/FAIL/INFO line per check, then a summary; exit 1 if any check fails.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const REPO = fileURLToPath(new URL('../..', import.meta.url))
const MIGRATION = 'server/db/migrations/0024_custody_ledger.sql'
const FIXED_NOW = '2026-10-01T13:00:00Z'
const args = process.argv.slice(2)
const source = args[0] === '--db' ? args[1] : undefined
if (args.length && !source) {
  console.error('usage: node docs/verify/migration-check.mjs [--db <database file>]')
  process.exit(2)
}

let failed = 0
const line = (status, name, detail = '') => {
  if (status === 'FAIL') failed++
  console.log(`${status}: ${name}${detail ? ` - ${detail}` : ''}`)
}
const check = (name, ok, detail) => line(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail)

const work = process.env.KEEP ? path.resolve(process.env.KEEP) : fs.mkdtempSync(path.join(os.tmpdir(), 'bphs-migration-check-'))
fs.mkdirSync(work, { recursive: true })
const copy = path.join(work, 'bphs.sqlite')
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(copy + suffix, { force: true })

/** The commit whose seed the fixture comes from: the last one before the merge. */
function preMergeRef() {
  if (process.env.PRE_REF) return process.env.PRE_REF
  const added = execFileSync('git', ['log', '--diff-filter=A', '--format=%H', '--', MIGRATION], { cwd: REPO, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .at(-1)
  return added ? `${added}^` : 'HEAD'
}

/** Seeds a database at 0023 with the pre-merge code, then adds what the seed doesn't make. */
function buildFixture(file) {
  const ref = preMergeRef()
  const tree = path.join(work, 'pre-merge')
  const data = path.join(work, 'pre-merge-data')
  execFileSync('git', ['worktree', 'add', '--detach', '--force', tree, ref], { cwd: REPO, stdio: 'ignore' })
  try {
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tree, 'node_modules'), 'dir')
    // No .env: a DATA_DIR there must never be the one seeded.
    execFileSync('node', ['--import', path.join(REPO, 'docs/verify/fixed-clock.mjs'), 'server/seed.ts'], {
      cwd: tree,
      env: { ...process.env, DATA_DIR: data, FIXED_NOW, TZ: 'UTC', NODE_ENV: 'development' },
      stdio: 'ignore',
    })
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: REPO, stdio: 'ignore' })
  }
  const seeded = new Database(path.join(data, 'bphs.sqlite'))
  seeded.pragma('foreign_keys = ON')
  const one = (sql) => seeded.prepare(sql).get()
  const physical = one('select id, asset_id as assetId, employee_id as employeeId from assignments order by id limit 1')
  const digital = one('select id, digital_asset_id as seatId, employee_id as employeeId from digital_assignments order by id limit 1')
  const user = one('select id, email from users order by id limit 1')
  if (!physical || !digital || !user) throw new Error('The pre-merge seed made no assignments to build on.')
  const at = Date.parse(FIXED_NOW)
  seeded.transaction(() => {
    // Rows deleted since: each counter is ahead of the highest id left, and the digital ids must still come after it.
    seeded.exec(`update sqlite_sequence set seq = seq + 5 where name = 'assignments';
                 update sqlite_sequence set seq = seq + 3 where name = 'digital_assignments';`)
    const audit = seeded.prepare(
      'insert into audit_log (occurred_at, user_id, actor, action, entity_type, entity_id, details) values (?, ?, ?, ?, ?, ?, ?)',
    )
    audit.run(at, user.id, user.email, 'issue', 'digitalasset', digital.seatId, `Assignment ${digital.id}`)
    audit.run(at, user.id, user.email, 'return', 'digitalasset', digital.seatId, '')
    const note = seeded.prepare(
      'insert into notifications (user_id, kind, source_key, title, body, link, created_at) values (?, ?, ?, ?, ?, ?, ?)',
    )
    note.run(user.id, 'digital_issued', `digital:${digital.seatId}`, 'A seat', null, '/digital-assets', at)
    note.run(user.id, 'asset_overdue', `assignment:${physical.id}`, 'Overdue', 'It has been issued to you for 90 days.', '/assets', at)
    note.run(user.id, 'asset_returned_poor', `return-bulk:${physical.id}`, 'Returned poor', null, '/assets', at)
  })()
  seeded.close()
  fs.copyFileSync(path.join(data, 'bphs.sqlite'), file)
  fs.rmSync(data, { recursive: true, force: true })
  return ref
}

/** Everything the check compares, read straight from SQLite. */
function read(sqlite) {
  const tables = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> '__drizzle_migrations'")
    .pluck()
    .all()
  const rows = (table) => (tables.includes(table) ? sqlite.prepare(`select * from "${table}" order by id`).all() : [])
  return {
    counts: new Map(tables.map((table) => [table, sqlite.prepare(`select count(*) from "${table}"`).pluck().get()])),
    sequences: new Map(sqlite.prepare('select name, seq from sqlite_sequence').raw().all()),
    migrations: sqlite.prepare('select count(*) from __drizzle_migrations').pluck().get(),
    assignments: rows('assignments'),
    digital: rows('digital_assignments'),
    conditions: rows('conditions'),
    audit: rows('audit_log'),
    notifications: rows('notifications'),
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
/** The first row that differs, for the FAIL line. */
const firstDifference = (a, b) => {
  const at = a.findIndex((row, i) => !same(row, b[i]))
  return at < 0 ? `${a.length} rows before, ${b.length} after` : `row ${at}: ${JSON.stringify(a[at])} became ${JSON.stringify(b[at])}`
}

try {
  if (source) {
    if (!fs.existsSync(source)) throw new Error(`${source} does not exist.`)
    // Its bytes, never the database opened: a WAL database opened even read-only writes a -shm file beside it, which fails on a
    // read-only mount and leaves files next to a backup. A -wal file beside it comes too; nothing may be writing to it meanwhile.
    for (const suffix of ['', '-wal']) if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, copy + suffix)
    line('INFO', 'copied', `${source} to ${copy}`)
  } else {
    line('INFO', 'fixture', `seeded at ${buildFixture(copy)}, plus counters ahead, digital audit entries and notifications`)
  }

  const raw = new Database(copy)
  const before = read(raw)
  raw.close()
  if (!before.counts.has('digital_assignments')) throw new Error('This database has no digital_assignments table: it is already merged.')
  // A database older than 0023 runs the migrations before 0024 too: the tables they add or drop are listed, not failed.
  const journal = JSON.parse(fs.readFileSync(path.join(REPO, 'server/db/migrations/meta/_journal.json'), 'utf8'))
  const behind = journal.entries.findIndex((entry) => entry.tag.startsWith('0024_')) - before.migrations
  if (behind > 0) line('INFO', 'older database', `${behind} migration(s) before 0024 run first`)

  // The app's own migrator, as the server runs it on start: every pending migration, in one transaction, foreign keys on.
  const { createDb, runMigrations } = await import(path.join(REPO, 'server/db/client.ts'))
  const { db, sqlite } = createDb(copy)
  runMigrations(db)
  const after = read(sqlite)
  line('INFO', 'migrated', `${after.migrations - before.migrations} migration(s) ran`)

  // Rows: every table keeps its count, but the two ledgers become one.
  const lost = []
  for (const [table, count] of before.counts) {
    if (table === 'digital_assignments') continue
    if (!after.counts.has(table) && behind > 0) {
      line('INFO', `${table} dropped`, 'by a migration before 0024')
      continue
    }
    const expected = table === 'assignments' ? count + before.counts.get('digital_assignments') : count
    if (after.counts.get(table) !== expected) lost.push(`${table} ${expected} expected, ${after.counts.get(table)} found`)
  }
  check(`row counts (${before.counts.size} tables)`, lost.length === 0, lost.join('; '))
  check('digital_assignments is gone', !after.counts.has('digital_assignments'), 'it is still there')
  const added = [...after.counts.keys()].filter((table) => !before.counts.has(table))
  if (behind > 0) for (const table of added) line('INFO', `${table} added`, 'by a migration before 0024')
  else check('no table added', added.length === 0, added.join(', '))

  // Physical rows: the same ids and values, now naming the asset by kind and id.
  const physicalAfter = after.assignments.filter((row) => row.kind === 'asset')
  const physicalExpected = before.assignments.map(({ asset_id, ...row }) => ({ ...row, kind: 'asset', item_id: asset_id }))
  const shape = (row) => [row.id, row.kind, row.item_id, row.employee_id, row.program_id, row.issued_at, row.returned_at, row.issued_by_id, row.returned_by_id]
  check(
    `physical assignments keep their ids (${before.assignments.length})`,
    same(physicalAfter.map(shape), physicalExpected.map(shape)),
    firstDifference(physicalExpected.map(shape), physicalAfter.map(shape)),
  )

  // Digital rows: the same values in the same order, with ids after every one the physical ledger handed out.
  const digitalAfter = after.assignments.filter((row) => row.kind === 'digital-asset')
  const values = (row) => [row.employee_id, row.issued_at, row.returned_at, row.issued_by_id, row.returned_by_id]
  const digitalExpected = before.digital.map((row) => [row.digital_asset_id, null, ...values(row)])
  check(
    `digital assignments moved (${before.digital.length})`,
    same(digitalAfter.map((row) => [row.item_id, row.program_id, ...values(row)]), digitalExpected),
    firstDifference(digitalExpected, digitalAfter.map((row) => [row.item_id, row.program_id, ...values(row)])),
  )
  const floor = Math.max(before.sequences.get('assignments') ?? 0, ...before.assignments.map((row) => row.id), 0)
  check(
    `digital ids come after ${floor}`,
    digitalAfter.every((row) => row.id > floor),
    `lowest ${Math.min(...digitalAfter.map((row) => row.id))}`,
  )
  const highest = Math.max(0, ...after.assignments.map((row) => row.id))
  check(
    'the counter carries on from the highest id',
    (after.sequences.get('assignments') ?? 0) >= Math.max(highest, floor),
    `seq ${after.sequences.get('assignments')}, highest id ${highest}`,
  )

  // Everything that names an assignment, or a seat, is untouched.
  for (const [name, key] of [
    ['conditions', 'conditions'],
    ['audit entries', 'audit'],
    ['notifications', 'notifications'],
  ]) {
    check(`${name} unchanged (${before[key].length})`, same(before[key], after[key]), firstDifference(before[key], after[key]))
  }
  const counters = [...before.sequences].filter(([name]) => !['assignments', 'digital_assignments'].includes(name))
  const moved = counters.filter(([name, seq]) => after.sequences.get(name) !== seq).map(([name, seq]) => `${name} ${seq} became ${after.sequences.get(name)}`)
  check(`other counters unchanged (${counters.length})`, moved.length === 0, moved.join('; '))

  // The rules.
  const broken = sqlite.pragma('foreign_key_check')
  check('foreign keys (foreign_key_check)', broken.length === 0, JSON.stringify(broken.slice(0, 3)))
  const integrity = sqlite.pragma('integrity_check', { simple: true })
  check('integrity_check', integrity === 'ok', integrity)
  const doubled = sqlite.prepare('select kind, item_id from assignments where returned_at is null group by kind, item_id having count(*) > 1').all()
  check('one open assignment per item', doubled.length === 0, JSON.stringify(doubled.slice(0, 3)))
  const triggers = sqlite.prepare("select name from sqlite_master where type = 'trigger' order by name").pluck().all()
  const wanted = ['assets_keep_held', 'assignments_item_exists', 'assignments_item_fixed', 'digital_assets_keep_held']
  check('delete-guard triggers', wanted.every((name) => triggers.includes(name)), `found ${triggers.join(', ') || 'none'}`)

  /** Whether the statement is refused with that message; whatever it did is rolled back. */
  const refused = (statement, message) => {
    sqlite.exec('savepoint probe')
    try {
      sqlite.exec(statement)
      return false
    } catch (error) {
      return message.test(String(error))
    } finally {
      sqlite.exec('rollback to probe; release probe')
    }
  }
  const held = (kind) => after.assignments.find((row) => row.kind === kind)?.item_id
  for (const [kind, table] of [
    ['asset', 'assets'],
    ['digital-asset', 'digital_assets'],
  ]) {
    const item = held(kind)
    if (item === undefined) line('INFO', `${table} delete guard`, 'no assignment of this kind to try it on')
    else check(`${table} with history can't be deleted`, refused(`delete from ${table} where id = ${item}`, /never deleted/), 'the delete went through')
  }
  const user = sqlite.prepare('select id from users order by id limit 1').pluck().get()
  const employee = sqlite.prepare('select id from employees order by id limit 1').pluck().get()
  if (user !== undefined && employee !== undefined) {
    check(
      'an assignment names an item that is there',
      refused(`insert into assignments (kind, item_id, employee_id, issued_at, issued_by_id) values ('asset', -1, ${employee}, 0, ${user})`, /no such item/),
      'the insert went through',
    )
  }
  sqlite.close()
} catch (error) {
  line('FAIL', 'rehearsal', error instanceof Error ? error.message : String(error))
} finally {
  if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true })
}

console.log(failed ? `RESULT: FAIL (${failed})` : `RESULT: PASS${process.env.KEEP ? `, migrated copy in ${copy}` : ''}`)
process.exit(failed ? 1 : 0)
