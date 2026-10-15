import { eq } from 'drizzle-orm'
import type { Role } from '../../shared/constants.ts'
import { createApp } from '../app.ts'
import { ensureDefaultLists } from '../bootstrap.ts'
import { createDb, runMigrations, type Db } from '../db/client.ts'
import { employees, users } from '../db/schema.ts'
import { hashPassword } from '../lib/password.ts'

export const PASSWORD = 'Sup3r-secret!'

export async function setup() {
  const { db, sqlite } = createDb(':memory:')
  runMigrations(db)
  ensureDefaultLists(db)
  const app = createApp(db, { quiet: true })
  const passwordHash = await hashPassword(PASSWORD)

  const person = db
    .insert(employees)
    .values({ code: 'E-1042', firstName: 'Priya', lastName: 'Raghunathan', department: 'IT' })
    .returning()
    .get()
  const add = (name: string, email: string, role: Role, extra: Partial<typeof users.$inferInsert> = {}) =>
    db.insert(users).values({ name, email, passwordHash, role, mustChangePassword: false, ...extra }).returning().get()
  const superUser = add('Priya Raghunathan', 'p.raghunathan@bphs.local', 'super_admin', { employeeId: person.id })
  const adminUser = add('Marcus Oyelaran', 'm.oyelaran@bphs.local', 'admin')

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

  const lookups = async (cookie: string) =>
    (await call('GET', '/api/lookups', { cookie })).data as {
      assetTypes: { id: number; name: string }[]
      conditionRatings: { id: number; name: string }[]
    }

  return { db, sqlite, app, call, signIn, asSuper, asAdmin, superUser, adminUser, person, lookups }
}

export const findUser = (db: Db, email: string) => db.select().from(users).where(eq(users.email, email)).get()
