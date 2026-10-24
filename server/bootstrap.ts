import { count } from 'drizzle-orm'
import type { Db } from './db/client.ts'
import { users } from './db/schema.ts'
import { config } from './config.ts'
import { hashPassword } from './lib/password.ts'

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
