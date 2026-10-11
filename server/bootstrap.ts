import { count } from 'drizzle-orm'
import type { Db } from './db/client.ts'
import { assetTypes, conditionRatings, users } from './db/schema.ts'
import { config } from './config.ts'
import { generateOneTimePassword, hashPassword } from './lib/password.ts'

export const DEFAULT_TYPES = ['Laptop', 'Phone', 'Monitor', 'Keyboard', 'Mouse']
/** Best condition first. */
export const DEFAULT_RATINGS = ['New', 'Good', 'Fair', 'Poor', 'Damaged']

/** Fill empty reference lists on first run so the forms are usable immediately. */
export function ensureDefaultLists(db: Db) {
  if ((db.select({ n: count() }).from(assetTypes).get()?.n ?? 0) === 0) {
    db.insert(assetTypes).values(DEFAULT_TYPES.map((name) => ({ name }))).run()
  }
  if ((db.select({ n: count() }).from(conditionRatings).get()?.n ?? 0) === 0) {
    db.insert(conditionRatings).values(DEFAULT_RATINGS.map((name, i) => ({ name, sortOrder: i + 1 }))).run()
  }
}

/**
 * With no users there is no way in, so create the first Super Admin and print a
 * one-time password to the log. It must be changed at first login.
 */
export async function ensureBootstrapAdmin(db: Db, log: (message: string) => void = console.log) {
  if ((db.select({ n: count() }).from(users).get()?.n ?? 0) > 0) return
  const password = generateOneTimePassword()
  db.insert(users)
    .values({
      name: config.bootstrapName,
      email: config.bootstrapEmail,
      passwordHash: await hashPassword(password),
      role: 'super_admin',
      mustChangePassword: true,
    })
    .run()
  const line = '='.repeat(64)
  log(
    [
      line,
      'FIRST RUN: created the initial Super Admin account.',
      `  email:    ${config.bootstrapEmail}`,
      `  password: ${password}   (one-time; you must change it at first login)`,
      line,
    ].join('\n'),
  )
}
