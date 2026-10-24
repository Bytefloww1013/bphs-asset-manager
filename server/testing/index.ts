import { employees } from '#foundation/employees/server/index.ts'
import { scryptSync } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import type { Access } from '../../shared/constants.ts'
import { createApp } from '../app.ts'
import { createDb, runMigrations, type Db } from '../db/client.ts'
import { users } from '../db/schema.ts'
import { startModules } from '../registry.ts'

// The kernel test kit: a migrated in-memory database with every module started (`setup.ts` installs them), the app,
// two signed-in accounts and the calls to drive it. Every server, shared and module test file uses it.

export const PASSWORD = 'Sup3r-secret!'

/** The access each of the old roles became, so a test can say which it means. */
export const ADMIN: Access = { assets: 'edit', grievances: 'edit', employees: 'edit' }
export const ASSET_ADMIN: Access = { assets: 'edit', employees: 'edit' }
export const GRIEVANCE_ADMIN: Access = { grievances: 'edit', employees: 'edit' }

// verifyPassword reads the scrypt cost from the stored hash, so a low-cost test hash makes every sign-in near instant.
const SALT = Buffer.alloc(16, 7)
const passwordHash = [
  'scrypt',
  16,
  8,
  1,
  SALT.toString('base64'),
  scryptSync(PASSWORD.normalize('NFKC'), SALT, 64, { N: 16, r: 8, p: 1 }).toString('base64'),
].join('$')

export async function setup() {
  const { db, sqlite } = createDb(':memory:')
  runMigrations(db)
  await startModules(db)
  const app = createApp(db, { quiet: true })

  const person = db
    .insert(employees)
    .values({ code: 'E-1042', firstName: 'Priya', lastName: 'Raghunathan', department: 'IT' })
    .returning()
    .get()
  const add = (name: string, email: string, extra: Partial<typeof users.$inferInsert>) =>
    db
      .insert(users)
      .values({ name, email, passwordHash, mustChangePassword: false, ...extra })
      .returning()
      .get()
  const superUser = add('Priya Raghunathan', 'p.raghunathan@bphs.local', { superAdmin: true, employeeId: person.id })
  const adminUser = add('Marcus Oyelaran', 'm.oyelaran@bphs.local', { access: ADMIN })
  /** Another account, with the same password as the others. */
  const addUser = (email: string, extra: Partial<typeof users.$inferInsert> = {}) => add(email, email, extra)

  async function call(method: string, path: string, options: { cookie?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = {}
    if (options.cookie) headers.cookie = options.cookie
    // Like the real client: every write is JSON, which also keeps Hono's CSRF check out of the way.
    if (method !== 'GET') headers['content-type'] = 'application/json'
    const res = await app.request(path, {
      method,
      headers,
      body: options.body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(options.body),
    })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { status: res.status, data, headers: res.headers }
  }

  async function signIn(email: string, password = PASSWORD, remember = false) {
    const res = await call('POST', '/api/auth/login', { body: { email, password, remember } })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    return { ...res, cookie }
  }

  const asSuper = async () => (await signIn('p.raghunathan@bphs.local')).cookie
  const asAdmin = async () => (await signIn('m.oyelaran@bphs.local')).cookie
  /** Signs in a new account with exactly this access. */
  async function signInAs(access: Access, employeeId: number | null = null) {
    const email = `x${Math.random().toString(36).slice(2)}@bphs.local`
    const user = add('Rosa Lindqvist', email, { access, employeeId })
    return { user, cookie: (await signIn(email)).cookie }
  }

  return { db, sqlite, app, call, signIn, asSuper, asAdmin, signInAs, superUser, adminUser, person, addUser }
}

export const findUser = (db: Db, email: string) => db.select().from(users).where(eq(users.email, email)).get()

/** A raw database migrated up to, not including, the migration whose file starts with `prefix`, to test an upgrade. */
export function migratedBefore(prefix: string, { foreignKeys = false } = {}) {
  const folder = path.join(import.meta.dirname, '../db/migrations')
  const files = fs
    .readdirSync(folder)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  const at = files.findIndex((file) => file.startsWith(prefix))
  const sqlite = new Database(':memory:')
  if (foreignKeys) sqlite.pragma('foreign_keys = ON')
  const apply = (list: string[]) => {
    for (const file of list)
      for (const statement of fs.readFileSync(path.join(folder, file), 'utf8').split('--> statement-breakpoint'))
        sqlite.exec(statement)
  }
  apply(files.slice(0, at))
  /** `next` applies the migration named by `prefix`; `rest` applies it and every one after. */
  return { sqlite, next: () => apply(files.slice(at, at + 1)), rest: () => apply(files.slice(at)) }
}
