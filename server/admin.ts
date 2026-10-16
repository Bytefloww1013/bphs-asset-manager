/**
 * Break-glass account recovery for whoever controls the server. Use it when nobody can sign in
 * (every Super Admin locked out or without a password). Normal account work belongs on the Users screen.
 *
 *   node server/admin.ts list                      # accounts and their state
 *   node server/admin.ts unlock <email>            # clear a lock and the failed-attempt count
 *   node server/admin.ts reset-password <email>    # new one-time password, must change at next sign-in
 *   docker compose exec assets node server/admin.ts reset-password admin@bphs.local
 *
 * Every change is written to the audit log as actor "server-cli".
 */
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describeAccess } from '../shared/permissions.ts'
import { config } from './config.ts'
import { createDb, type DbLike } from './db/client.ts'
import { auditLog, users } from './db/schema.ts'
import { generateOneTimePassword, hashPassword } from './lib/password.ts'
import { deleteUserSessions } from './services/auth.ts'

const USAGE = 'Usage: node server/admin.ts list | unlock <email> | reset-password <email>'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const file = path.join(config.dataDir, 'bphs.sqlite')
if (!fs.existsSync(file)) fail(`No database at ${file}`)

const [command, emailArg] = process.argv.slice(2)
const { db, sqlite } = createDb(file)

function findUser(db: DbLike, email: string | undefined) {
  if (!email) fail(USAGE)
  const row = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get()
  if (!row) fail(`No account for ${email}. Run "list" to see the accounts.`)
  return row
}

function audit(db: DbLike, userId: number, details: string) {
  db.insert(auditLog)
    .values({ occurredAt: new Date(), userId: null, actor: 'server-cli', action: 'update', entityType: 'user', entityId: userId, details })
    .run()
}

if (command === 'list') {
  const now = new Date()
  const rows = db.select().from(users).orderBy(users.email).all()
  for (const u of rows) {
    const state = !u.isActive ? 'deactivated' : u.lockedUntil && u.lockedUntil > now ? `locked until ${u.lockedUntil.toISOString()}` : 'active'
    console.log([u.email.padEnd(32), describeAccess(u).padEnd(15), state, u.mustChangePassword ? '(must change password)' : ''].join('  ').trimEnd())
  }
} else if (command === 'unlock') {
  const user = findUser(db, emailArg)
  db.transaction((tx) => {
    tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id)).run()
    audit(tx, user.id, `${user.email} · locked_until cleared via server CLI`)
  })
  console.log(`Unlocked ${user.email}.`)
} else if (command === 'reset-password') {
  const user = findUser(db, emailArg)
  const oneTimePassword = generateOneTimePassword()
  const passwordHash = await hashPassword(oneTimePassword)
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id)).run()
    deleteUserSessions(tx, user.id)
    audit(tx, user.id, `${user.email} · password reset via server CLI · must change on next login`)
  })
  console.log(`Password reset for ${user.email}.`)
  console.log(`  one-time password: ${oneTimePassword}   (they must change it at the next sign-in)`)
  if (!user.isActive) console.log('  Note: this account is deactivated; a Super Admin must reactivate it on the Users screen.')
} else {
  fail(USAGE)
}

sqlite.close()
