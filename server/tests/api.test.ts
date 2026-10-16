import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createApp } from '../app.ts'
import { DEFAULT_RATINGS, DEFAULT_TYPES, ensureDefaultLists } from '../bootstrap.ts'
import { createDb, runMigrations } from '../db/client.ts'
import { assetTypes, assets, auditLog, conditionRatings, employees, sessions, users } from '../db/schema.ts'
import { changePassword, login } from '../services/auth.ts'
import { ADMIN, PASSWORD, findUser, setup } from './helpers.ts'

/** When a Set-Cookie header says the cookie expires. */
const cookieExpiry = (header: string | null) => new Date(/expires=([^;]+)/i.exec(header ?? '')?.[1] ?? NaN)

describe('authentication', () => {
  it('signs in, sets an httpOnly cookie, and rejects bad credentials', async () => {
    const t = await setup()
    const ok = await t.signIn('p.raghunathan@bphs.local')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(ok.data.user.superAdmin).toBe(true)

    const bad = await t.signIn('p.raghunathan@bphs.local', 'nope')
    expect(bad.status).toBe(401)
    const unknown = await t.signIn('nobody@bphs.local', 'nope')
    expect(unknown.status).toBe(401)
    expect(unknown.data.message).toBe(bad.data.message)
  })

  it('requires a session for the API', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/assets')).status).toBe(401)
    expect((await t.call('GET', '/api/health')).status).toBe(200)
  })

  it('locks the account after five wrong passwords, even for the right one', async () => {
    const t = await setup()
    for (let i = 0; i < 4; i++) expect((await t.signIn('m.oyelaran@bphs.local', 'wrong')).status).toBe(401)
    const fifth = await t.signIn('m.oyelaran@bphs.local', 'wrong')
    expect(fifth.status).toBe(423)
    expect(fifth.data.details.lockedUntil).toBeTruthy()

    const correct = await t.signIn('m.oyelaran@bphs.local')
    expect(correct.status).toBe(423)

    // The lock runs out on its own and the count starts again.
    t.db.update(users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(users.email, 'm.oyelaran@bphs.local')).run()
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(200)
    expect(findUser(t.db, 'm.oyelaran@bphs.local')?.failedLogins).toBe(0)
  })

  it('counts wrong passwords sent in parallel, so a burst cannot dodge the lock', async () => {
    const t = await setup()
    const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => t.signIn('m.oyelaran@bphs.local', `wrong-${i}`)))
    // Four attempts get a plain 401; the fifth locks the account, and any later one is refused as locked.
    expect(burst.filter((r) => r.status === 401).length).toBeLessThanOrEqual(4)
    expect(burst.every((r) => r.status === 401 || r.status === 423)).toBe(true)

    const row = findUser(t.db, 'm.oyelaran@bphs.local')
    expect(row?.failedLogins).toBeGreaterThanOrEqual(5)
    expect(row?.lockedUntil).toBeTruthy()
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(423)
  })

  it('writes one lock entry when an account locks, and none for the attempts before or after', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const locks = async () => (await t.call('GET', '/api/audit?action=lock', { cookie })).data.entries

    for (let i = 0; i < 4; i++) await t.signIn('m.oyelaran@bphs.local', 'wrong')
    await t.signIn('nobody@bphs.local', 'wrong')
    expect(await locks()).toEqual([])

    expect((await t.signIn('m.oyelaran@bphs.local', 'wrong')).status).toBe(423)
    for (let i = 0; i < 3; i++) await t.signIn('m.oyelaran@bphs.local', 'wrong')
    const entries = await locks()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      actor: 'sign-in',
      action: 'lock',
      entityType: 'user',
      entityId: t.adminUser.id,
      details: 'm.oyelaran@bphs.local · locked for 15 minutes after 5 incorrect passwords',
    })

    // A burst of parallel attempts on another account still logs its lock once.
    await Promise.all(Array.from({ length: 10 }, (_, i) => t.signIn('p.raghunathan@bphs.local', `wrong-${i}`)))
    expect(t.db.all(sql`select id from audit_log where action = 'lock'`)).toHaveLength(2)
  })

  it('refuses a correct password that was still being checked when the account locked', async () => {
    const t = await setup()
    // login() has read the unlocked row and is hashing; the lock lands before it finishes.
    const pending = login(t.db, 'm.oyelaran@bphs.local', PASSWORD)
    t.db
      .update(users)
      .set({ failedLogins: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) })
      .where(eq(users.email, 'm.oyelaran@bphs.local'))
      .run()
    await expect(pending).rejects.toMatchObject({ status: 423, code: 'account_locked' })
    expect(t.db.select().from(sessions).all()).toHaveLength(0)
  })

  it('lets a password reset win over a sign-in or password change still checking the old password', async () => {
    const t = await setup()
    const reset = (id: number) => t.db.update(users).set({ passwordHash: 'reset-by-admin' }).where(eq(users.id, id)).run()

    // Each has read the old password and is hashing when the reset lands.
    const signingIn = login(t.db, 'p.raghunathan@bphs.local', PASSWORD)
    reset(t.superUser.id)
    await expect(signingIn).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' })
    expect(t.db.select().from(sessions).all()).toHaveLength(0)

    const changing = changePassword(t.db, t.adminUser, PASSWORD, 'Brand-new-1!', undefined)
    reset(t.adminUser.id)
    await expect(changing).rejects.toMatchObject({ status: 409, code: 'password_changed' })
    expect(findUser(t.db, 'm.oyelaran@bphs.local')?.passwordHash).toBe('reset-by-admin')
  })

  it('walls off every page until a required password change is done', async () => {
    const t = await setup()
    t.db.update(users).set({ mustChangePassword: true }).where(eq(users.email, 'm.oyelaran@bphs.local')).run()
    const cookie = await t.asAdmin()
    const blocked = await t.call('GET', '/api/assets', { cookie })
    expect(blocked.status).toBe(403)
    expect(blocked.data.error).toBe('password_change_required')
    expect((await t.call('GET', '/api/auth/me', { cookie })).status).toBe(200)

    const weak = await t.call('POST', '/api/auth/password-change', {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: 'short' },
    })
    expect(weak.status).toBe(422)
    const changed = await t.call('POST', '/api/auth/password-change', {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: 'Brand-new-1!' },
    })
    expect(changed.status).toBe(200)
    expect((await t.call('GET', '/api/assets', { cookie })).status).toBe(200)
  })

  it('ends the cookie with the browser and the session after 12 idle hours, unless asked to keep the person signed in for 30 days', async () => {
    const t = await setup()
    const hour = 3_600_000
    const signedIn = await t.signIn('m.oyelaran@bphs.local')
    expect(signedIn.headers.get('set-cookie')).not.toMatch(/expires|max-age/i)
    const [session] = t.db.select().from(sessions).all()
    expect(session!.remember).toBe(false)
    expect(Math.abs(session!.expiresAt.getTime() - Date.now() - 12 * hour)).toBeLessThan(60_000)

    const kept = await t.signIn('p.raghunathan@bphs.local', PASSWORD, true)
    const remembered = t.db.select().from(sessions).where(eq(sessions.remember, true)).get()!
    expect(Math.abs(remembered.expiresAt.getTime() - Date.now() - 30 * 24 * hour)).toBeLessThan(60_000)
    expect(Math.abs(cookieExpiry(kept.headers.get('set-cookie')).getTime() - remembered.expiresAt.getTime())).toBeLessThan(1000)

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // The server still slides the short session, but its cookie has no expiry to send again.
      vi.setSystemTime(Date.now() + 3 * hour)
      const slid = await t.call('GET', '/api/auth/me', { cookie: signedIn.cookie })
      expect(slid.status).toBe(200)
      expect(slid.headers.get('set-cookie')).toBeNull()
      vi.setSystemTime(Date.now() + 13 * hour)
      expect((await t.call('GET', '/api/auth/me', { cookie: signedIn.cookie })).status).toBe(401)
      expect((await t.call('GET', '/api/auth/me', { cookie: kept.cookie })).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves the cookie forward whenever the server moves a remembered session, so an active person is not signed out', async () => {
    const t = await setup()
    const signedIn = await t.signIn('m.oyelaran@bphs.local', PASSWORD, true)
    const issued = cookieExpiry(signedIn.headers.get('set-cookie'))
    expect(issued.getTime()).toBeGreaterThan(Date.now())

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      // Three hours of work later, past the five minutes after which a request slides the session.
      vi.setSystemTime(Date.now() + 3 * 3_600_000)
      const slid = await t.call('GET', '/api/auth/me', { cookie: signedIn.cookie })
      expect(slid.status).toBe(200)
      const reissued = slid.headers.get('set-cookie')
      expect(reissued).toContain(signedIn.cookie)
      expect(reissued).toMatch(/HttpOnly/i)
      expect(reissued).toMatch(/SameSite=Lax/i)
      // The browser's expiry is the server's, and it has moved by the three hours.
      const row = t.db.select().from(sessions).get()!
      expect(cookieExpiry(reissued).getTime()).toBe(Math.floor(row.expiresAt.getTime() / 1000) * 1000)
      expect(cookieExpiry(reissued).getTime() - issued.getTime()).toBeGreaterThanOrEqual(3 * 3_600_000 - 1000)

      // Nothing moved on the next request, so there is nothing to send.
      expect((await t.call('GET', '/api/auth/me', { cookie: signedIn.cookie })).headers.get('set-cookie')).toBeNull()

      // The session moves whatever the answer is, including a refusal.
      t.db.update(users).set({ mustChangePassword: true }).where(eq(users.email, 'm.oyelaran@bphs.local')).run()
      vi.setSystemTime(Date.now() + 10 * 60_000)
      const refused = await t.call('GET', '/api/assets', { cookie: signedIn.cookie })
      expect(refused.status).toBe(403)
      expect(refused.headers.get('set-cookie')).toContain(signedIn.cookie)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses a password over 256 characters when signing in and when choosing one, without counting it as a wrong guess', async () => {
    const t = await setup()
    const tooLong = 'Aa1!' + 'x'.repeat(253)
    const signIn = await t.signIn('m.oyelaran@bphs.local', tooLong)
    expect(signIn.status).toBe(422)
    expect(signIn.data.details.fields).toEqual({ password: 'Password can be at most 256 characters' })
    expect(findUser(t.db, 'm.oyelaran@bphs.local')?.failedLogins).toBe(0)

    const cookie = await t.asAdmin()
    const change = (newPassword: string, currentPassword = PASSWORD) =>
      t.call('POST', '/api/auth/password-change', { cookie, body: { currentPassword, newPassword } })
    const refused = await change(tooLong)
    expect(refused.status).toBe(422)
    expect(refused.data.details.fields.newPassword).toBe('Password can be at most 256 characters')
    expect((await change('Brand-new-1!', tooLong)).data.details.fields.currentPassword).toBe('Current password can be at most 256 characters')

    // 256 itself is allowed, and works to sign in.
    const longest = 'Aa1!' + 'x'.repeat(252)
    expect((await change(longest)).status).toBe(200)
    expect((await t.signIn('m.oyelaran@bphs.local', longest)).status).toBe(200)
  })
})

describe('request limits', () => {
  it('refuses a body over the limit, and a far smaller one before sign-in', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const post = (url: string, body: string, headers: Record<string, string> = {}) =>
      t.app.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })

    // Nothing sent to sign in comes near 16 KB.
    const bloated = await post('/api/auth/login', JSON.stringify({ email: 'm.oyelaran@bphs.local', password: 'x'.repeat(20_000) }))
    expect(bloated.status).toBe(413)
    expect(await bloated.json()).toMatchObject({ error: 'payload_too_large' })
    // A declared length is enough: the body is not read to find out.
    expect((await post('/api/auth/login', '{}', { 'content-length': String(30 * 1024 * 1024) })).status).toBe(413)
    expect((await post('/api/auth/login', JSON.stringify({ email: 'm.oyelaran@bphs.local', password: PASSWORD }))).status).toBe(200)

    // Everywhere else the limit leaves room for the largest import the page sends: 2,000 rows with every cell full.
    const full = (i: number) => ({ row: i + 2, values: { code: `E-${i}`.padEnd(300, 'x'), firstName: 'F'.repeat(300), lastName: 'L'.repeat(300), department: 'D'.repeat(300), jobTitle: 'J'.repeat(300) } })
    const biggest = JSON.stringify({ rows: Array.from({ length: 2000 }, (_, i) => full(i)) })
    expect(biggest.length).toBeGreaterThan(3 * 1024 * 1024)
    expect((await post('/api/import/employees/preview', biggest, { cookie })).status).toBe(200)
    const tooBig = await post('/api/import/employees/preview', JSON.stringify({ rows: [{ row: 2, values: { code: 'a'.repeat(4 * 1024 * 1024) } }] }), { cookie })
    expect(tooBig.status).toBe(413)
    expect(((await tooBig.json()) as { message: string }).message).toMatch(/too large/i)
    // The same before sign-in: refused as too large, not read and answered with a 401.
    expect((await post('/api/assets', JSON.stringify({ tag: 'x'.repeat(4 * 1024 * 1024) }))).status).toBe(413)
  })

  it('refuses an upload from someone not signed in without reading any of it', async () => {
    const t = await setup()
    let read = 0
    // No Content-Length, and no end: anything that buffers it shows up in `read`.
    const endless = new ReadableStream({ pull: (c) => { read += 65536; c.enqueue(new Uint8Array(65536)) } }, { highWaterMark: 0 })
    const res = await t.app.request('/api/grievances', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', origin: 'http://localhost' },
      body: endless,
      duplex: 'half',
    } as RequestInit)
    expect(res.status).toBe(401)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(read).toBe(0)
  })
})

describe('serving the built web app', () => {
  function build() {
    const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bphs-web-'))
    fs.mkdirSync(path.join(webDir, 'static'))
    fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>shell</title>')
    fs.writeFileSync(path.join(webDir, 'static', 'app-abc123.js'), 'export {}')
    return webDir
  }

  it('caches a built file for a year, but never answers a missing one with the shell', async () => {
    const t = await setup()
    const webDir = build()
    try {
      const app = createApp(t.db, { quiet: true, serveWeb: true, webDir })

      const chunk = await app.request('/static/app-abc123.js')
      expect(chunk.status).toBe(200)
      expect(chunk.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')

      // A tab still running the previous build asks for a chunk that the new build does not have.
      const gone = await app.request('/static/does-not-exist-abc123.js')
      expect(gone.status).toBe(404)
      expect(gone.headers.get('content-type')).not.toMatch(/html/)
      expect(gone.headers.get('cache-control')).toBe('no-store')
      expect((await app.request('/static/')).status).toBe(404)

      // Routes of the app are the shell, checked again every time.
      const route = await app.request('/assets/BPHS-0001')
      expect(route.status).toBe(200)
      expect(await route.text()).toContain('shell')
      expect(route.headers.get('cache-control')).toBe('no-cache')
      expect((await app.request('/')).headers.get('cache-control')).toBe('no-cache')

      // A path of the API that does not exist is JSON, not the shell.
      const api = await app.request('/api/nothing-here', { headers: { cookie: await t.asSuper() } })
      expect(api.status).toBe(404)
      expect(await api.json()).toMatchObject({ error: 'not_found' })
    } finally {
      fs.rmSync(webDir, { recursive: true, force: true })
    }
  })
})

describe('assets, assignments and the one-active-assignment rule', () => {
  async function seed() {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    const laptop = assetTypes.find((x) => x.name === 'Laptop')!
    const good = conditionRatings.find((x) => x.name === 'Good')!
    const fair = conditionRatings.find((x) => x.name === 'Fair')!
    const make = async (tag: string) =>
      (await t.call('POST', '/api/assets', { cookie, body: { tag, typeId: laptop.id, serial: 'SN-' + tag, conditionRatingId: good.id } })).data
    return { t, cookie, laptop, good, fair, make }
  }

  it('creates an asset in storage with an intake condition and an audit entry', async () => {
    const { t, cookie, make } = await seed()
    const asset = await make('bphs-0150')
    expect(asset.tag).toBe('BPHS-0150')
    expect(asset.state).toBe('in_storage')
    expect(asset.condition.rating).toBe('Good')
    const audit = await t.call('GET', '/api/audit', { cookie })
    expect(audit.data.entries[0]).toMatchObject({ action: 'create', entityType: 'asset', details: 'BPHS-0150 · Laptop' })
    const dup = await t.call('POST', '/api/assets', { cookie, body: { tag: 'BPHS-0150', typeId: asset.typeId, conditionRatingId: 1 } })
    expect(dup.status).toBe(409)
  })

  it('names the field and the limit when a value is refused, so a form can show it under that field', async () => {
    const { t, cookie, laptop, good, make } = await seed()
    const asset = await make('BPHS-0400')
    const post = (body: Record<string, unknown>) =>
      t.call('POST', '/api/assets', { cookie, body: { tag: 'BPHS-0401', typeId: laptop.id, conditionRatingId: good.id, ...body } })
    const fields = (res: { data: any }) => res.data.details.fields

    const serial = await post({ serial: 'S'.repeat(81) })
    expect(serial.status).toBe(422)
    expect(serial.data.message).toBe('Serial number can be at most 80 characters')
    expect(fields(serial)).toEqual({ serial: 'Serial number can be at most 80 characters' })
    expect(fields(await post({ tag: 'T'.repeat(41) }))).toEqual({ tag: 'Asset tag can be at most 40 characters' })
    expect(fields(await post({ notes: 'N'.repeat(1001) }))).toEqual({ notes: 'Notes can be at most 1000 characters' })

    // Rules the schema cannot see name their field in the same place.
    const duplicate = await post({ tag: 'bphs-0400' })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ tag: 'Asset tag BPHS-0400 already exists.' })
    expect(fields(await post({ typeId: 9999 }))).toEqual({ typeId: 'Choose an active asset type.' })

    // The edit sheet sends tag, type and serial together.
    const edit = await t.call('PATCH', `/api/assets/${asset.id}`, { cookie, body: { tag: asset.tag, typeId: laptop.id, serial: 'S'.repeat(81) } })
    expect(edit.status).toBe(422)
    expect(fields(edit)).toEqual({ serial: 'Serial number can be at most 80 characters' })
  })

  it('issues once, refuses a second holder, and records both condition snapshots', async () => {
    const { t, cookie, good, fair, make } = await seed()
    const asset = await make('BPHS-0141')
    const issued = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(issued.status).toBe(201)
    expect(issued.data.issueRating).toBe('Good')

    const second = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(second.status).toBe(409)
    expect(second.data.error).toBe('asset_already_assigned')

    const ret = await t.call('POST', `/api/assignments/${issued.data.id}/return`, {
      cookie,
      body: { conditionRatingId: fair.id, notes: 'Cracked corner' },
    })
    expect(ret.status).toBe(204)

    const detail = await t.call('GET', '/api/assets/tag/bphs-0141', { cookie })
    expect(detail.data.asset.state).toBe('in_storage')
    expect(detail.data.history).toHaveLength(1)
    expect(detail.data.history[0]).toMatchObject({ issueRating: 'Good', returnRating: 'Fair' })
    expect(detail.data.conditions).toHaveLength(3) // intake + issue + return
    expect(detail.data.asset.condition.rating).toBe('Fair')
  })

  it('records nobody as the assessor when the field is sent empty, and the signed-in user only when it is not sent', async () => {
    const { t, cookie, laptop, good } = await seed()
    const assessors = async (tag: string) =>
      (await t.call('GET', `/api/assets/tag/${tag}`, { cookie })).data.conditions.map((c: { kind: string; assessedBy: string | null }) => [c.kind, c.assessedBy])
    const create = (tag: string, extra: Record<string, unknown>) =>
      t.call('POST', '/api/assets', { cookie, body: { tag, typeId: laptop.id, conditionRatingId: good.id, ...extra } })

    // Not sent: the signed-in user's own employee, at intake, issue and return.
    const own = (await create('BPHS-0160', {})).data
    const ownIssue = await t.call('POST', '/api/assignments', { cookie, body: { assetId: own.id, employeeId: t.person.id, conditionRatingId: good.id } })
    await t.call('POST', `/api/assignments/${ownIssue.data.id}/return`, { cookie, body: { conditionRatingId: good.id } })
    expect((await assessors('BPHS-0160')).sort()).toEqual([
      ['intake', 'Priya Raghunathan'],
      ['issue', 'Priya Raghunathan'],
      ['return', 'Priya Raghunathan'],
    ])

    // Sent empty: nobody, at each of the three.
    const none = (await create('BPHS-0161', { assessedById: null })).data
    const noneIssue = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: none.id, employeeId: t.person.id, conditionRatingId: good.id, assessedById: null },
    })
    expect(noneIssue.status).toBe(201)
    const noneReturn = await t.call('POST', `/api/assignments/${noneIssue.data.id}/return`, { cookie, body: { conditionRatingId: good.id, assessedById: null } })
    expect(noneReturn.status).toBe(204)
    expect((await assessors('BPHS-0161')).sort()).toEqual([
      ['intake', null],
      ['issue', null],
      ['return', null],
    ])

    // A bulk return and an asset created already issued follow the same rule.
    const issuedNow = await create('BPHS-0162', { assessedById: null, holderId: t.person.id })
    expect(issuedNow.status).toBe(201)
    const open = (await t.call('GET', '/api/assignments', { cookie })).data.find((a: { assetTag: string }) => a.assetTag === 'BPHS-0162')
    const bulk = await t.call('POST', '/api/assignments/return-bulk', { cookie, body: { ids: [open.id], conditionRatingId: good.id, assessedById: null } })
    expect(bulk.data.returned).toEqual([open.id])
    expect((await assessors('BPHS-0162')).every(([, who]: [string, string | null]) => who === null)).toBe(true)

    // An unknown employee is still refused.
    const unknown = await create('BPHS-0163', { assessedById: 9999 })
    expect(unknown.status).toBe(422)
    expect(unknown.data.details.fields).toEqual({ assessedById: 'Choose who assessed the condition.' })
  })

  it('reports who already returned an assignment (the race-conflict case)', async () => {
    const { t, cookie, good, make } = await seed()
    const asset = await make('BPHS-0141')
    const issued = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    const other = await t.asAdmin()
    const first = await t.call('POST', `/api/assignments/${issued.data.id}/return`, { cookie: other, body: { conditionRatingId: good.id } })
    expect(first.status).toBe(204)
    const late = await t.call('POST', `/api/assignments/${issued.data.id}/return`, { cookie, body: { conditionRatingId: good.id } })
    expect(late.status).toBe(409)
    expect(late.data.error).toBe('already_returned')
    expect(late.data.message).toBe('BPHS-0141 has already been returned by m.oyelaran@bphs.local.')
    expect(late.data.details).toMatchObject({ returnedBy: 'm.oyelaran@bphs.local', returnedByYou: false })
    expect(Date.parse(late.data.details.returnedAt)).toBeLessThanOrEqual(Date.now())

    // The same person again, from another tab say: it was not "another user".
    const again = await t.call('POST', `/api/assignments/${issued.data.id}/return`, { cookie: other, body: { conditionRatingId: good.id } })
    expect(again.status).toBe(409)
    expect(again.data.message).toBe('BPHS-0141 has already been returned by you.')
    expect(again.data.details).toMatchObject({ returnedBy: 'm.oyelaran@bphs.local', returnedByYou: true })
    // A bulk return passes the same sentence on for the row it could not close.
    const bulk = await t.call('POST', '/api/assignments/return-bulk', { cookie, body: { ids: [issued.data.id], conditionRatingId: good.id } })
    expect(bulk.data).toEqual({ returned: [], failed: [{ id: issued.data.id, message: 'BPHS-0141 has already been returned by m.oyelaran@bphs.local.' }] })
  })

  it('the database itself refuses two open assignments for one asset', async () => {
    const { t, good, make, cookie } = await seed()
    const asset = await make('BPHS-0141')
    await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id } })
    expect(() =>
      t.sqlite
        .prepare('insert into assignments (asset_id, employee_id, issued_at, issued_by_id) values (?, ?, ?, ?)')
        .run(asset.id, t.person.id, Date.now(), t.superUser.id),
    ).toThrow(/UNIQUE/)
  })

  it('cannot retire an assigned asset, but can retire and reinstate one in storage', async () => {
    const { t, cookie, good, make } = await seed()
    const asset = await make('BPHS-0141')
    await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id } })
    expect((await t.call('POST', `/api/assets/${asset.id}/retire`, { cookie })).status).toBe(409)

    const spare = await make('BPHS-0142')
    const retired = await t.call('POST', `/api/assets/${spare.id}/retire`, { cookie })
    expect(retired.data.state).toBe('retired')
    const issueRetired = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: spare.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(issueRetired.data.error).toBe('asset_retired')
    expect((await t.call('POST', `/api/assets/${spare.id}/reinstate`, { cookie })).data.state).toBe('in_storage')
  })

  it('only a Super Admin may delete, and never an asset with history', async () => {
    const { t, cookie, good, make } = await seed()
    const admin = await t.asAdmin()
    const clean = await make('BPHS-0150')
    expect((await t.call('DELETE', `/api/assets/${clean.id}`, { cookie: admin })).status).toBe(403)

    const used = await make('BPHS-0141')
    await t.call('POST', '/api/assignments', { cookie, body: { assetId: used.id, employeeId: t.person.id, conditionRatingId: good.id } })
    const refused = await t.call('DELETE', `/api/assets/${used.id}`, { cookie })
    expect(refused.status).toBe(409)
    expect(refused.data.error).toBe('has_history')

    expect((await t.call('DELETE', `/api/assets/${clean.id}`, { cookie })).status).toBe(204)
    expect((await t.call('GET', '/api/assets/tag/BPHS-0150', { cookie })).status).toBe(404)
  })

  it('bulk-adds rows independently and reports the bad ones by row number', async () => {
    const { t, cookie } = await seed()
    const res = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: {
        rows: [
          { tag: 'bphs-0201', type: 'laptop', serial: 'A1' },
          { tag: 'BPHS-0202', type: 'Hoverboard' },
          { tag: 'BPHS-0203', type: 'Phone', condition: 'Fair', holder: 'E-1042' },
          { tag: 'BPHS-0201', type: 'Phone' },
        ],
      },
    })
    expect(res.data.created).toBe(2)
    expect(res.data.errors.map((e: { row: number }) => e.row)).toEqual([2, 4])
    const assets = (await t.call('GET', '/api/assets', { cookie })).data
    expect(assets.find((a: { tag: string }) => a.tag === 'BPHS-0203').state).toBe('assigned')
  })

  it('holds bulk rows to the limits of Add asset and does not create the ones that break them', async () => {
    const { t, cookie } = await seed()
    const res = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: {
        rows: [
          { tag: 'T'.repeat(305), type: 'Laptop', serial: 'S'.repeat(500) },
          { tag: 'BPHS-0301', type: 'Laptop', serial: 'S'.repeat(81) },
          { tag: 'bphs-0302', type: 'Laptop', serial: 'S'.repeat(80) },
        ],
      },
    })
    expect(res.status).toBe(200)
    expect(res.data.created).toBe(1)
    expect(res.data.errors).toEqual([
      { row: 1, message: expect.stringMatching(/Asset tag.*40 characters/) },
      { row: 2, message: expect.stringMatching(/Serial number.*80 characters/) },
    ])
    const stored = (await t.call('GET', '/api/assets', { cookie })).data as { tag: string; serial: string | null }[]
    const tags = stored.map((a) => a.tag)
    expect(tags).toContain('BPHS-0302')
    expect(tags).not.toContain('BPHS-0301')
    expect(stored.every((a) => a.tag.length <= 40 && (a.serial ?? '').length <= 80)).toBe(true)
  })

  it('keeps asset tags to characters that work on a label and in an address, wherever the tag comes from', async () => {
    const { t, cookie, laptop, good, make } = await seed()
    const create = (tag: string) => t.call('POST', '/api/assets', { cookie, body: { tag, typeId: laptop.id, conditionRatingId: good.id } })
    const characters = 'Asset tag can only contain letters, digits, spaces, hyphens, underscores and dots'

    for (const tag of ['A/B', '50%', 'Q?X#Y', 'TAG\\1', 'É-1']) {
      const refused = await create(tag)
      expect(refused.status, tag).toBe(422)
      expect(refused.data.details.fields).toEqual({ tag: characters })
    }
    // "." and ".." can be stored but never opened: a URL treats them as "here" and "one level up".
    for (const tag of ['.', '..', '...']) expect((await create(tag)).data.details.fields, tag).toEqual({ tag: 'Asset tag cannot be only dots' })

    for (const tag of ['tag with space', 'a_b.c-1', '.5']) {
      const made = await create(tag)
      expect(made.status, tag).toBe(201)
      expect(made.data.tag).toBe(tag.toUpperCase())
      expect((await t.call('GET', `/api/assets/tag/${encodeURIComponent(made.data.tag)}`, { cookie })).status, tag).toBe(200)
    }

    // The same rule for a rename and for pasted rows.
    const asset = await make('BPHS-0500')
    const rename = await t.call('PATCH', `/api/assets/${asset.id}`, { cookie, body: { tag: 'BPHS/0500' } })
    expect(rename.status).toBe(422)
    expect(rename.data.details.fields).toEqual({ tag: characters })
    const pasted = await t.call('POST', '/api/assets/bulk', { cookie, body: { rows: [{ tag: 'BPHS/0501', type: 'Laptop' }, { tag: '..', type: 'Laptop' }, { tag: 'BPHS-0502', type: 'Laptop' }] } })
    expect(pasted.data).toEqual({
      created: 1,
      errors: [
        { row: 1, message: `Asset tag: ${characters}.` },
        { row: 2, message: 'Asset tag: Asset tag cannot be only dots.' },
      ],
    })

    // An asset tagged before the rule existed is still found, and can still be edited as long as its tag is left alone.
    const old = t.db.insert(assets).values({ tag: 'OLD/TAG', typeId: laptop.id }).returning().get()
    expect((await t.call('GET', '/api/assets/tag/OLD%2FTAG', { cookie })).status).toBe(200)
    const edited = await t.call('PATCH', `/api/assets/${old.id}`, { cookie, body: { serial: 'SN-1' } })
    expect(edited.status).toBe(200)
    expect(edited.data).toMatchObject({ tag: 'OLD/TAG', serial: 'SN-1' })
  })

  it('reports a row that fails for an unforeseen reason and carries on with the rest of a bulk request', async () => {
    const { t, cookie, good, make } = await seed()
    // Two faults the service does not check for: a constraint raised by the database, and an error that is nobody's rule at all.
    t.sqlite.exec(`
      create trigger test_refuse before insert on assets when new.tag = 'BOOM-409' begin select raise(abort, 'refused by a trigger'); end;
      create trigger test_break before insert on assets when new.tag = 'BOOM-500' begin select json('{'); end;`)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const pasted = await t.call('POST', '/api/assets/bulk', {
        cookie,
        body: { rows: ['OK-1', 'BOOM-409', 'BOOM-500', 'BOOM-500', 'OK-2'].map((tag) => ({ tag, type: 'Laptop' })) },
      })
      expect(pasted.status).toBe(200)
      expect(pasted.data).toEqual({
        created: 2,
        errors: [
          { row: 2, message: 'That change conflicts with existing records.' },
          { row: 3, message: 'Something went wrong on the server.' },
          { row: 4, message: 'Something went wrong on the server.' },
        ],
      })
      // Our own fault is logged for whoever runs the server, once, however many rows hit it.
      expect(logged).toHaveBeenCalledTimes(1)
      const tags = ((await t.call('GET', '/api/assets', { cookie })).data as { tag: string }[]).map((a) => a.tag)
      expect(tags).toEqual(expect.arrayContaining(['OK-1', 'OK-2']))
      expect(tags.some((tag) => tag.startsWith('BOOM'))).toBe(false)

      // The same for a bulk return: the middle one cannot be closed, the two around it are.
      const issued: number[] = []
      for (const tag of ['R-1', 'R-2', 'R-3']) {
        const asset = await make(tag)
        issued.push((await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id } })).data.id)
      }
      t.sqlite.exec(`create trigger test_stuck before update on assignments when old.id = ${issued[1]} begin select raise(abort, 'refused by a trigger'); end;`)
      const returned = await t.call('POST', '/api/assignments/return-bulk', { cookie, body: { ids: issued, conditionRatingId: good.id } })
      expect(returned.status).toBe(200)
      expect(returned.data).toEqual({ returned: [issued[0], issued[2]], failed: [{ id: issued[1], message: 'That change conflicts with existing records.' }] })
      expect(((await t.call('GET', '/api/assignments', { cookie })).data as { id: number }[]).map((a) => a.id)).toEqual([issued[1]])
    } finally {
      logged.mockRestore()
    }
  })

  it('says how many rows a paste may hold in words, not in the validator\'s', async () => {
    const { t, cookie } = await seed()
    const none = await t.call('POST', '/api/assets/bulk', { cookie, body: { rows: [] } })
    expect(none.status).toBe(422)
    expect(none.data.message).toBe('Paste at least one row')
    expect(none.data.details.fields.rows).toBe('Paste at least one row')

    const rows = Array.from({ length: 501 }, (_, i) => ({ tag: `BPHS-${String(i + 1000)}`, type: 'Laptop' }))
    const many = await t.call('POST', '/api/assets/bulk', { cookie, body: { rows } })
    expect(many.status).toBe(422)
    expect(many.data.message).toBe('Paste at most 500 rows at a time')
    expect(many.data.details.fields.rows).toBe('Paste at most 500 rows at a time')
  })
})

describe('importing employees and programs', () => {
  type Values = Record<string, string>
  const rowsOf = (...values: Values[]) => ({ rows: values.map((v, i) => ({ row: i + 2, values: v })) })
  const EMPLOYEES = rowsOf(
    { code: 'E-1402', firstName: 'Rosa', lastName: 'Delgado', department: 'Intake', jobTitle: 'Coordinator' },
    { code: 'e-1042', firstName: 'Priya', lastName: 'Raghunathan', department: 'IT', jobTitle: 'Analyst' },
    { code: '', firstName: 'Kerry', lastName: '', department: 'Finance', jobTitle: '' },
    { code: ' E-1403 ', firstName: 'Zhao, Wen', lastName: 'Lee' },
    { code: 'e-1402', firstName: 'Rosa', lastName: 'Again' },
  )

  it('previews, imports once, skips duplicates and logs one entry per created employee', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const before = (await t.call('GET', '/api/employees', { cookie })).data.length
    const preview = await t.call('POST', '/api/import/employees/preview', { cookie, body: EMPLOYEES })
    expect(preview.status).toBe(200)
    expect(preview.data.summary).toEqual({ read: 5, create: 2, duplicates: 2, errors: 1 })
    expect(preview.data.created).toBeUndefined()
    expect(preview.data.rows.map((r: { result: string }) => r.result)).toEqual(['new', 'duplicate', 'error', 'new', 'duplicate'])
    expect(preview.data.rows[1].message).toBe('Skip: Employee ID already exists')
    expect(preview.data.rows[2]).toMatchObject({ row: 4, message: 'Row 4: missing Employee ID, Last name' })
    // Values come back trimmed, with every field present.
    expect(preview.data.rows[3].values).toEqual({ code: 'E-1403', firstName: 'Zhao, Wen', lastName: 'Lee', department: '', jobTitle: '' })
    // A key repeated in the file counts once: the first row wins.
    expect(preview.data.rows[4].message).toBe('Skip: Employee ID appears earlier in this file')
    // A preview writes nothing.
    expect((await t.call('GET', '/api/employees', { cookie })).data).toHaveLength(before)

    const run = await t.call('POST', '/api/import/employees', { cookie, body: EMPLOYEES })
    expect(run.data.created).toBe(2)
    expect(run.data.summary).toEqual({ read: 5, create: 2, duplicates: 2, errors: 1 })
    const list = (await t.call('GET', '/api/employees', { cookie })).data
    expect(list).toHaveLength(before + 2)
    expect(list.find((e: { code: string }) => e.code === 'E-1403')).toMatchObject({ firstName: 'Zhao, Wen', department: null, jobTitle: null, assetsHeld: 0 })
    // The employee that was already there is not touched.
    expect(list.find((e: { code: string }) => e.code === 'E-1042').jobTitle).not.toBe('Analyst')

    const again = await t.call('POST', '/api/import/employees', { cookie, body: EMPLOYEES })
    expect(again.data.created).toBe(0)
    expect(again.data.summary).toEqual({ read: 5, create: 0, duplicates: 4, errors: 1 })
    expect((await t.call('GET', '/api/employees', { cookie })).data).toHaveLength(before + 2)

    const audit = (await t.call('GET', '/api/audit?action=import', { cookie })).data
    expect(audit.total).toBe(2)
    expect(audit.entries.map((e: { details: string }) => e.details).sort()).toEqual(['employee_id=E-1402', 'employee_id=E-1403'])
  })

  it('imports programs the same way, and never issues anything', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    await t.call('POST', '/api/programs', { cookie, body: { code: 'P-100', name: 'Outreach North' } })
    const body = rowsOf(
      { code: 'p-100', name: 'Outreach North again', address: 'Elsewhere' },
      { code: 'P-200', name: 'Day Program', address: '12 Mill Lane' },
      { code: 'P-300', name: '' },
      { code: 'P-400', name: 'N'.repeat(121) },
      { code: 'P-500', name: 'Riverside' },
    )
    const preview = await t.call('POST', '/api/import/programs/preview', { cookie, body })
    expect(preview.data.summary).toEqual({ read: 5, create: 2, duplicates: 1, errors: 2 })
    expect(preview.data.rows[0].message).toBe('Skip: Program ID already exists')
    expect(preview.data.rows[2].message).toBe('Row 4: missing Program name')
    expect(preview.data.rows[3].message).toMatch(/^Row 5: .*Program name.*120 characters/)

    const assignments = (await t.call('GET', '/api/assignments', { cookie })).data.length
    const run = await t.call('POST', '/api/import/programs', { cookie, body })
    expect(run.data.created).toBe(2)
    const list = (await t.call('GET', '/api/programs', { cookie })).data
    expect(list.map((p: { code: string }) => p.code).sort()).toEqual(['P-100', 'P-200', 'P-500'])
    expect(list.find((p: { code: string }) => p.code === 'P-100')).toMatchObject({ name: 'Outreach North', address: null })
    expect(list.find((p: { code: string }) => p.code === 'P-200')).toMatchObject({ name: 'Day Program', address: '12 Mill Lane', isActive: true, assetsHeld: 0 })
    expect(list.find((p: { code: string }) => p.code === 'P-500').address).toBeNull()
    expect((await t.call('GET', '/api/assignments', { cookie })).data).toHaveLength(assignments)

    const audit = (await t.call('GET', '/api/audit?action=import', { cookie })).data
    expect(audit.entries.map((e: { details: string; entityType: string }) => `${e.entityType}:${e.details}`).sort()).toEqual(['program:program_id=P-200 · Day Program', 'program:program_id=P-500 · Riverside'])
    expect((await t.call('POST', '/api/import/programs', { cookie, body })).data.created).toBe(0)
  })

  it('reports rows over the limits of Add employee as errors and does not create them', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const body = rowsOf(
      { code: 'E'.repeat(200), firstName: 'Rosa', lastName: 'Delgado' },
      { code: 'E-2001', firstName: 'R'.repeat(300), lastName: 'Delgado' },
      { code: 'E-2002', firstName: 'Wen', lastName: 'Lee', department: 'D'.repeat(81) },
      { code: 'E-2003', firstName: 'Wen', lastName: 'Lee', department: 'Intake' },
    )
    const preview = await t.call('POST', '/api/import/employees/preview', { cookie, body })
    expect(preview.data.summary).toEqual({ read: 4, create: 1, duplicates: 0, errors: 3 })
    expect(preview.data.rows[0].message).toMatch(/Row 2.*Employee ID.*40 characters/)
    expect(preview.data.rows[1].message).toMatch(/Row 3.*First name.*80 characters/)
    expect(preview.data.rows[2].message).toMatch(/Row 4.*Department.*80 characters/)

    const run = await t.call('POST', '/api/import/employees', { cookie, body })
    expect(run.data.created).toBe(1)
    const codes = (await t.call('GET', '/api/employees', { cookie })).data.map((e: { code: string }) => e.code)
    expect(codes).toContain('E-2003')
    expect(codes).not.toContain('E-2001')
    expect(codes.every((code: string) => code.length <= 40)).toBe(true)
  })

  it('refuses other record types, too many rows, an empty file and a visitor who is not signed in', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const one = rowsOf({ code: 'E-3000', firstName: 'Ana', lastName: 'Cole' })
    for (const type of ['assets', 'assignments', 'digital-assets', 'users', '__proto__']) {
      const refused = await t.call('POST', `/api/import/${type}`, { cookie, body: one })
      expect(refused.status).toBe(404)
      expect(refused.data.error).toBe('not_importable')
      expect((await t.call('POST', `/api/import/${type}/preview`, { cookie, body: one })).status).toBe(404)
    }

    const many = { rows: Array.from({ length: 2001 }, (_, i) => ({ row: i + 2, values: { code: `E-${i + 5000}`, firstName: 'A', lastName: 'B' } })) }
    const tooMany = await t.call('POST', '/api/import/employees', { cookie, body: many })
    expect(tooMany.status).toBe(422)
    expect(tooMany.data.message).toBe('A file can hold at most 2,000 rows')
    expect((await t.call('POST', '/api/import/employees/preview', { cookie, body: { rows: [] } })).data.message).toBe('The file has no rows to import')
    expect((await t.call('POST', '/api/import/employees', { cookie, body: { csv: 'employee_id\nE-1\n' } })).status).toBe(422)
    expect((await t.call('POST', '/api/import/employees', { body: one })).status).toBe(401)
    expect((await t.call('GET', '/api/employees', { cookie })).data.map((e: { code: string }) => e.code)).not.toContain('E-3000')

    // Exactly 2,000 goes through, in one transaction.
    many.rows.pop()
    expect((await t.call('POST', '/api/import/employees', { cookie, body: many })).data.created).toBe(2000)
  })

  it('names the field and the limit when an employee value is refused', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const post = (body: Record<string, unknown>) => t.call('POST', '/api/employees', { cookie, body: { code: 'E-9000', firstName: 'Ana', lastName: 'Cole', ...body } })
    const fields = (res: { data: any }) => res.data.details.fields

    expect(fields(await post({ code: 'E'.repeat(41) }))).toEqual({ code: 'Employee ID can be at most 40 characters' })
    expect(fields(await post({ firstName: 'A'.repeat(81) }))).toEqual({ firstName: 'First name can be at most 80 characters' })
    expect(fields(await post({ lastName: 'C'.repeat(81) }))).toEqual({ lastName: 'Last name can be at most 80 characters' })
    expect(fields(await post({ department: 'D'.repeat(81) }))).toEqual({ department: 'Department can be at most 80 characters' })
    expect(fields(await post({ jobTitle: 'J'.repeat(121) }))).toEqual({ jobTitle: 'Job title can be at most 120 characters' })
    expect(fields(await post({ firstName: '  ' }))).toEqual({ firstName: 'Required' })

    expect((await post({})).status).toBe(201)
    const duplicate = await post({ code: 'e-9000' })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ code: 'Employee ID e-9000 already exists.' })
  })

  it('archiving is Super-Admin-only and blocked while the employee holds assets', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const admin = await t.asAdmin()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    const asset = (
      await t.call('POST', '/api/assets', {
        cookie,
        body: { tag: 'BPHS-1', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id, holderId: t.person.id },
      })
    ).data
    expect(asset.state).toBe('assigned')
    expect((await t.call('POST', `/api/employees/${t.person.id}/archive`, { cookie: admin })).status).toBe(403)
    expect((await t.call('POST', `/api/employees/${t.person.id}/archive`, { cookie })).data.error).toBe('holds_assets')
    await t.call('POST', `/api/assignments/${asset.assignmentId}/return`, { cookie, body: { conditionRatingId: conditionRatings[0]!.id } })
    expect((await t.call('POST', `/api/employees/${t.person.id}/archive`, { cookie })).data.state).toBe('archived')
    expect((await t.call('DELETE', `/api/employees/${t.person.id}`, { cookie })).status).toBe(409)
  })

  it('says why an employee cannot be deleted, in the list and when refusing', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    const add = async (code: string, lastName: string) => (await t.call('POST', '/api/employees', { cookie, body: { code, firstName: 'Test', lastName } })).data
    const holder = await add('E-1', 'Holder')
    const assessor = await add('E-2', 'Assessor')
    const spare = await add('E-3', 'Spare')
    expect(spare.deleteBlocked).toBeNull()
    await t.call('POST', '/api/assets', {
      cookie,
      body: { tag: 'DEL-1', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id, holderId: holder.id, assessedById: assessor.id },
    })

    const rows = (await t.call('GET', '/api/employees', { cookie })).data as { id: number; deleteBlocked: string | null }[]
    const reason = (id: number) => rows.find((row) => row.id === id)!.deleteBlocked
    expect(reason(holder.id)).toBe('Has assignment history. Archive instead; history is never deleted.')
    expect(reason(assessor.id)).toBe('Assessed the condition on 1 record. Archive instead; history is never deleted.')
    expect(reason(t.person.id)).toBe('Linked to the account p.raghunathan@bphs.local. Link that account to someone else on Users first.')
    expect(reason(spare.id)).toBeNull()

    const refuse = async (id: number) => (await t.call('DELETE', `/api/employees/${id}`, { cookie })).data
    expect(await refuse(assessor.id)).toMatchObject({ error: 'has_history', message: 'Test Assessor cannot be deleted. Assessed the condition on 1 record. Archive instead; history is never deleted.' })
    expect(await refuse(t.person.id)).toMatchObject({ error: 'linked_user', message: expect.stringContaining('Linked to the account p.raghunathan@bphs.local') })
    expect((await t.call('DELETE', `/api/employees/${spare.id}`, { cookie })).status).toBe(204)

    // Unlinked, the same employee can go.
    t.sqlite.prepare('update users set employee_id = null where id = ?').run(t.superUser.id)
    expect((await t.call('DELETE', `/api/employees/${t.person.id}`, { cookie })).status).toBe(204)
  })

  it('does not link an account to an archived employee', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const gone = (await t.call('POST', '/api/employees', { cookie, body: { code: 'E-9', firstName: 'Left', lastName: 'Already' } })).data
    await t.call('POST', `/api/employees/${gone.id}/archive`, { cookie })
    const message = 'That employee is archived. Restore them first, or choose someone else.'
    const linked = await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: gone.id } })
    expect(linked.status).toBe(422)
    expect(linked.data).toMatchObject({ message, details: { field: 'employeeId' } })
    const created = await t.call('POST', '/api/users', { cookie, body: { name: 'New Person', email: 'new@bphs.local', access: ADMIN, superAdmin: false, employeeId: gone.id } })
    expect(created.status).toBe(422)
    // An account already linked keeps working on its other fields after its employee is archived.
    await t.call('POST', `/api/employees/${gone.id}/restore`, { cookie })
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: gone.id } })).status).toBe(200)
    await t.call('POST', `/api/employees/${gone.id}/archive`, { cookie })
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { name: 'Mo Oyelaran', employeeId: gone.id } })).data.name).toBe('Mo Oyelaran')
  })
})

describe('lists, users and audit', () => {
  it('answers a write with the same row the lists show, when other rows have history of their own', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    const body = (tag: string, holderId: number | null) => ({ tag, typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id, holderId })
    const first = (await t.call('POST', '/api/assets', { cookie, body: body('ROW-1', t.person.id) })).data
    await t.call('POST', `/api/assignments/${first.assignmentId}/return`, { cookie, body: { conditionRatingId: conditionRatings[1]!.id, notes: 'scuffed' } })
    await t.call('POST', '/api/assets', { cookie, body: body('ROW-2', t.person.id) })
    await t.call('POST', '/api/assets', { cookie, body: body('ROW-3', null) })

    const { daysOut: _a, ...changed } = (await t.call('PATCH', `/api/assets/${first.id}`, { cookie, body: { serial: 'SN-77' } })).data
    const { daysOut: _b, ...listed } = (await t.call('GET', '/api/assets', { cookie })).data.find((row: { id: number }) => row.id === first.id)
    expect(changed).toEqual(listed)
    expect(changed).toMatchObject({ state: 'in_storage', hasHistory: true, condition: { rating: conditionRatings[1]!.name, notes: 'scuffed' } })
    expect(changed.lastReturnedAt).not.toBeNull()

    const type = (await t.call('PATCH', `/api/asset-types/${assetTypes[0]!.id}`, { cookie, body: { name: 'Renamed' } })).data
    expect(type).toEqual((await t.call('GET', '/api/asset-types', { cookie })).data.find((row: { id: number }) => row.id === type.id))
    expect(type.assetCount).toBe(3)
    const rating = (await t.call('PATCH', `/api/condition-ratings/${conditionRatings[1]!.id}`, { cookie, body: { name: 'Worn' } })).data
    expect(rating).toEqual((await t.call('GET', '/api/condition-ratings', { cookie })).data.find((row: { id: number }) => row.id === rating.id))
    expect(rating.snapshotCount).toBe(1)
  })

  it('protects types in use', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    await t.call('POST', '/api/assets', { cookie, body: { tag: 'X-1', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id } })
    const refused = await t.call('DELETE', `/api/asset-types/${assetTypes[0]!.id}`, { cookie })
    expect(refused.status).toBe(409)
    expect((await t.call('DELETE', `/api/asset-types/${assetTypes[1]!.id}`, { cookie })).status).toBe(204)
    expect((await t.call('POST', '/api/asset-types', { cookie, body: { name: assetTypes[0]!.name.toUpperCase() } })).status).toBe(409)
  })

  it('keeps at least one rating and one type active, whoever asks', async () => {
    const t = await setup()
    const admin = await t.asAdmin()
    const superAdmin = await t.asSuper()
    for (const [path, noun] of [['/api/condition-ratings', 'condition rating'], ['/api/asset-types', 'asset type']] as const) {
      const items = (await t.call('GET', path, { cookie: admin })).data as { id: number; name: string }[]
      const [last, ...rest] = items
      for (const item of rest) expect((await t.call('PATCH', `${path}/${item.id}`, { cookie: admin, body: { isActive: false } })).status).toBe(200)

      // The last one stays on, for an Admin and for a Super Admin, and cannot be deleted either although nothing uses it.
      for (const cookie of [admin, superAdmin]) {
        const refused = await t.call('PATCH', `${path}/${last!.id}`, { cookie, body: { isActive: false } })
        expect(refused.status).toBe(409)
        expect(refused.data).toMatchObject({ error: 'last_active', message: `"${last!.name}" is the only active ${noun}. Activate or add another first.` })
      }
      expect((await t.call('DELETE', `${path}/${last!.id}`, { cookie: superAdmin })).data.error).toBe('last_active')
      const stillActive = ((await t.call('GET', path, { cookie: admin })).data as { id: number; isActive: boolean }[]).filter((item) => item.isActive)
      expect(stillActive.map((item) => item.id)).toEqual([last!.id])
      // It can still be renamed, and an inactive one can still be deleted.
      expect((await t.call('PATCH', `${path}/${last!.id}`, { cookie: admin, body: { name: 'Renamed' } })).status).toBe(200)
      expect((await t.call('DELETE', `${path}/${rest[0]!.id}`, { cookie: superAdmin })).status).toBe(204)

      // With a second one active, the first can go.
      expect((await t.call('PATCH', `${path}/${rest[1]!.id}`, { cookie: admin, body: { isActive: true } })).status).toBe(200)
      expect((await t.call('PATCH', `${path}/${last!.id}`, { cookie: admin, body: { isActive: false } })).status).toBe(200)
    }
    const lookups = (await t.call('GET', '/api/lookups', { cookie: admin })).data
    expect(lookups.conditionRatings).toHaveLength(1)
    expect(lookups.assetTypes).toHaveLength(1)
    expect((await t.call('GET', '/api/audit?action=update', { cookie: admin })).data.entries.some((e: { details: string }) => /only active/.test(e.details))).toBe(false)
  })

  it('fills the lists with the defaults on a new database only, never again once there are users', async () => {
    const fresh = createDb(':memory:')
    runMigrations(fresh.db)
    ensureDefaultLists(fresh.db)
    expect(fresh.db.select().from(assetTypes).all().map((row) => row.name)).toEqual(DEFAULT_TYPES)
    expect(fresh.db.select().from(conditionRatings).all()).toHaveLength(DEFAULT_RATINGS.length)

    // A list emptied in a database that is in use stays as its admins left it at the next start.
    const t = await setup()
    t.db.delete(assetTypes).run()
    ensureDefaultLists(t.db)
    expect(t.db.select().from(assetTypes).all()).toEqual([])
  })

  it('gives each rating a score that sets the order, and lets no two share one', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const scale = async () => (await t.call('GET', '/api/condition-ratings', { cookie })).data.map((r: { name: string; score: number }) => [r.name, r.score])
    expect(await scale()).toEqual([['New', 100], ['Good', 80], ['Fair', 60], ['Poor', 30], ['Damaged', 10]])
    expect((await t.call('GET', '/api/lookups', { cookie })).data.conditionRatings.map((r: { score: number }) => r.score)).toEqual([100, 80, 60, 30, 10])

    // A new rating needs a whole score from 1 to 100 that nothing else has.
    const add = (body: Record<string, unknown>) => t.call('POST', '/api/condition-ratings', { cookie, body })
    const fields = (res: { data: any }) => res.data.details.fields
    expect(fields(await add({ name: 'Worn' }))).toEqual({ score: 'Give the rating a score from 1 to 100.' })
    for (const score of [0, 101, 45.5]) expect(fields(await add({ name: 'Worn', score })), String(score)).toEqual({ score: 'The score must be a whole number from 1 to 100.' })
    const taken = await add({ name: 'Worn', score: 60 })
    expect(taken.status).toBe(409)
    expect(taken.data.error).toBe('duplicate_score')
    expect(fields(taken)).toEqual({ score: '"Fair" already has the score 60. Choose another.' })
    const worn = await add({ name: 'Worn', score: 45 })
    expect(worn.status).toBe(201)
    expect(worn.data).toMatchObject({ name: 'Worn', score: 45, isActive: true })
    expect((await scale()).map(([name]: [string]) => name)).toEqual(['New', 'Good', 'Fair', 'Worn', 'Poor', 'Damaged'])

    // Changing a score moves the rating, is refused when taken (also by a deactivated rating), and is audited.
    const damaged = (await t.call('GET', '/api/condition-ratings', { cookie })).data.find((r: { name: string }) => r.name === 'Damaged')
    await t.call('PATCH', `/api/condition-ratings/${damaged.id}`, { cookie, body: { isActive: false } })
    const clash = await t.call('PATCH', `/api/condition-ratings/${worn.data.id}`, { cookie, body: { score: 10 } })
    expect(clash.data.error).toBe('duplicate_score')
    expect((await t.call('PATCH', `/api/condition-ratings/${worn.data.id}`, { cookie, body: { score: 45 } })).status).toBe(200)
    const moved = await t.call('PATCH', `/api/condition-ratings/${worn.data.id}`, { cookie, body: { score: 90 } })
    expect(moved.data.score).toBe(90)
    expect((await scale()).map(([name]: [string]) => name)).toEqual(['New', 'Worn', 'Good', 'Fair', 'Poor', 'Damaged'])
    expect((await t.call('GET', '/api/lookups', { cookie })).data.conditionRatings.map((r: { name: string }) => r.name)).toEqual(['New', 'Worn', 'Good', 'Fair', 'Poor'])
    const audit = (await t.call('GET', '/api/audit', { cookie: await t.asSuper() })).data.entries.map((e: { details: string }) => e.details)
    expect(audit).toContain('Worn · score: 45 → 90')
    expect(audit).toContain('Worn · score 45')

    // The old reorder endpoint is gone.
    expect((await t.call('PUT', '/api/condition-ratings/order', { cookie, body: { ids: [1] } })).status).toBe(404)
  })

  it('goes by the score, not the name, for the condition watch and the default rating', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes } = await t.lookups(cookie)
    const ratings = (await t.call('GET', '/api/condition-ratings', { cookie })).data as { id: number; name: string }[]
    const id = (name: string) => ratings.find((r) => r.name === name)!.id
    const make = (tag: string, rating: string) => t.call('POST', '/api/assets', { cookie, body: { tag, typeId: assetTypes[0]!.id, conditionRatingId: id(rating) } })
    for (const [tag, rating] of [['W-1', 'New'], ['W-2', 'Good'], ['W-3', 'Fair'], ['W-4', 'Poor'], ['W-5', 'Damaged']] as const) await make(tag, rating)
    const watch = async () => (await t.call('GET', '/api/dashboard', { cookie })).data.poorCondition.map((r: { assetTag: string; rating: string }) => `${r.assetTag} ${r.rating}`).sort()
    expect(await watch()).toEqual(['W-4 Poor', 'W-5 Damaged'])

    // Renamed: still watched. (This emptied the panel when it went by the names "poor" and "damaged".)
    await t.call('PATCH', `/api/condition-ratings/${id('Poor')}`, { cookie, body: { name: 'Worn out' } })
    await t.call('PATCH', `/api/condition-ratings/${id('Damaged')}`, { cookie, body: { name: 'Broken' } })
    expect(await watch()).toEqual(['W-4 Worn out', 'W-5 Broken'])

    // The line is the score: 50 is off the watch, 49 is on it, whatever the rating is called.
    await t.call('PATCH', `/api/condition-ratings/${id('Poor')}`, { cookie, body: { score: 50 } })
    expect(await watch()).toEqual(['W-5 Broken'])
    await t.call('PATCH', `/api/condition-ratings/${id('Fair')}`, { cookie, body: { score: 49 } })
    expect(await watch()).toEqual(['W-3 Fair', 'W-5 Broken'])

    // A pasted row with no condition gets the rating closest to 80, even after "Good" is renamed.
    await t.call('PATCH', `/api/condition-ratings/${id('Good')}`, { cookie, body: { name: 'Fine' } })
    const pasted = await t.call('POST', '/api/assets/bulk', { cookie, body: { rows: [{ tag: 'W-6', type: assetTypes[0]!.name }] } })
    expect(pasted.data).toMatchObject({ created: 1, errors: [] })
    expect((await t.call('GET', '/api/assets/tag/W-6', { cookie })).data.asset.condition.rating).toBe('Fine')
  })

  it('names the field and the limit when a name is refused', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const fields = (res: { data: any }) => res.data.details.fields
    const lee = t.db.insert(employees).values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const user = await t.call('POST', '/api/users', { cookie, body: { name: 'N'.repeat(121), email: 'new.person@bphs.local', access: ADMIN, superAdmin: false, employeeId: lee.id } })
    expect(fields(user)).toEqual({ name: 'Name can be at most 120 characters' })
    expect(fields(await t.call('POST', '/api/asset-types', { cookie, body: { name: 'T'.repeat(61) } }))).toEqual({ name: 'Name can be at most 60 characters' })
    expect(fields(await t.call('POST', '/api/condition-ratings', { cookie, body: { name: 'R'.repeat(41), score: 50 } }))).toEqual({ name: 'Name can be at most 40 characters' })

    const duplicate = await t.call('POST', '/api/asset-types', { cookie, body: { name: 'laptop' } })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ name: 'An asset type named "laptop" already exists.' })
    const email = await t.call('POST', '/api/users', { cookie, body: { name: 'Another Marcus', email: 'M.Oyelaran@bphs.local', access: ADMIN, superAdmin: false, employeeId: lee.id } })
    expect(fields(email)).toEqual({ email: 'An account for m.oyelaran@bphs.local already exists.' })
  })

  it('keeps user management to Super Admins and hands back a one-time password once', async () => {
    const t = await setup()
    const admin = await t.asAdmin()
    const cookie = await t.asSuper()
    expect((await t.call('GET', '/api/users', { cookie: admin })).status).toBe(403)

    const lee = t.db.insert(employees).values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const created = await t.call('POST', '/api/users', {
      cookie,
      body: { name: 'New Person', email: 'New.Person@bphs.local', access: ADMIN, superAdmin: false, employeeId: lee.id },
    })
    expect(created.status).toBe(201)
    expect(created.data.user.mustChangePassword).toBe(true)
    const firstLogin = await t.signIn('new.person@bphs.local', created.data.oneTimePassword)
    expect(firstLogin.status).toBe(200)
    expect(firstLogin.data.user.mustChangePassword).toBe(true)
    expect(JSON.stringify((await t.call('GET', '/api/users', { cookie })).data)).not.toContain(created.data.oneTimePassword)
  })

  it('will not reset your own password, which would end your session before the one-time password is shown', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const own = await t.call('POST', `/api/users/${t.superUser.id}/reset-password`, { cookie })
    expect(own.status).toBe(409)
    expect(own.data.error).toBe('self_reset')
    // Refused outright: the session is still valid and the password has not changed.
    expect((await t.call('GET', '/api/auth/me', { cookie })).status).toBe(200)
    expect((await t.signIn('p.raghunathan@bphs.local')).status).toBe(200)
    expect(findUser(t.db, 'p.raghunathan@bphs.local')?.mustChangePassword).toBe(false)

    // Someone else's reset still works, and leaves the caller signed in.
    const other = await t.call('POST', `/api/users/${t.adminUser.id}/reset-password`, { cookie })
    expect(other.status).toBe(200)
    expect(other.data.oneTimePassword).toBeTruthy()
    expect((await t.call('GET', '/api/auth/me', { cookie })).status).toBe(200)
  })

  it('will not change your own access, even with another Super Admin present', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const promoted = await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { superAdmin: true } })
    expect(promoted.data.superAdmin).toBe(true)

    const own = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { superAdmin: false, access: ADMIN } })
    expect(own.status).toBe(409)
    expect(own.data.error).toBe('self_access')
    expect(findUser(t.db, 'p.raghunathan@bphs.local')?.superAdmin).toBe(true)

    // The rest of your own account can still be edited, and sending the access you already have is not a change.
    const renamed = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { name: 'Priya R.', superAdmin: true } })
    expect(renamed.status).toBe(200)
    expect(renamed.data.name).toBe('Priya R.')

    // The other Super Admin can still do it.
    const other = await t.asAdmin()
    const demoted = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { superAdmin: false, access: ADMIN } })
    expect(demoted.data).toMatchObject({ superAdmin: false, access: ADMIN })
  })

  it('will not deactivate yourself or the last Super Admin, and a lock can be cleared', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    expect((await t.call('POST', `/api/users/${t.superUser.id}/deactivate`, { cookie })).data.error).toBe('self_deactivate')
    for (let i = 0; i < 5; i++) await t.signIn('m.oyelaran@bphs.local', 'wrong')
    const row = (await t.call('GET', '/api/users', { cookie })).data.find((u: { id: number }) => u.id === t.adminUser.id)
    expect(row.state).toBe('locked')
    const cleared = await t.call('POST', `/api/users/${t.adminUser.id}/clear-lock`, { cookie })
    expect(cleared.data.state).toBe('active')
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(200)
    const off = await t.call('POST', `/api/users/${t.adminUser.id}/deactivate`, { cookie })
    expect(off.data.state).toBe('deactivated')
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(401)
  })

  it('records who acted by email and names the record and its old and new values in each entry', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const entries = async (query = '') => (await t.call('GET', `/api/audit${query}`, { cookie })).data.entries as { actor: string; action: string; entityType: string; details: string }[]
    const latest = async () => (await entries())[0]!

    // Two accounts whose emails share the part before the @ are two actors.
    const person = (code: string, firstName: string, lastName: string) => t.db.insert(employees).values({ code, firstName, lastName }).returning().get().id
    const one = await t.call('POST', '/api/users', { cookie, body: { name: 'Pat One', email: 'pat@a.example', access: ADMIN, superAdmin: false, employeeId: person('E-1990', 'Pat', 'One') } })
    const two = await t.call('POST', '/api/users', { cookie, body: { name: 'Pat Two', email: 'pat@b.example', access: ADMIN, superAdmin: false, employeeId: person('E-1991', 'Pat', 'Two') } })
    for (const made of [one, two]) {
      const signedIn = await t.signIn(made.data.user.email, made.data.oneTimePassword)
      expect((await t.call('POST', '/api/auth/password-change', { cookie: signedIn.cookie, body: { currentPassword: made.data.oneTimePassword, newPassword: 'Brand-new-1!' } })).status).toBe(200)
      expect((await t.call('POST', '/api/asset-types', { cookie: signedIn.cookie, body: { name: `Type of ${made.data.user.name}` } })).status).toBe(201)
    }
    const types = await entries('?q=Type%20of')
    expect(types.map((e) => `${e.actor} added ${e.details}`).sort()).toEqual(['pat@a.example added Type of Pat One', 'pat@b.example added Type of Pat Two'])
    expect((await entries('?q=pat%40a.example')).every((e) => e.actor === 'pat@a.example' || e.details.includes('pat@a.example'))).toBe(true)
    expect((await t.call('GET', '/api/audit.csv?q=Type%20of%20Pat%20Two', { cookie })).data).toContain('pat@b.example,create,assettype')

    // Changes to an account say which account, and what it was linked to before and after.
    const other = t.db.insert(employees).values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const patId = one.data.user.id
    await t.call('PATCH', `/api/users/${patId}`, { cookie, body: { name: 'Pat First', superAdmin: true, employeeId: other.id } })
    expect(await latest()).toMatchObject({ actor: 'p.raghunathan@bphs.local', details: 'pat@a.example · name: Pat One → Pat First; access: Assets: Edit · Grievances: Edit · Employees: Edit → Super Admin; linked employee: E-1990 Pat One → E-2000 Lee Okoro' })
    const third = t.db.insert(employees).values({ code: 'E-2002', firstName: 'Ana', lastName: 'Reyes' }).returning().get()
    await t.call('PATCH', `/api/users/${patId}`, { cookie, body: { employeeId: third.id } })
    expect((await latest()).details).toBe('pat@a.example · linked employee: E-2000 Lee Okoro → E-2002 Ana Reyes')
    await t.call('POST', `/api/users/${patId}/reset-password`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · password reset · must change on next login')
    await t.call('POST', `/api/users/${patId}/clear-lock`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · locked_until cleared')
    await t.call('POST', `/api/users/${patId}/deactivate`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · deactivated')
    await t.call('POST', `/api/users/${patId}/reactivate`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · reactivated')
    expect((await entries('?q=password%20changed')).map((e) => e.details).sort()).toEqual(['pat@a.example · password changed', 'pat@b.example · password changed'])

    // So do changes to an employee and to the two lists.
    await t.call('PATCH', `/api/employees/${other.id}`, { cookie, body: { code: 'E-2001', department: 'Ops' } })
    expect((await latest()).details).toBe('employee_id=E-2001 · employee_id: E-2000 → E-2001; department: — → Ops')
    const { assetTypes: typeList, conditionRatings: ratingList } = await t.lookups(cookie)
    await t.call('PATCH', `/api/asset-types/${typeList[0]!.id}`, { cookie, body: { isActive: false } })
    expect((await latest()).details).toBe(`${typeList[0]!.name} · active: true → false`)
    await t.call('PATCH', `/api/condition-ratings/${ratingList[0]!.id}`, { cookie, body: { name: 'Mint' } })
    expect((await latest()).details).toBe(`Mint · name: ${ratingList[0]!.name} → Mint`)

    // An entry written before emails were recorded holds only the part before the @. The log cannot be rewritten, so it is read
    // with the email of the account it points to; an entry with no account behind it is read as it was written.
    t.db.insert(auditLog).values({ occurredAt: new Date(), userId: t.adminUser.id, actor: 'm.oyelaran', action: 'create', entityType: 'asset', entityId: 1, details: 'an old entry' }).run()
    t.db.insert(auditLog).values({ occurredAt: new Date(), userId: null, actor: 'server-cli', action: 'update', entityType: 'user', entityId: 1, details: 'an old entry from the server' }).run()
    expect((await entries('?q=an%20old%20entry')).map((e) => e.actor).sort()).toEqual(['m.oyelaran@bphs.local', 'server-cli'])
    expect((await entries('?q=oyelaran%40bphs')).map((e) => e.details)).toContain('an old entry')
    expect(t.sqlite.prepare("select actor from audit_log where details = 'an old entry'").get()).toEqual({ actor: 'm.oyelaran' })
    expect((await t.call('GET', '/api/dashboard', { cookie })).data.recent.find((e: { details: string }) => e.details === 'an old entry').actor).toBe('m.oyelaran@bphs.local')

    // The same email is shown wherever a person is named for what they did.
    const { conditionRatings } = await t.lookups(cookie)
    const asset = (await t.call('POST', '/api/assets', { cookie, body: { tag: 'WHO-1', typeId: typeList[1]!.id, conditionRatingId: conditionRatings[0]!.id, holderId: t.person.id } })).data
    expect((await t.call('GET', '/api/assignments', { cookie })).data[0].issuedBy).toBe('p.raghunathan@bphs.local')
    const detail = (await t.call('GET', `/api/assets/tag/${asset.tag}`, { cookie })).data
    expect(detail.history[0].issuedBy).toBe('p.raghunathan@bphs.local')
    expect(detail.conditions[0].recordedBy).toBe('p.raghunathan@bphs.local')
  })

  it('starts the audit CSV with the byte-order mark Excel needs, and keeps a cell from being read as a formula', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    await t.call('POST', '/api/asset-types', { cookie, body: { name: '=SUM(A1:A9)' } })
    const res = await t.app.request('/api/audit.csv', { headers: { cookie } })
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(text.slice(1)).toMatch(/^occurred_at,user,action,entity_type,entity_id,details\r\n/)
    expect(text).toContain(",'=SUM(A1:A9)\r\n")
  })

  it('the audit log is append-only at the database level', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    await t.call('POST', '/api/asset-types', { cookie, body: { name: 'Dock' } })
    expect(() => t.sqlite.prepare("update audit_log set details = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from audit_log').run()).toThrow(/append-only/)

    // Nor can an entry be renumbered, handed to someone else, or swapped for a new one under the same id.
    const first = t.sqlite.prepare('select * from audit_log order by id limit 1').get() as { id: number; user_id: number; details: string }
    const refused = [
      `update audit_log set id = 999999 where id = ${first.id}`,
      `update audit_log set user_id = ${t.adminUser.id} where id = ${first.id}`,
      `update or replace audit_log set details = 'tampered' where id = ${first.id}`,
      `insert or replace into audit_log (id, occurred_at, actor, action, entity_type, details) values (${first.id}, 0, 'x', 'create', 'x', 'swapped')`,
      `replace into audit_log (id, occurred_at, actor, action, entity_type, details) values (${first.id}, 0, 'x', 'create', 'x', 'swapped')`,
      `insert into audit_log (id, occurred_at, actor, action, entity_type, details) values (${first.id}, 0, 'x', 'create', 'x', 'swapped')`,
    ]
    for (const statement of refused) expect(() => t.sqlite.prepare(statement).run(), statement).toThrow(/append-only|UNIQUE/)
    expect(t.sqlite.prepare('select * from audit_log where id = ?').get(first.id)).toEqual(first)

    // Still let through: new entries, and (below) the foreign key clearing user_id when that user is deleted.
    const before = (t.sqlite.prepare('select count(*) as n from audit_log').get() as { n: number }).n
    await t.call('POST', '/api/asset-types', { cookie, body: { name: 'Cable' } })
    expect((t.sqlite.prepare('select count(*) as n from audit_log').get() as { n: number }).n).toBe(before + 1)
    const csv = await t.app.request('/api/audit.csv', { headers: { cookie } })
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/)
    expect(await csv.text()).toContain('assettype')

    t.sqlite.prepare('delete from sessions').run()
    t.sqlite.prepare('delete from users where id = ?').run(t.superUser.id)
    expect(t.sqlite.prepare('select user_id, details from audit_log where id = ?').get(first.id)).toEqual({ user_id: null, details: first.details })
  })

  it('filters the audit log by the instants the viewer asks for, whatever zone the server is in', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const record = (at: string, details: string) =>
      t.db.insert(auditLog).values({ occurredAt: new Date(at), actor: 'probe', action: 'create', entityType: 'asset', entityId: 1, details }).run()
    record('2026-10-09T03:59:59.999Z', 'one ms before the 9th starts')
    record('2026-10-09T04:00:00.000Z', 'the 9th starts')
    record('2026-10-10T01:30:00.000Z', 'evening of the 9th')
    record('2026-10-10T03:59:59.999Z', 'the 9th ends')
    record('2026-10-10T04:00:00.000Z', 'the 10th starts')

    // 9 October in New York: from midnight (04:00 UTC, still summer time) up to, not including, the next midnight.
    const day = 'from=2026-10-09T04:00:00.000Z&to=2026-10-10T04:00:00.000Z'
    const expected = ['evening of the 9th', 'the 9th ends', 'the 9th starts']
    const zone = process.env.TZ
    try {
      for (const [name, offset] of [['UTC', 0], ['America/New_York', 240], ['Pacific/Auckland', -780]] as const) {
        process.env.TZ = name
        // The server really is in that zone, so the answers below mean something.
        expect(new Date(2026, 9, 9).getTimezoneOffset()).toBe(offset)

        const page = await t.call('GET', `/api/audit?${day}`, { cookie })
        expect(page.data.entries.map((e: { details: string }) => e.details).sort(), name).toEqual(expected)
        expect(page.data.total, name).toBe(3)
        const csv = await (await t.app.request(`/api/audit.csv?${day}`, { headers: { cookie } })).text()
        expect(expected.every((details) => csv.includes(details)), name).toBe(true)
        expect(csv).not.toContain('the 10th starts')
      }
    } finally {
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }

    // Either end can be left open, and an offset other than Z is understood: all three of these are midnight at the start of 10 October in UTC.
    for (const from of ['2026-10-10T00:00:00Z', '2026-10-09T20:00:00-04:00', '2026-10-10T05:30:00%2B05:30']) {
      const page = await t.call('GET', `/api/audit?from=${from}`, { cookie })
      // The sign-in at the top of this test is in the log as well, and it is later than all of these.
      const probes = page.data.entries.filter((e: { actor: string }) => e.actor === 'probe')
      expect(probes.map((e: { details: string }) => e.details).sort(), from).toEqual(['evening of the 9th', 'the 10th starts', 'the 9th ends'])
    }
    const to = await t.call('GET', '/api/audit?to=2026-10-09T04:00:00.000Z', { cookie })
    expect(to.data.entries.map((e: { details: string }) => e.details)).toEqual(['one ms before the 9th starts'])

    // A date without a time is no longer an answer to "when", and says so instead of being read in some zone.
    expect((await t.call('GET', '/api/audit?from=2026-10-09', { cookie })).status).toBe(422)
    expect((await t.call('GET', '/api/audit?to=not-a-time', { cookie })).status).toBe(422)
  })

  it('summarises the dashboard', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    await t.call('POST', '/api/assets', {
      cookie,
      body: { tag: 'D-1', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id, holderId: t.person.id },
    })
    await t.call('POST', '/api/assets', { cookie, body: { tag: 'D-2', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[3]!.id } })
    const { data } = await t.call('GET', '/api/dashboard', { cookie })
    expect(data.totals).toEqual({ total: 2, assigned: 1, inStorage: 1, retired: 0 })
    expect(data.byType[0]).toMatchObject({ total: 2, free: 1 })
    expect(data.topHolders[0].count).toBe(1)
    expect(data.poorCondition[0].assetTag).toBe('D-2')
    expect(data.recent.length).toBeGreaterThan(0)
  })
})

describe('sign-ins in the audit log, and one account per employee', () => {
  it('records each sign-in, and of the failed attempts only the one that locks the account', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const entries = async (query = '') =>
      ((await t.call('GET', `/api/audit${query}`, { cookie })).data.entries as { actor: string; action: string; entityId: number | null; details: string }[]).reverse()

    expect(await entries('?action=sign_in')).toEqual([expect.objectContaining({ actor: 'p.raghunathan@bphs.local', entityId: t.superUser.id, details: 'p.raghunathan@bphs.local · signed in' })])

    // Unknown accounts and the attempts before the limit leave nothing behind.
    await t.signIn('nobody@bphs.local', 'wrong')
    for (let i = 0; i < 4; i++) await t.signIn('m.oyelaran@bphs.local', 'wrong')
    expect(await entries()).toHaveLength(1)

    // The fifth reaches the limit and is logged; attempts on the locked or deactivated account after it are not.
    await t.signIn('m.oyelaran@bphs.local', 'wrong')
    await t.signIn('m.oyelaran@bphs.local', 'wrong')
    await t.signIn('m.oyelaran@bphs.local')
    t.db.update(users).set({ isActive: false, lockedUntil: null }).where(eq(users.id, t.adminUser.id)).run()
    await t.signIn('m.oyelaran@bphs.local')
    expect((await entries()).map((e) => [e.action, e.actor, e.details])).toEqual([
      ['sign_in', 'p.raghunathan@bphs.local', 'p.raghunathan@bphs.local · signed in'],
      ['lock', 'sign-in', 'm.oyelaran@bphs.local · locked for 15 minutes after 5 incorrect passwords'],
    ])
    expect((await t.call('GET', '/api/audit?action=sign_in_failed', { cookie })).status).toBe(422)
  })

  it('refuses to link an employee who already has an account', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const refused = { status: 409, data: { error: 'employee_linked', message: 'Priya Raghunathan is already linked to the account p.raghunathan@bphs.local. Link that account to someone else first.', details: { field: 'employeeId' } } }

    expect(await t.call('POST', '/api/users', { cookie, body: { name: 'Second Priya', email: 'second@bphs.local', access: ADMIN, superAdmin: false, employeeId: t.person.id } })).toMatchObject(refused)
    expect(findUser(t.db, 'second@bphs.local')).toBeUndefined()
    expect(await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: t.person.id } })).toMatchObject(refused)
    // Sending the link an account already has changes nothing and is not refused.
    expect((await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { employeeId: t.person.id } })).status).toBe(200)

    // Once the first account lets go, the second may take the employee. Nobody changes their own link, so another Super Admin unlinks the first.
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { superAdmin: true } })).status).toBe(200)
    const other = await t.asAdmin()
    expect((await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { employeeId: null } })).data.employeeId).toBeNull()
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: t.person.id } })).data.employeeId).toBe(t.person.id)
    // The database holds the rule as well.
    expect(() => t.sqlite.prepare('update users set employee_id = ? where id = ?').run(t.person.id, t.superUser.id)).toThrow(/UNIQUE/)
  })

  it('links every account to an employee, except the first one made', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const lee = t.db.insert(employees).values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const unlinked = await t.call('POST', '/api/users', { cookie, body: { name: 'No Link', email: 'nolink@bphs.local', access: ADMIN, superAdmin: false } })
    expect(unlinked.status).toBe(422)
    expect(unlinked.data.details.fields).toEqual({ employeeId: 'Choose the employee this account belongs to' })

    const made = (await t.call('POST', '/api/users', { cookie, body: { name: 'Lee Okoro', email: 'l.okoro@bphs.local', access: ADMIN, superAdmin: true, employeeId: lee.id } })).data.user
    const unlink = await t.call('PATCH', `/api/users/${made.id}`, { cookie, body: { employeeId: null } })
    expect(unlink.status).toBe(422)
    expect(unlink.data).toMatchObject({ message: 'Every account must be linked to an employee.', details: { field: 'employeeId' } })

    // Nobody changes their own link, or they could read a review about themselves.
    const self = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { employeeId: null } })
    expect(self.status).toBe(409)
    expect(self.data).toMatchObject({ error: 'self_link', message: 'You cannot change the employee linked to your own account.' })

    // The first account may be unlinked by another Super Admin, and linked again.
    await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { superAdmin: true } })
    const other = await t.asAdmin()
    expect((await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { employeeId: null } })).data.employeeId).toBeNull()
    expect((await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { employeeId: t.person.id } })).data.employeeId).toBe(t.person.id)
  })

  it('on upgrade, leaves a shared employee with one account and says which accounts were unlinked', () => {
    const folder = path.join(import.meta.dirname, '../db/migrations')
    const statements = (file: string) => fs.readFileSync(path.join(folder, file), 'utf8').split('--> statement-breakpoint')
    const files = fs.readdirSync(folder).filter((file) => file.endsWith('.sql')).sort()
    const last = files.findIndex((file) => file.startsWith('0004_'))
    const sqlite = new Database(':memory:')
    for (const file of files.slice(0, last)) for (const statement of statements(file)) sqlite.exec(statement)

    sqlite.exec(`
      insert into employees (id, code, first_name, last_name) values (1, 'E-1', 'Sam', 'Shared'), (2, 'E-2', 'Olu', 'Alone');
      insert into users (id, name, email, password_hash, role, employee_id, is_active) values
        (1, 'Old Off', 'off@x.example', 'x', 'admin', 1, 0),
        (2, 'Kept', 'kept@x.example', 'x', 'admin', 1, 1),
        (3, 'Later', 'later@x.example', 'x', 'admin', 1, 1),
        (4, 'Alone', 'alone@x.example', 'x', 'admin', 2, 1),
        (5, 'None', 'none@x.example', 'x', 'admin', null, 1);`)
    for (const statement of statements(files[last]!)) sqlite.exec(statement)

    expect(sqlite.prepare('select id, employee_id as e from users order by id').all()).toEqual([{ id: 1, e: null }, { id: 2, e: 1 }, { id: 3, e: null }, { id: 4, e: 2 }, { id: 5, e: null }])
    expect(sqlite.prepare('select actor, action, entity_id as id, details from audit_log order by entity_id').all()).toEqual([
      { actor: 'migration', action: 'update', id: 1, details: 'off@x.example · linked employee: E-1 Sam Shared → none (an employee may be linked to one account only)' },
      { actor: 'migration', action: 'update', id: 3, details: 'later@x.example · linked employee: E-1 Sam Shared → none (an employee may be linked to one account only)' },
    ])
    sqlite.close()
  })
})

describe('programs, and assets a program holds', () => {
  async function seed() {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    const laptop = assetTypes.find((x) => x.name === 'Laptop')!
    const good = conditionRatings.find((x) => x.name === 'Good')!
    const fair = conditionRatings.find((x) => x.name === 'Fair')!
    const make = async (tag: string, extra: Record<string, unknown> = {}) =>
      await t.call('POST', '/api/assets', { cookie, body: { tag, typeId: laptop.id, conditionRatingId: good.id, ...extra } })
    const program = async (code: string, name: string, address?: string) => (await t.call('POST', '/api/programs', { cookie, body: { code, name, address } })).data
    return { t, cookie, laptop, good, fair, make, program }
  }

  it('adds, edits and lists programs, and keeps the Program ID unique whatever the letter case', async () => {
    const { t, cookie, program } = await seed()
    const created = await t.call('POST', '/api/programs', { cookie, body: { code: ' P-100 ', name: 'Outreach North', address: '12 Mill Lane' } })
    expect(created.status).toBe(201)
    expect(created.data).toMatchObject({ code: 'P-100', name: 'Outreach North', address: '12 Mill Lane', isActive: true, assetsHeld: 0, hasHistory: false, deleteBlocked: null })
    await program('P-200', 'After School')

    const duplicate = await t.call('POST', '/api/programs', { cookie, body: { code: 'p-100', name: 'Another' } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.data).toMatchObject({ error: 'duplicate_program', message: 'Program ID p-100 already exists.', details: { fields: { code: 'Program ID p-100 already exists.' } } })
    // The database holds the rule as well.
    expect(() => t.sqlite.prepare("insert into programs (code, name) values ('p-100', 'Direct')").run()).toThrow(/UNIQUE/)

    const missing = await t.call('POST', '/api/programs', { cookie, body: { code: '', name: 'N'.repeat(121) } })
    expect(missing.status).toBe(422)
    expect(missing.data.details.fields).toEqual({ code: 'Required', name: 'Program name can be at most 120 characters' })

    // An edit may change the case of its own ID, clear the address, and not take another program's ID.
    const edited = await t.call('PATCH', `/api/programs/${created.data.id}`, { cookie, body: { code: 'p-100', name: 'Outreach North', address: '' } })
    expect(edited.data).toMatchObject({ code: 'p-100', address: null })
    expect((await t.call('PATCH', `/api/programs/${created.data.id}`, { cookie, body: { code: 'P-200' } })).status).toBe(409)
    expect((await t.call('PATCH', '/api/programs/9999', { cookie, body: { name: 'Nobody' } })).status).toBe(404)

    const list = (await t.call('GET', '/api/programs', { cookie })).data
    expect(list.map((p: { name: string }) => p.name)).toEqual(['After School', 'Outreach North'])
    expect((await t.call('GET', '/api/lookups', { cookie })).data.programs).toEqual([
      { id: list[0].id, code: 'P-200', name: 'After School' },
      { id: created.data.id, code: 'p-100', name: 'Outreach North' },
    ])

    const audit = (await t.call('GET', '/api/audit?q=program', { cookie })).data.entries.map((e: { action: string; entityType: string; details: string }) => [e.action, e.entityType, e.details])
    expect(audit).toEqual([
      ['update', 'program', 'program_id=p-100 · program_id: P-100 → p-100; address: 12 Mill Lane → —'],
      ['create', 'program', 'program_id=P-200 · After School'],
      ['create', 'program', 'program_id=P-100 · Outreach North'],
    ])
  })

  it('assigns an asset to a program like issuing it to a person, and returns it the same way', async () => {
    const { t, cookie, good, fair, make, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    const asset = (await make('BPHS-0141')).data

    const issued = await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, programId: outreach.id, conditionRatingId: good.id } })
    expect(issued.status).toBe(201)
    expect(issued.data).toMatchObject({ assetTag: 'BPHS-0141', employee: null, program: { id: outreach.id, code: 'P-100', name: 'Outreach North' }, issueRating: 'Good' })

    // It has left storage and shows among the open assignments, with the program as its holder.
    const row = (await t.call('GET', '/api/assets', { cookie })).data[0]
    expect(row).toMatchObject({ state: 'assigned', holder: null, program: { code: 'P-100' }, assignmentId: issued.data.id })
    expect((await t.call('GET', '/api/assignments', { cookie })).data).toHaveLength(1)
    expect((await t.call('GET', '/api/programs', { cookie })).data[0]).toMatchObject({ assetsHeld: 1, hasHistory: true })

    // To move it to a person it is returned first.
    const toPerson = await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id } })
    expect(toPerson.status).toBe(409)
    expect(toPerson.data).toMatchObject({ error: 'asset_already_assigned', message: 'BPHS-0141 is already assigned to Outreach North.' })
    expect((await t.call('POST', `/api/assets/${asset.id}/retire`, { cookie })).data.message).toBe('BPHS-0141 is assigned to Outreach North. Return it before retiring.')

    expect((await t.call('POST', `/api/assignments/${issued.data.id}/return`, { cookie, body: { conditionRatingId: fair.id } })).status).toBe(204)
    const detail = (await t.call('GET', '/api/assets/tag/BPHS-0141', { cookie })).data
    expect(detail.asset).toMatchObject({ state: 'in_storage', holder: null, program: null })
    expect(detail.history).toEqual([expect.objectContaining({ employee: null, program: { id: outreach.id, code: 'P-100', name: 'Outreach North' }, issueRating: 'Good', returnRating: 'Fair' })])
    expect(detail.conditions.map((c: { kind: string }) => c.kind)).toEqual(['return', 'issue', 'intake'])
    expect((await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id } })).status).toBe(201)

    const audit = (await t.call('GET', '/api/audit?q=BPHS-0141', { cookie })).data.entries.map((e: { action: string; details: string }) => [e.action, e.details])
    expect(audit.slice(1)).toEqual([
      ['return', 'BPHS-0141 ← program P-100 · Fair'],
      ['issue', 'BPHS-0141 → program P-100 · Good'],
      ['create', 'BPHS-0141 · Laptop'],
    ])
  })

  it('wants exactly one holder: an employee or a program, not both and not neither', async () => {
    const { t, cookie, good, make, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    const asset = (await make('BPHS-0141')).data
    const issue = (body: Record<string, unknown>) => t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, conditionRatingId: good.id, ...body } })

    const both = await issue({ employeeId: t.person.id, programId: outreach.id })
    expect(both.status).toBe(422)
    expect(both.data.details.fields).toEqual({ programId: 'Choose an employee or a program, not both' })
    const neither = await issue({})
    expect(neither.status).toBe(422)
    expect(neither.data.details.fields).toEqual({ employeeId: 'Choose an employee or a program' })
    expect((await issue({ employeeId: null, programId: null })).status).toBe(422)
    expect((await issue({ programId: 9999 })).status).toBe(404)
    expect((await t.call('GET', '/api/assignments', { cookie })).data).toEqual([])

    // A new asset may start with one holder or none.
    const twoHolders = await make('BPHS-0142', { holderId: t.person.id, programId: outreach.id })
    expect(twoHolders.status).toBe(422)
    expect(twoHolders.data.details.fields).toEqual({ programId: 'Choose an employee or a program, not both' })
    const started = await make('BPHS-0143', { programId: outreach.id })
    expect(started.status).toBe(201)
    expect(started.data).toMatchObject({ state: 'assigned', holder: null, program: { code: 'P-100' } })

    // The database refuses both shapes itself, whatever the app let through.
    const insert = t.sqlite.prepare('insert into assignments (asset_id, employee_id, program_id, issued_at, issued_by_id) values (?, ?, ?, ?, ?)')
    expect(() => insert.run(asset.id, t.person.id, outreach.id, Date.now(), t.superUser.id)).toThrow(/CHECK/)
    expect(() => insert.run(asset.id, null, null, Date.now(), t.superUser.id)).toThrow(/CHECK/)
    expect(() => t.sqlite.prepare('update assignments set employee_id = ? where program_id is not null').run(t.person.id)).toThrow(/CHECK/)
  })

  it('deactivates a program that has held assets instead of deleting it, and only once it holds none', async () => {
    const { t, cookie, good, make, program } = await seed()
    const admin = await t.asAdmin()
    const outreach = await program('P-100', 'Outreach North')
    const mistake = await program('P-999', 'Typo')
    const asset = (await make('BPHS-0141', { programId: outreach.id })).data

    const holding = await t.call('POST', `/api/programs/${outreach.id}/deactivate`, { cookie })
    expect(holding.status).toBe(409)
    expect(holding.data).toMatchObject({ error: 'holds_assets', message: 'Outreach North still holds 1 asset(s). Return them before deactivating.' })

    await t.call('POST', '/api/assignments/return-bulk', { cookie, body: { ids: [asset.assignmentId], conditionRatingId: good.id } })
    const kept = await t.call('DELETE', `/api/programs/${outreach.id}`, { cookie })
    expect(kept.status).toBe(409)
    expect(kept.data).toMatchObject({ error: 'has_history', message: 'Outreach North cannot be deleted. Has assignment history. Deactivate instead; history is never deleted.' })
    expect((await t.call('GET', '/api/programs', { cookie })).data.find((p: { id: number }) => p.id === outreach.id).deleteBlocked).toBe('Has assignment history. Deactivate instead; history is never deleted.')

    const off = await t.call('POST', `/api/programs/${outreach.id}/deactivate`, { cookie: admin })
    expect(off.data).toMatchObject({ isActive: false, assetsHeld: 0, hasHistory: true })
    // A deactivated program is offered to nobody and refused if asked for; its history still names it.
    expect((await t.call('GET', '/api/lookups', { cookie })).data.programs.map((p: { code: string }) => p.code)).toEqual(['P-999'])
    const refused = await t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, programId: outreach.id, conditionRatingId: good.id } })
    expect(refused.data).toMatchObject({ error: 'program_inactive', message: 'Outreach North is deactivated.' })
    expect((await t.call('GET', '/api/assets/tag/BPHS-0141', { cookie })).data.history[0].program.name).toBe('Outreach North')
    expect((await t.call('POST', `/api/programs/${outreach.id}/reactivate`, { cookie: admin })).data.isActive).toBe(true)

    // Deleting is for a program entered by mistake, and for a Super Admin.
    expect((await t.call('DELETE', `/api/programs/${mistake.id}`, { cookie: admin })).status).toBe(403)
    expect((await t.call('DELETE', `/api/programs/${mistake.id}`, { cookie })).status).toBe(204)
    expect((await t.call('GET', '/api/programs', { cookie })).data.map((p: { code: string }) => p.code)).toEqual(['P-100'])
  })

  it('counts an asset a program holds as assigned on the dashboard, and keeps top holders to people', async () => {
    const { t, cookie, make, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    await make('D-1', { programId: outreach.id })
    await make('D-2', { holderId: t.person.id })
    await make('D-3')
    const { data } = await t.call('GET', '/api/dashboard', { cookie })
    expect(data.totals).toEqual({ total: 3, assigned: 2, inStorage: 1, retired: 0 })
    expect(data.topHolders).toEqual([{ employee: expect.objectContaining({ id: t.person.id }), count: 1 }])
    expect(data.longestOut.map((row: { assetTag: string; employee: unknown; program: { name: string } | null }) => [row.assetTag, row.employee === null, row.program?.name ?? null])).toEqual([
      ['D-1', true, 'Outreach North'],
      ['D-2', false, null],
    ])
  })

  it('on upgrade, rebuilds the assignments table around the rows it already has', () => {
    const folder = path.join(import.meta.dirname, '../db/migrations')
    const statements = (file: string) => fs.readFileSync(path.join(folder, file), 'utf8').split('--> statement-breakpoint')
    const files = fs.readdirSync(folder).filter((file) => file.endsWith('.sql')).sort()
    const last = files.findIndex((file) => file.startsWith('0005_'))
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    for (const file of files.slice(0, last)) for (const statement of statements(file)) sqlite.exec(statement)

    sqlite.exec(`
      insert into employees (id, code, first_name, last_name) values (1, 'E-1', 'Sam', 'First'), (2, 'E-2', 'Olu', 'Second');
      insert into users (id, name, email, password_hash, role) values (1, 'Admin', 'admin@x.example', 'x', 'admin');
      insert into asset_types (id, name) values (1, 'Laptop');
      insert into condition_ratings (id, name, score) values (1, 'Good', 80), (2, 'Fair', 60);
      insert into assets (id, tag, type_id) values (1, 'A-1', 1), (2, 'A-2', 1), (3, 'A-3', 1);
      insert into assignments (id, asset_id, employee_id, issued_at, returned_at, issued_by_id, returned_by_id) values
        (3, 1, 1, 1000, 2000, 1, 1),
        (4, 1, 2, 3000, null, 1, null),
        (9, 2, 1, 4000, 5000, 1, 1);
      insert into conditions (id, asset_id, assignment_id, kind, rating_id, assessed_by_id, notes, recorded_by_id, recorded_at) values
        (1, 1, null, 'intake', 1, null, null, 1, 500),
        (2, 1, 3, 'issue', 1, 1, null, 1, 1000),
        (3, 1, 3, 'return', 2, 2, 'Scuffed lid', 1, 2000),
        (4, 1, 4, 'issue', 2, null, null, 1, 3000),
        (8, 2, 9, 'issue', 1, null, null, 1, 4000),
        (11, 2, 9, 'return', 1, null, null, 1, 5000);
      -- Rows that were deleted since: the counters are ahead of the highest id left.
      update sqlite_sequence set seq = 12 where name = 'assignments';
      update sqlite_sequence set seq = 15 where name = 'conditions';`)
    const assignmentsBefore = sqlite.prepare('select * from assignments order by id').all()
    const conditionsBefore = sqlite.prepare('select * from conditions order by id').all()

    // The migrator runs a migration inside one transaction with foreign keys on, so the test does too.
    sqlite.exec('begin')
    for (const statement of statements(files[last]!)) sqlite.exec(statement)
    sqlite.exec('commit')

    expect(sqlite.prepare('select * from assignments order by id').all()).toEqual(assignmentsBefore.map((row) => ({ ...(row as object), program_id: null })))
    expect(sqlite.prepare('select id, asset_id, employee_id, program_id, issued_at, returned_at, issued_by_id, returned_by_id from assignments where id = 4').get()).toEqual({
      id: 4, asset_id: 1, employee_id: 2, program_id: null, issued_at: 3000, returned_at: null, issued_by_id: 1, returned_by_id: null,
    })
    expect(sqlite.prepare('select * from conditions order by id').all()).toEqual(conditionsBefore)
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    expect(sqlite.prepare("select name from sqlite_master where name like '\\_\\_%' escape '\\'").all()).toEqual([])

    // The rules the old tables held still hold: one open assignment per asset, and history that cannot be pulled out from under a condition.
    const insert = sqlite.prepare('insert into assignments (asset_id, employee_id, program_id, issued_at, issued_by_id) values (?, ?, ?, ?, ?)')
    expect(() => insert.run(1, 1, null, 6000, 1)).toThrow(/UNIQUE/)
    expect(() => sqlite.prepare('delete from assignments where id = 3').run()).toThrow(/FOREIGN KEY/)
    expect(() => sqlite.prepare("insert into conditions (asset_id, assignment_id, kind, rating_id, recorded_by_id, recorded_at) values (1, 999, 'issue', 1, 1, 1)").run()).toThrow(/FOREIGN KEY/)
    // And the new ones are there: a program can hold an asset, and ids carry on from where they stopped.
    sqlite.exec("insert into programs (id, code, name) values (1, 'P-100', 'Outreach North')")
    expect(() => insert.run(3, 1, 1, 6000, 1)).toThrow(/CHECK/)
    expect(insert.run(3, null, 1, 6000, 1).lastInsertRowid).toBe(13)
    expect(sqlite.prepare("insert into conditions (asset_id, assignment_id, kind, rating_id, recorded_by_id, recorded_at) values (3, 13, 'issue', 1, 1, 6000)").run().lastInsertRowid).toBe(16)
    // Deleting an asset still takes its condition records with it, once nothing else holds it.
    sqlite.exec('insert into assets (id, tag, type_id) values (4, \'A-4\', 1); insert into conditions (asset_id, kind, rating_id, recorded_by_id, recorded_at) values (4, \'intake\', 1, 1, 1); delete from assets where id = 4')
    expect(sqlite.prepare('select count(*) as n from conditions where asset_id = 4').get()).toEqual({ n: 0 })
    sqlite.close()
  })
})

describe('digital assets and digital asset types', () => {
  /** Unassign the way the page does: naming the assignment the seat has right now (or one that cannot exist, when it has none). */
  async function unassign(t: Awaited<ReturnType<typeof setup>>, id: number, cookie: string) {
    const { asset } = (await t.call('GET', `/api/digital-assets/${id}`, { cookie })).data as { asset: { assignmentId: number | null } }
    return t.call('POST', `/api/digital-assets/${id}/unassign`, { cookie, body: { assignmentId: asset.assignmentId ?? 999_999 } })
  }

  it('refuses an unassign that was confirmed against an earlier holder', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const typeId = ((await t.call('GET', '/api/lookups', { cookie })).data.digitalAssetTypes as { id: number }[])[0]!.id
    const person = async (code: string, firstName: string, lastName: string) =>
      (await t.call('POST', '/api/employees', { cookie, body: { code, firstName, lastName } })).data as { id: number }
    const marcus = await person('E-9001', 'Marcus', 'Stale')
    const priya = await person('E-9002', 'Priya', 'Newer')
    const seat = (await t.call('POST', '/api/digital-assets', { cookie, body: { typeId, account: 'stale.tab@bphs.org', employeeId: marcus.id } })).data
    const path = `/api/digital-assets/${seat.id}`

    // Tab A opens the confirmation for Marcus. Tab B unassigns him and issues the seat to Priya.
    const stale = { assignmentId: seat.assignmentId as number }
    expect((await t.call('POST', `${path}/unassign`, { cookie, body: stale })).status).toBe(200)
    const reissued = (await t.call('POST', `${path}/issue`, { cookie, body: { employeeId: priya.id } })).data

    // Tab A confirms: Priya keeps the seat.
    const late = await t.call('POST', `${path}/unassign`, { cookie, body: stale })
    expect(late.status).toBe(409)
    expect(late.data).toMatchObject({ error: 'assignment_changed', message: `${seat.code} is now issued to Priya Newer. Nothing was unassigned.` })
    expect((await t.call('GET', path, { cookie })).data.asset).toMatchObject({ state: 'active', assignmentId: reissued.assignmentId, employee: { id: priya.id } })

    // The seat alone is not enough to say whose assignment ends.
    expect((await t.call('POST', `${path}/unassign`, { cookie })).status).toBeGreaterThanOrEqual(400)
    expect((await t.call('GET', path, { cookie })).data.asset.employee).toMatchObject({ id: priya.id })
  })

  async function seed() {
    const t = await setup()
    const cookie = await t.asSuper()
    const admin = await t.asAdmin()
    const types = (await t.call('GET', '/api/lookups', { cookie })).data.digitalAssetTypes as { id: number; name: string }[]
    const m365 = types.find((x) => x.name === 'M365-BusinessStandard')!
    const zoho = types.find((x) => x.name === 'Zoho')!
    const make = async (account: string, extra: Record<string, unknown> = {}) =>
      await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: m365.id, account, ...extra } })
    const employee = async (code: string, firstName: string, lastName: string) =>
      (await t.call('POST', '/api/employees', { cookie, body: { code, firstName, lastName } })).data as { id: number; name: string }
    const audit = async () => (await t.call('GET', '/api/audit?limit=100', { cookie })).data.entries as { action: string; entityType: string; details: string }[]
    return { t, cookie, admin, types, m365, zoho, make, employee, audit }
  }

  it('starts with the four digital asset types, there from the migration and not from the demo data', async () => {
    const { types } = await seed()
    expect(types.map((x) => x.name)).toEqual(['M365-BusinessStandard', 'M365-PowerBI', 'Relias', 'Zoho'])
  })

  it('gives each one the next Asset ID, which is never typed, never edited and never reused', async () => {
    const { t, cookie, make, m365 } = await seed()
    const first = await make(' p.raghunathan@bphs.org ')
    expect(first.status).toBe(201)
    expect(first.data).toMatchObject({ code: 'DA-00001', type: 'M365-BusinessStandard', account: 'p.raghunathan@bphs.org', status: 'in_service', state: 'not_issued', employee: null, issuedAt: null, hasHistory: false })
    expect((await make('m.oyelaran@bphs.org')).data.code).toBe('DA-00002')

    // A code sent with the request is not what it gets, and an edit cannot change it.
    const typed = await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: m365.id, account: 'seat 3', code: 'DA-99999' } })
    expect(typed.data.code).toBe('DA-00003')
    expect((await t.call('PATCH', `/api/digital-assets/${typed.data.id}`, { cookie, body: { code: 'DA-00001', account: 'seat three' } })).data).toMatchObject({ code: 'DA-00003', account: 'seat three' })

    // Deleting the newest does not free its number.
    expect((await t.call('DELETE', `/api/digital-assets/${typed.data.id}`, { cookie })).status).toBe(204)
    expect((await make('seat 4')).data.code).toBe('DA-00004')
    expect((await t.call('GET', '/api/digital-assets', { cookie })).data.map((d: { code: string }) => d.code)).toEqual(['DA-00001', 'DA-00002', 'DA-00004'])
  })

  it('checks the type and the License/Account, and refuses a value that labels itself as a credential', async () => {
    const { t, cookie, make, m365, zoho } = await seed()
    const secret = await make('j.doe@bphs.org password: hunter2')
    expect(secret.status).toBe(422)
    expect(secret.data.details.fields).toEqual({ account: 'Enter the email address or license reference only, never a password or key.' })
    expect((await make('')).data.details.fields).toEqual({ account: 'Required' })
    expect((await make('x'.repeat(201))).data.details.fields).toEqual({ account: 'License/Account can be at most 200 characters' })
    expect((await t.call('GET', '/api/digital-assets', { cookie })).data).toEqual([])

    await t.call('PATCH', `/api/digital-asset-types/${zoho.id}`, { cookie, body: { isActive: false } })
    const inactiveType = await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: zoho.id, account: 'seat' } })
    expect(inactiveType.status).toBe(422)
    expect(inactiveType.data.details.fields).toEqual({ typeId: 'Choose an active digital asset type.' })
    expect((await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: 9999, account: 'seat' } })).status).toBe(422)

    const seat = (await make('seat 1')).data
    const edited = await t.call('PATCH', `/api/digital-assets/${seat.id}`, { cookie, body: { account: 'token=abc123' } })
    expect(edited.status).toBe(422)
    expect((await t.call('PATCH', `/api/digital-assets/${seat.id}`, { cookie, body: { typeId: zoho.id } })).status).toBe(422)
    expect((await t.call('PATCH', `/api/digital-assets/${seat.id}`, { cookie, body: { typeId: m365.id, account: 'seat 1' } })).data.account).toBe('seat 1')
    expect((await t.call('PATCH', '/api/digital-assets/9999', { cookie, body: { account: 'x' } })).status).toBe(404)
    expect((await t.call('GET', '/api/digital-assets/9999', { cookie })).status).toBe(404)
  })

  it('reads the status from the assignment: Active while issued, Not Issued when free', async () => {
    const { t, cookie, make, employee, audit } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const seat = (await make('ana.lima@bphs.org', { employeeId: ana.id })).data
    expect(seat).toMatchObject({ state: 'active', status: 'in_service', employee: { id: ana.id, code: 'E-2001', name: 'Ana Lima' }, hasHistory: true })
    expect(Date.now() - new Date(seat.issuedAt).getTime()).toBeLessThan(5000)

    const free = (await make('spare@bphs.org')).data
    expect(free.state).toBe('not_issued')
    const issued = await t.call('POST', `/api/digital-assets/${free.id}/issue`, { cookie, body: { employeeId: ana.id } })
    expect(issued.status).toBe(200)
    expect(issued.data).toMatchObject({ state: 'active', employee: { id: ana.id } })

    // One seat, one person: issuing it again is refused, by the service and by the database.
    const again = await t.call('POST', `/api/digital-assets/${free.id}/issue`, { cookie, body: { employeeId: t.person.id } })
    expect(again.status).toBe(409)
    expect(again.data).toMatchObject({ error: 'asset_already_assigned', message: 'DA-00002 is already issued to Ana Lima. Unassign it first.' })
    expect(() =>
      t.sqlite.prepare('insert into digital_assignments (digital_asset_id, employee_id, issued_at, issued_by_id) values (?, ?, 1, ?)').run(free.id, t.person.id, t.superUser.id),
    ).toThrow(/UNIQUE/)

    const unassigned = await unassign(t, free.id, cookie)
    expect(unassigned.data).toMatchObject({ state: 'not_issued', employee: null, issuedAt: null, hasHistory: true })
    expect((await unassign(t, free.id, cookie)).data).toMatchObject({ error: 'not_assigned', message: 'DA-00002 is not issued to anyone.' })

    const log = await audit()
    expect(log.filter((e) => e.entityType === 'digitalasset').map((e) => `${e.action} ${e.details}`)).toEqual([
      'return DA-00002 ← E-2001 · M365-BusinessStandard',
      'issue DA-00002 → E-2001 · M365-BusinessStandard',
      'create DA-00002 · M365-BusinessStandard · spare@bphs.org',
      'issue DA-00001 → E-2001 · M365-BusinessStandard',
      'create DA-00001 · M365-BusinessStandard · ana.lima@bphs.org',
    ])
  })

  it('marks one inactive only while nobody has it, and will not issue it until it is reactivated', async () => {
    const { t, cookie, make, employee } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const seat = (await make('ana.lima@bphs.org', { employeeId: ana.id })).data

    const held = await t.call('POST', `/api/digital-assets/${seat.id}/deactivate`, { cookie })
    expect(held.status).toBe(409)
    expect(held.data).toMatchObject({ error: 'asset_assigned', message: 'DA-00001 is issued to Ana Lima. Unassign it first.' })

    await unassign(t, seat.id, cookie)
    expect((await t.call('POST', `/api/digital-assets/${seat.id}/deactivate`, { cookie })).data).toMatchObject({ status: 'inactive', state: 'inactive' })

    const refused = await t.call('POST', `/api/digital-assets/${seat.id}/issue`, { cookie, body: { employeeId: ana.id } })
    expect(refused.status).toBe(409)
    expect(refused.data).toMatchObject({ error: 'asset_inactive', message: 'DA-00001 is inactive. Reactivate it before issuing.' })

    expect((await t.call('POST', `/api/digital-assets/${seat.id}/reactivate`, { cookie })).data.state).toBe('not_issued')
    expect((await t.call('POST', `/api/digital-assets/${seat.id}/issue`, { cookie, body: { employeeId: ana.id } })).data.state).toBe('active')
  })

  it('keeps the history of who had it, issued today or on an earlier date and never on a future one', async () => {
    const { t, cookie, admin, make, employee } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const ben = await employee('E-2002', 'Ben', 'Okafor')
    const seat = (await make('shared.seat@bphs.org')).data
    const issue = async (body: Record<string, unknown>, as = cookie) => await t.call('POST', `/api/digital-assets/${seat.id}/issue`, { cookie: as, body })

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
    const future = await issue({ employeeId: ana.id, issuedAt: tomorrow })
    expect(future.status).toBe(422)
    expect(future.data.details.fields).toEqual({ issuedAt: 'The issue date cannot be in the future.' })
    expect((await issue({ employeeId: ana.id, issuedAt: '2026-01-05' })).status).toBe(422)

    const earlier = '2026-03-02T12:00:00.000Z'
    expect((await issue({ employeeId: ana.id, issuedAt: earlier })).data).toMatchObject({ state: 'active', issuedAt: earlier })
    await unassign(t, seat.id, admin)

    // The next holder cannot be dated to before the last one gave it up.
    const overlap = await issue({ employeeId: ben.id, issuedAt: earlier })
    expect(overlap.status).toBe(422)
    expect(overlap.data.details.fields).toEqual({ issuedAt: 'The issue date cannot be before DA-00001 was last unassigned.' })
    expect((await issue({ employeeId: ben.id }, admin)).status).toBe(200)

    const detail = (await t.call('GET', `/api/digital-assets/${seat.id}`, { cookie })).data
    expect(detail.asset).toMatchObject({ code: 'DA-00001', state: 'active', employee: { name: 'Ben Okafor' } })
    expect(detail.history).toMatchObject([
      { employee: { code: 'E-2002', name: 'Ben Okafor' }, returnedAt: null, issuedBy: 'm.oyelaran@bphs.local', returnedBy: null },
      { employee: { code: 'E-2001', name: 'Ana Lima' }, issuedAt: earlier, issuedBy: 'p.raghunathan@bphs.local', returnedBy: 'm.oyelaran@bphs.local' },
    ])
    expect(detail.history[1].returnedAt).not.toBeNull()

    // Not to an archived employee, and not to nobody.
    const cal = await employee('E-2003', 'Cal', 'Reyes')
    await t.call('POST', `/api/employees/${cal.id}/archive`, { cookie })
    const other = (await make('other@bphs.org')).data
    const archived = await t.call('POST', `/api/digital-assets/${other.id}/issue`, { cookie, body: { employeeId: cal.id } })
    expect(archived.data).toMatchObject({ error: 'employee_archived', message: 'Cal Reyes is archived.' })
    expect((await t.call('POST', `/api/digital-assets/${other.id}/issue`, { cookie, body: { employeeId: 9999 } })).status).toBe(404)
    expect((await t.call('POST', `/api/digital-assets/${other.id}/issue`, { cookie, body: {} })).status).toBe(422)
    // Adding one with an employee who cannot take it adds nothing.
    expect((await make('third@bphs.org', { employeeId: cal.id })).status).toBe(409)
    expect((await t.call('GET', '/api/digital-assets', { cookie })).data).toHaveLength(2)
  })

  it('lets only a Super Admin delete one, and only one that was never issued', async () => {
    const { t, cookie, admin, make, employee, audit } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const used = (await make('used@bphs.org', { employeeId: ana.id })).data
    const mistake = (await make('mistake@bphs.org')).data

    expect((await t.call('DELETE', `/api/digital-assets/${mistake.id}`, { cookie: admin })).status).toBe(403)
    await unassign(t, used.id, cookie)
    const kept = await t.call('DELETE', `/api/digital-assets/${used.id}`, { cookie })
    expect(kept.status).toBe(409)
    expect(kept.data).toMatchObject({ error: 'has_history', message: 'DA-00001 has assignment history. Mark it inactive instead; history is never deleted.' })
    expect((await t.call('DELETE', `/api/digital-assets/${mistake.id}`, { cookie })).status).toBe(204)
    expect((await audit())[0]).toMatchObject({ action: 'delete', entityType: 'digitalasset', details: 'DA-00002 · M365-BusinessStandard · mistake@bphs.org' })
  })

  it('keeps an employee with a digital asset from being archived or deleted, and says why', async () => {
    const { t, cookie, make, employee } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const seat = (await make('ana.lima@bphs.org', { employeeId: ana.id })).data
    const row = async () => (await t.call('GET', '/api/employees', { cookie })).data.find((e: { id: number }) => e.id === ana.id)
    expect(await row()).toMatchObject({ assetsHeld: 0, digitalHeld: 1, hasHistory: true })

    const archive = await t.call('POST', `/api/employees/${ana.id}/archive`, { cookie })
    expect(archive.status).toBe(409)
    expect(archive.data).toMatchObject({ error: 'holds_assets', message: 'Ana Lima still has 1 digital asset(s). Unassign them before archiving.' })
    const remove = await t.call('DELETE', `/api/employees/${ana.id}`, { cookie })
    expect(remove.status).toBe(409)
    expect(remove.data).toMatchObject({ error: 'has_history', message: 'Ana Lima cannot be deleted. Has assignment history. Archive instead; history is never deleted.' })

    await unassign(t, seat.id, cookie)
    expect(await row()).toMatchObject({ digitalHeld: 0, hasHistory: true })
    // The history still names them, so they can be archived now but never deleted.
    expect((await t.call('DELETE', `/api/employees/${ana.id}`, { cookie })).status).toBe(409)
    expect((await t.call('POST', `/api/employees/${ana.id}/archive`, { cookie })).status).toBe(200)
  })

  it('manages digital asset types by the rules of asset types', async () => {
    const { t, cookie, admin, make, m365, types, audit } = await seed()
    const path = '/api/digital-asset-types'
    const created = await t.call('POST', path, { cookie: admin, body: { name: ' Adobe-CC ' } })
    expect(created.status).toBe(201)
    expect(created.data).toEqual({ id: created.data.id, name: 'Adobe-CC', isActive: true, assetCount: 0 })
    const duplicate = await t.call('POST', path, { cookie: admin, body: { name: 'zoho' } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.data).toMatchObject({ error: 'duplicate_name', message: 'A digital asset type named "zoho" already exists.', details: { fields: { name: 'A digital asset type named "zoho" already exists.' } } })
    // The two registers keep their own lists: a name used by one is free in the other.
    expect((await t.call('POST', path, { cookie: admin, body: { name: 'Laptop' } })).status).toBe(201)

    expect((await t.call('PATCH', `${path}/${created.data.id}`, { cookie: admin, body: { name: 'Adobe Creative Cloud' } })).data.name).toBe('Adobe Creative Cloud')
    expect((await t.call('PATCH', `${path}/${created.data.id}`, { cookie: admin, body: { name: 'Relias' } })).status).toBe(409)
    expect((await t.call('PATCH', `${path}/9999`, { cookie: admin, body: { name: 'Nothing' } })).status).toBe(404)

    // In use: deactivate, not delete. Deleting is for a Super Admin.
    await make('seat 1')
    expect((await t.call('GET', path, { cookie })).data.find((x: { id: number }) => x.id === m365.id).assetCount).toBe(1)
    expect((await t.call('DELETE', `${path}/${created.data.id}`, { cookie: admin })).status).toBe(403)
    const inUse = await t.call('DELETE', `${path}/${m365.id}`, { cookie })
    expect(inUse.status).toBe(409)
    expect(inUse.data).toMatchObject({ error: 'in_use', message: '1 digital asset(s) use "M365-BusinessStandard". Deactivate it instead.' })
    expect((await t.call('DELETE', `${path}/${created.data.id}`, { cookie })).status).toBe(204)

    // A deactivated type leaves the forms, and the last active one can be neither switched off nor deleted.
    const all = (await t.call('GET', path, { cookie })).data as { id: number; name: string }[]
    const last = all.find((x) => x.name === 'Relias')!
    for (const type of all.filter((x) => x.id !== last.id)) {
      expect((await t.call('PATCH', `${path}/${type.id}`, { cookie, body: { isActive: false } })).status).toBe(200)
    }
    expect((await t.call('GET', '/api/lookups', { cookie })).data.digitalAssetTypes).toEqual([{ id: last.id, name: 'Relias' }])
    const refused = await t.call('PATCH', `${path}/${last.id}`, { cookie, body: { isActive: false } })
    expect(refused.status).toBe(409)
    expect(refused.data).toMatchObject({ error: 'last_active', message: '"Relias" is the only active digital asset type. Activate or add another first.' })
    expect((await t.call('DELETE', `${path}/${last.id}`, { cookie })).data.error).toBe('last_active')
    expect(types).toHaveLength(4)

    const log = (await audit()).filter((e) => e.entityType === 'digitalassettype').map((e) => `${e.action} ${e.details}`)
    expect(log).toContain('create Adobe-CC')
    expect(log).toContain('update Adobe Creative Cloud · name: Adobe-CC → Adobe Creative Cloud')
    expect(log).toContain('delete unused type "Adobe Creative Cloud"')
  })
})
