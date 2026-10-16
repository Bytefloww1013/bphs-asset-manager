import { count } from 'drizzle-orm'
import type { Db } from './db/client.ts'
import { assetTypes, conditionRatings, users } from './db/schema.ts'
import { config } from './config.ts'
import { hashPassword } from './lib/password.ts'

export const DEFAULT_TYPES = ['Laptop', 'Phone', 'Monitor', 'Keyboard', 'Mouse']
/** Best condition first, each with its score out of 100. */
export const DEFAULT_RATINGS = [
  { name: 'New', score: 100 },
  { name: 'Good', score: 80 },
  { name: 'Fair', score: 60 },
  { name: 'Poor', score: 30 },
  { name: 'Damaged', score: 10 },
]

/**
 * Fill the reference lists on first run so the forms are usable immediately. A database with users in it is not new: whatever its
 * lists hold is what its admins made of them, and an emptied list must not come back to the defaults at the next restart.
 */
export function ensureDefaultLists(db: Db) {
  if ((db.select({ n: count() }).from(users).get()?.n ?? 0) > 0) return
  if ((db.select({ n: count() }).from(assetTypes).get()?.n ?? 0) === 0) {
    db.insert(assetTypes).values(DEFAULT_TYPES.map((name) => ({ name }))).run()
  }
  if ((db.select({ n: count() }).from(conditionRatings).get()?.n ?? 0) === 0) {
    db.insert(conditionRatings).values(DEFAULT_RATINGS).run()
  }
}

/** The first Super Admin's starting password, fixed so the first sign-in needs no log. It must be changed at first login. */
const BOOTSTRAP_PASSWORD = 'Brightpath1!'

/** With no users there is no way in, so create the first Super Admin with the starting password. */
export async function ensureBootstrapAdmin(db: Db, log: (message: string) => void = console.log) {
  if ((db.select({ n: count() }).from(users).get()?.n ?? 0) > 0) return
  db.insert(users)
    .values({
      name: config.bootstrapName,
      email: config.bootstrapEmail,
      passwordHash: await hashPassword(BOOTSTRAP_PASSWORD),
      superAdmin: true,
      mustChangePassword: true,
    })
    .run()
  const line = '='.repeat(64)
  log(
    [
      line,
      'FIRST RUN: created the initial Super Admin account.',
      `  email:    ${config.bootstrapEmail}`,
      `  password: ${BOOTSTRAP_PASSWORD}   (you must change it at first login)`,
      line,
    ].join('\n'),
  )
}
