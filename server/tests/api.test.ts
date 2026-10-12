import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import { DEFAULT_RATINGS, DEFAULT_TYPES, ensureDefaultLists } from '../bootstrap.ts'
import { createDb, runMigrations } from '../db/client.ts'
import { assetTypes, assets, auditLog, conditionRatings, sessions, users } from '../db/schema.ts'
import { login } from '../services/auth.ts'
import { PASSWORD, findUser, setup } from './helpers.ts'

/** When a Set-Cookie header says the cookie expires. */
const cookieExpiry = (header: string | null) => new Date(/expires=([^;]+)/i.exec(header ?? '')?.[1] ?? NaN)

describe('authentication', () => {
  it('signs in, sets an httpOnly cookie, and rejects bad credentials', async () => {
    const t = await setup()
    const ok = await t.signIn('p.raghunathan@bphs.local')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(ok.data.user.role).toBe('super_admin')

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

  it('writes one audit entry when an account locks, and none for the attempts before or after', async () => {
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

  it('moves the cookie forward whenever the server moves the session, so an active person is not signed out', async () => {
    const t = await setup()
    const signedIn = await t.signIn('m.oyelaran@bphs.local')
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

    // Everywhere else the limit leaves room for the 2 MB CSV the import page accepts, and not much more.
    const header = 'employee_id,first_name,last_name\n'
    const biggest = JSON.stringify({ csv: `${header}E-1,Rosa,${'D'.repeat(1_900_000)}\n` })
    expect((await post('/api/employees/import/preview', biggest, { cookie })).status).toBe(200)
    const tooBig = await post('/api/employees/import/preview', JSON.stringify({ csv: 'a'.repeat(4 * 1024 * 1024) }), { cookie })
    expect(tooBig.status).toBe(413)
    expect(((await tooBig.json()) as { message: string }).message).toMatch(/too large/i)
    // The same before sign-in: refused as too large, not read and answered with a 401.
    expect((await post('/api/assets', JSON.stringify({ tag: 'x'.repeat(4 * 1024 * 1024) }))).status).toBe(413)
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
    expect(late.data.message).toBe('BPHS-0141 has already been returned by m.oyelaran.')
    expect(late.data.details).toMatchObject({ returnedBy: 'm.oyelaran', returnedByYou: false })
    expect(Date.parse(late.data.details.returnedAt)).toBeLessThanOrEqual(Date.now())

    // The same person again, from another tab say: it was not "another user".
    const again = await t.call('POST', `/api/assignments/${issued.data.id}/return`, { cookie: other, body: { conditionRatingId: good.id } })
    expect(again.status).toBe(409)
    expect(again.data.message).toBe('BPHS-0141 has already been returned by you.')
    expect(again.data.details).toMatchObject({ returnedBy: 'm.oyelaran', returnedByYou: true })
    // A bulk return passes the same sentence on for the row it could not close.
    const bulk = await t.call('POST', '/api/assignments/return-bulk', { cookie, body: { ids: [issued.data.id], conditionRatingId: good.id } })
    expect(bulk.data).toEqual({ returned: [], failed: [{ id: issued.data.id, message: 'BPHS-0141 has already been returned by m.oyelaran.' }] })
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

describe('employees and CSV import', () => {
  const CSV =
    '﻿employee_id,first_name,last_name,department,job_title\r\nE-1402,Rosa,Delgado,Intake,Coordinator\r\nE-1042,Priya,Raghunathan,IT,Analyst\r\n,Kerry,Milton,Finance,\r\nE-1403,"Zhao, Wen",Lee,IT,"Help ""desk"""\r\n'

  it('previews, imports once, skips duplicates and logs one entry per created employee', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const preview = await t.call('POST', '/api/employees/import/preview', { cookie, body: { csv: CSV } })
    expect(preview.data.summary).toEqual({ read: 4, create: 2, duplicates: 1, errors: 1 })
    expect(preview.data.rows.find((r: { row: number }) => r.row === 4).message).toMatch(/missing employee_id/)
    expect(preview.data.rows[3]).toMatchObject({ firstName: 'Zhao, Wen', jobTitle: 'Help "desk"' })

    const run = await t.call('POST', '/api/employees/import', { cookie, body: { csv: CSV } })
    expect(run.data.created).toBe(2)
    const again = await t.call('POST', '/api/employees/import', { cookie, body: { csv: CSV } })
    expect(again.data.created).toBe(0)
    expect(again.data.summary.duplicates).toBe(3)

    const audit = (await t.call('GET', '/api/audit?action=import', { cookie })).data
    expect(audit.total).toBe(2)
    expect(audit.entries.map((e: { details: string }) => e.details).sort()).toEqual(['employee_id=E-1402', 'employee_id=E-1403'])
  })

  it('reports a missing required column instead of guessing', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const res = await t.call('POST', '/api/employees/import/preview', { cookie, body: { csv: 'employee_id,first_name\nE-1,A\n' } })
    expect(res.data.headerError).toMatch(/last_name/)
    expect(res.data.rows).toHaveLength(0)
  })

  it('reports rows over the limits of Add employee as errors and does not create them', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const csv = [
      'employee_id,first_name,last_name,department,job_title',
      `${'E'.repeat(200)},Rosa,Delgado,Intake,Coordinator`,
      `E-2001,${'R'.repeat(500)},Delgado,Intake,Coordinator`,
      `E-2002,Wen,Lee,${'D'.repeat(81)},Analyst`,
      'E-2003,Wen,Lee,Intake,Analyst',
    ].join('\r\n')

    const preview = await t.call('POST', '/api/employees/import/preview', { cookie, body: { csv } })
    expect(preview.data.summary).toEqual({ read: 4, create: 1, duplicates: 0, errors: 3 })
    expect(preview.data.rows.map((r: { result: string }) => r.result)).toEqual(['error', 'error', 'error', 'new'])
    expect(preview.data.rows[0].message).toMatch(/Row 2.*employee_id.*40 characters/)
    expect(preview.data.rows[1].message).toMatch(/Row 3.*first_name.*80 characters/)
    expect(preview.data.rows[2].message).toMatch(/Row 4.*department.*80 characters/)

    const run = await t.call('POST', '/api/employees/import', { cookie, body: { csv } })
    expect(run.data.created).toBe(1)
    const codes = (await t.call('GET', '/api/employees', { cookie })).data.map((e: { code: string }) => e.code)
    expect(codes).toContain('E-2003')
    expect(codes).not.toContain('E-2001')
    expect(codes.every((code: string) => code.length <= 40)).toBe(true)
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
})

describe('lists, users and audit', () => {
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
    expect(audit).toContain('score: 45 → 90')
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
    const user = await t.call('POST', '/api/users', { cookie, body: { name: 'N'.repeat(121), email: 'new.person@bphs.local', role: 'admin' } })
    expect(fields(user)).toEqual({ name: 'Name can be at most 120 characters' })
    expect(fields(await t.call('POST', '/api/asset-types', { cookie, body: { name: 'T'.repeat(61) } }))).toEqual({ name: 'Name can be at most 60 characters' })
    expect(fields(await t.call('POST', '/api/condition-ratings', { cookie, body: { name: 'R'.repeat(41), score: 50 } }))).toEqual({ name: 'Name can be at most 40 characters' })

    const duplicate = await t.call('POST', '/api/asset-types', { cookie, body: { name: 'laptop' } })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ name: 'An asset type named "laptop" already exists.' })
    const email = await t.call('POST', '/api/users', { cookie, body: { name: 'Another Marcus', email: 'M.Oyelaran@bphs.local', role: 'admin' } })
    expect(fields(email)).toEqual({ email: 'An account for m.oyelaran@bphs.local already exists.' })
  })

  it('keeps user management to Super Admins and hands back a one-time password once', async () => {
    const t = await setup()
    const admin = await t.asAdmin()
    const cookie = await t.asSuper()
    expect((await t.call('GET', '/api/users', { cookie: admin })).status).toBe(403)

    const created = await t.call('POST', '/api/users', {
      cookie,
      body: { name: 'New Person', email: 'New.Person@bphs.local', role: 'admin' },
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

  it('will not change your own role, even with another Super Admin present', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const promoted = await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { role: 'super_admin' } })
    expect(promoted.data.role).toBe('super_admin')

    const own = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { role: 'admin' } })
    expect(own.status).toBe(409)
    expect(own.data.error).toBe('self_role')
    expect(findUser(t.db, 'p.raghunathan@bphs.local')?.role).toBe('super_admin')

    // The rest of your own account can still be edited, and sending the role you already have is not a change.
    const renamed = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { name: 'Priya R.', role: 'super_admin' } })
    expect(renamed.status).toBe(200)
    expect(renamed.data.name).toBe('Priya R.')

    // The other Super Admin can still do it.
    const other = await t.asAdmin()
    const demoted = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { role: 'admin' } })
    expect(demoted.data.role).toBe('admin')
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
      expect(page.data.entries.map((e: { details: string }) => e.details).sort(), from).toEqual(['evening of the 9th', 'the 10th starts', 'the 9th ends'])
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
