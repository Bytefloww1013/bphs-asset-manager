import { employees } from '#foundation/employees/server/index.ts'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import { sessions, users } from '../db/schema.ts'
import { changePassword, login } from '../services/auth.ts'
import { ADMIN, PASSWORD, findUser, migratedBefore, setup } from '../testing/index.ts'

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
    t.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.email, 'm.oyelaran@bphs.local'))
      .run()
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(200)
    expect(findUser(t.db, 'm.oyelaran@bphs.local')?.failedLogins).toBe(0)
  })

  it('counts wrong passwords sent in parallel, so a burst cannot dodge the lock', async () => {
    const t = await setup()
    const burst = await Promise.all(
      Array.from({ length: 10 }, (_, i) => t.signIn('m.oyelaran@bphs.local', `wrong-${i}`)),
    )
    // Four attempts get a plain 401; the fifth locks the account, and any later one is refused as locked.
    expect(burst.filter((r) => r.status === 401).length).toBeLessThanOrEqual(4)
    expect(burst.every((r) => r.status === 401 || r.status === 423)).toBe(true)

    const row = findUser(t.db, 'm.oyelaran@bphs.local')
    expect(row?.failedLogins).toBeGreaterThanOrEqual(5)
    expect(row?.lockedUntil).toBeTruthy()
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(423)
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
    const reset = (id: number) =>
      t.db.update(users).set({ passwordHash: 'reset-by-admin' }).where(eq(users.id, id)).run()

    // Each has read the old password and is hashing when the reset lands.
    const signingIn = login(t.db, 'p.raghunathan@bphs.local', PASSWORD)
    reset(t.superUser.id)
    await expect(signingIn).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' })
    expect(t.db.select().from(sessions).all()).toHaveLength(0)

    const changing = changePassword(t.db, { ...t.adminUser, firstAccount: false }, PASSWORD, 'Brand-new-1!', undefined)
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
    expect(
      Math.abs(cookieExpiry(kept.headers.get('set-cookie')).getTime() - remembered.expiresAt.getTime()),
    ).toBeLessThan(1000)

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
    expect((await change('Brand-new-1!', tooLong)).data.details.fields.currentPassword).toBe(
      'Current password can be at most 256 characters',
    )

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
    const bloated = await post(
      '/api/auth/login',
      JSON.stringify({ email: 'm.oyelaran@bphs.local', password: 'x'.repeat(20_000) }),
    )
    expect(bloated.status).toBe(413)
    expect(await bloated.json()).toMatchObject({ error: 'payload_too_large' })
    // A declared length is enough: the body is not read to find out.
    expect((await post('/api/auth/login', '{}', { 'content-length': String(30 * 1024 * 1024) })).status).toBe(413)
    expect(
      (await post('/api/auth/login', JSON.stringify({ email: 'm.oyelaran@bphs.local', password: PASSWORD }))).status,
    ).toBe(200)

    // Everywhere else the limit leaves room for the largest import the page sends: 2,000 rows with every cell full.
    const full = (i: number) => ({
      row: i + 2,
      values: {
        code: `E-${i}`.padEnd(300, 'x'),
        firstName: 'F'.repeat(300),
        lastName: 'L'.repeat(300),
        department: 'D'.repeat(300),
        jobTitle: 'J'.repeat(300),
      },
    })
    const biggest = JSON.stringify({ rows: Array.from({ length: 2000 }, (_, i) => full(i)) })
    expect(biggest.length).toBeGreaterThan(3 * 1024 * 1024)
    expect((await post('/api/import/employees/preview', biggest, { cookie })).status).toBe(200)
    const tooBig = await post(
      '/api/import/employees/preview',
      JSON.stringify({ rows: [{ row: 2, values: { code: 'a'.repeat(4 * 1024 * 1024) } }] }),
      { cookie },
    )
    expect(tooBig.status).toBe(413)
    expect(((await tooBig.json()) as { message: string }).message).toMatch(/too large/i)
    // The same before sign-in: refused as too large, not read and answered with a 401.
    expect((await post('/api/assets', JSON.stringify({ tag: 'x'.repeat(4 * 1024 * 1024) }))).status).toBe(413)
  })

  it('refuses an upload from someone not signed in without reading any of it', async () => {
    const t = await setup()
    let read = 0
    // No Content-Length, and no end: anything that buffers it shows up in `read`.
    const endless = new ReadableStream(
      {
        pull: (c) => {
          read += 65536
          c.enqueue(new Uint8Array(65536))
        },
      },
      { highWaterMark: 0 },
    )
    const res = await t.app.request('/api/grievances', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', origin: 'http://localhost' },
      body: endless,
      duplex: 'half',
    })
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

describe('the import route', () => {
  type Values = Record<string, string>
  const rowsOf = (...values: Values[]) => ({ rows: values.map((v, i) => ({ row: i + 2, values: v })) })

  it('refuses other record types, too many rows, an empty file and a visitor who is not signed in', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const one = rowsOf({ code: 'E-3000', firstName: 'Ana', lastName: 'Cole' })
    for (const type of ['assets', 'assignments', 'digital-assets', 'users', '__proto__', 'toString']) {
      const refused = await t.call('POST', `/api/import/${type}`, { cookie, body: one })
      expect(refused.status).toBe(404)
      expect(refused.data.error).toBe('not_importable')
      expect((await t.call('POST', `/api/import/${type}/preview`, { cookie, body: one })).status).toBe(404)
    }

    const many = {
      rows: Array.from({ length: 2001 }, (_, i) => ({
        row: i + 2,
        values: { code: `E-${i + 5000}`, firstName: 'A', lastName: 'B' },
      })),
    }
    const tooMany = await t.call('POST', '/api/import/employees', { cookie, body: many })
    expect(tooMany.status).toBe(422)
    expect(tooMany.data.message).toBe('A file can hold at most 2,000 rows')
    expect((await t.call('POST', '/api/import/employees/preview', { cookie, body: { rows: [] } })).data.message).toBe(
      'The file has no rows to import',
    )
    expect(
      (await t.call('POST', '/api/import/employees', { cookie, body: { csv: 'employee_id\nE-1\n' } })).status,
    ).toBe(422)
    expect((await t.call('POST', '/api/import/employees', { body: one })).status).toBe(401)
    expect((await t.call('GET', '/api/employees', { cookie })).data.map((e: { code: string }) => e.code)).not.toContain(
      'E-3000',
    )

    // Exactly 2,000 goes through, in one transaction.
    many.rows.pop()
    expect((await t.call('POST', '/api/import/employees', { cookie, body: many })).data.created).toBe(2000)
  })
})

describe('what keeps an employee', () => {
  // The modules answer `employee.references` in registry order, and the first blocker is the one given: FEATURES keeps
  // maintenance before reviews, so the words are those from before the split.
  it('names the maintenance request before the review, as before the modules', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const person = (code: string, firstName: string) =>
      t.db.insert(employees).values({ code, firstName, lastName: 'Fixer' }).returning().get()
    const sam = person('E-2001', 'Sam')
    const lee = person('E-2002', 'Lee')
    const request = await t.call('POST', '/api/maintenance', {
      cookie,
      body: { firstName: 'Jane', location: 'Room 12', description: 'The sink drips.' },
    })
    expect(request.status).toBe(201)
    const dispatched = await t.call('POST', `/api/maintenance/${request.data.id}/dispatch`, {
      cookie,
      body: { employeeId: sam.id },
    })
    expect(dispatched.status).toBe(200)
    const review = await t.call('POST', '/api/reviews', {
      cookie,
      body: {
        title: 'Missed handover',
        summary: 'Handover notes were not written.',
        reviewDate: '2026-10-01',
        reviewerId: lee.id,
        employeeId: sam.id,
        findings: 'Two handovers were missed.',
        body: '<p>What happened.</p>',
      },
    })
    expect(review.status).toBe(201)
    expect((await t.call('DELETE', `/api/employees/${sam.id}`, { cookie })).data).toMatchObject({
      error: 'has_history',
      message:
        'Sam Fixer cannot be deleted. Dispatched on a maintenance request. Archive instead; history is never deleted.',
    })
  })
})

describe('users', () => {
  it("names the field and the limit when an account's name or email is refused", async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const fields = (res: { data: any }) => res.data.details.fields
    const lee = t.db.insert(employees).values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const user = await t.call('POST', '/api/users', {
      cookie,
      body: {
        name: 'N'.repeat(121),
        email: 'new.person@bphs.local',
        access: ADMIN,
        superAdmin: false,
        employeeId: lee.id,
      },
    })
    expect(fields(user)).toEqual({ name: 'Name can be at most 120 characters' })
    const email = await t.call('POST', '/api/users', {
      cookie,
      body: {
        name: 'Another Marcus',
        email: 'M.Oyelaran@bphs.local',
        access: ADMIN,
        superAdmin: false,
        employeeId: lee.id,
      },
    })
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
      body: {
        name: 'New Person',
        email: 'New.Person@bphs.local',
        access: ADMIN,
        superAdmin: false,
        employeeId: lee.id,
      },
    })
    expect(created.status).toBe(201)
    expect(created.data.user.mustChangePassword).toBe(true)
    const firstLogin = await t.signIn('new.person@bphs.local', created.data.oneTimePassword)
    expect(firstLogin.status).toBe(200)
    expect(firstLogin.data.user.mustChangePassword).toBe(true)
    expect(JSON.stringify((await t.call('GET', '/api/users', { cookie })).data)).not.toContain(
      created.data.oneTimePassword,
    )
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

    const own = await t.call('PATCH', `/api/users/${t.superUser.id}`, {
      cookie,
      body: { superAdmin: false, access: ADMIN },
    })
    expect(own.status).toBe(409)
    expect(own.data.error).toBe('self_access')
    expect(findUser(t.db, 'p.raghunathan@bphs.local')?.superAdmin).toBe(true)

    // The rest of your own account can still be edited, and sending the access you already have is not a change.
    const renamed = await t.call('PATCH', `/api/users/${t.superUser.id}`, {
      cookie,
      body: { name: 'Priya R.', superAdmin: true },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.data.name).toBe('Priya R.')

    // The other Super Admin can still do it.
    const other = await t.asAdmin()
    const demoted = await t.call('PATCH', `/api/users/${t.superUser.id}`, {
      cookie: other,
      body: { superAdmin: false, access: ADMIN },
    })
    expect(demoted.data).toMatchObject({ superAdmin: false, access: ADMIN })
  })

  // Removing a module leaves its grants in users.access. They must never reach the Users page, whose save would be refused.
  it('keeps a removed module’s grants, but never shows them or lets them block a change', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const stored = { ...ADMIN, removed: 'edit' } as typeof ADMIN
    t.db.update(users).set({ access: stored }).where(eq(users.id, t.adminUser.id)).run()

    const listed = await t.call('GET', '/api/users', { cookie })
    expect(listed.data.find((user: { id: number }) => user.id === t.adminUser.id)?.access).toEqual(ADMIN)
    expect((await t.call('GET', '/api/auth/me', { cookie: await t.asAdmin() })).data.user.access).toEqual(ADMIN)

    const changed = await t.call('PATCH', `/api/users/${t.adminUser.id}`, {
      cookie,
      body: { access: { assets: 'read' } },
    })
    expect(changed.status).toBe(200)
    expect(changed.data.access).toEqual({ assets: 'read' })
    expect(findUser(t.db, 'm.oyelaran@bphs.local')?.access).toEqual({ removed: 'edit', assets: 'read' })
  })

  it('will not deactivate yourself or the last Super Admin, and a lock can be cleared', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    expect((await t.call('POST', `/api/users/${t.superUser.id}/deactivate`, { cookie })).data.error).toBe(
      'self_deactivate',
    )
    for (let i = 0; i < 5; i++) await t.signIn('m.oyelaran@bphs.local', 'wrong')
    const row = (await t.call('GET', '/api/users', { cookie })).data.find(
      (u: { id: number }) => u.id === t.adminUser.id,
    )
    expect(row.state).toBe('locked')
    const cleared = await t.call('POST', `/api/users/${t.adminUser.id}/clear-lock`, { cookie })
    expect(cleared.data.state).toBe('active')
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(200)
    const off = await t.call('POST', `/api/users/${t.adminUser.id}/deactivate`, { cookie })
    expect(off.data.state).toBe('deactivated')
    expect((await t.signIn('m.oyelaran@bphs.local')).status).toBe(401)
  })
})

describe('sign-ins in the audit log, and one account per employee', () => {
  it('records each sign-in, and of the failed attempts only the one that locks the account', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const entries = async (query = '') =>
      (
        (await t.call('GET', `/api/audit${query}`, { cookie })).data.entries as {
          actor: string
          action: string
          entityType: string
          entityId: number | null
          details: string
        }[]
      ).reverse()

    expect(await entries('?action=sign_in')).toEqual([
      expect.objectContaining({
        actor: 'p.raghunathan@bphs.local',
        entityId: t.superUser.id,
        details: 'p.raghunathan@bphs.local · signed in',
      }),
    ])

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
    expect((await entries('?action=lock'))[0]).toMatchObject({ entityType: 'user', entityId: t.adminUser.id })
    expect((await t.call('GET', '/api/audit?action=sign_in_failed', { cookie })).status).toBe(422)

    // A burst of parallel attempts on another account still logs its lock once.
    await Promise.all(Array.from({ length: 10 }, (_, i) => t.signIn('p.raghunathan@bphs.local', `wrong-${i}`)))
    expect(t.db.all(sql`select id from audit_log where action = 'lock'`)).toHaveLength(2)
  })

  it('refuses to link an employee who already has an account', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const refused = {
      status: 409,
      data: {
        error: 'employee_linked',
        message:
          'Priya Raghunathan is already linked to the account p.raghunathan@bphs.local. Link that account to someone else first.',
        details: { field: 'employeeId' },
      },
    }

    expect(
      await t.call('POST', '/api/users', {
        cookie,
        body: {
          name: 'Second Priya',
          email: 'second@bphs.local',
          access: ADMIN,
          superAdmin: false,
          employeeId: t.person.id,
        },
      }),
    ).toMatchObject(refused)
    expect(findUser(t.db, 'second@bphs.local')).toBeUndefined()
    expect(
      await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: t.person.id } }),
    ).toMatchObject(refused)
    // Sending the link an account already has changes nothing and is not refused.
    expect(
      (await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { employeeId: t.person.id } })).status,
    ).toBe(200)

    // Once the first account lets go, the second may take the employee. Nobody changes their own link, so another Super Admin unlinks the first.
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { superAdmin: true } })).status).toBe(
      200,
    )
    const other = await t.asAdmin()
    expect(
      (await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { employeeId: null } })).data
        .employeeId,
    ).toBeNull()
    expect(
      (await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: t.person.id } })).data
        .employeeId,
    ).toBe(t.person.id)
    // The database holds the rule as well.
    expect(() =>
      t.sqlite.prepare('update users set employee_id = ? where id = ?').run(t.person.id, t.superUser.id),
    ).toThrow(/UNIQUE/)
  })

  it('does not link an account to an archived employee', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const gone = (
      await t.call('POST', '/api/employees', { cookie, body: { code: 'E-9', firstName: 'Left', lastName: 'Already' } })
    ).data
    await t.call('POST', `/api/employees/${gone.id}/archive`, { cookie })
    const message = 'That employee is archived. Restore them first, or choose someone else.'
    const linked = await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: gone.id } })
    expect(linked.status).toBe(422)
    expect(linked.data).toMatchObject({ message, details: { field: 'employeeId' } })
    const created = await t.call('POST', '/api/users', {
      cookie,
      body: { name: 'New Person', email: 'new@bphs.local', access: ADMIN, superAdmin: false, employeeId: gone.id },
    })
    expect(created.status).toBe(422)
    // An account already linked keeps working on its other fields after its employee is archived.
    await t.call('POST', `/api/employees/${gone.id}/restore`, { cookie })
    expect(
      (await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { employeeId: gone.id } })).status,
    ).toBe(200)
    await t.call('POST', `/api/employees/${gone.id}/archive`, { cookie })
    expect(
      (
        await t.call('PATCH', `/api/users/${t.adminUser.id}`, {
          cookie,
          body: { name: 'Mo Oyelaran', employeeId: gone.id },
        })
      ).data.name,
    ).toBe('Mo Oyelaran')
  })

  it('links every account to an employee, except the first one made', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const lee = t.db.insert(employees).values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const unlinked = await t.call('POST', '/api/users', {
      cookie,
      body: { name: 'No Link', email: 'nolink@bphs.local', access: ADMIN, superAdmin: false },
    })
    expect(unlinked.status).toBe(422)
    expect(unlinked.data.details.fields).toEqual({ employeeId: 'Choose the employee this account belongs to' })

    const made = (
      await t.call('POST', '/api/users', {
        cookie,
        body: { name: 'Lee Okoro', email: 'l.okoro@bphs.local', access: ADMIN, superAdmin: true, employeeId: lee.id },
      })
    ).data.user
    const unlink = await t.call('PATCH', `/api/users/${made.id}`, { cookie, body: { employeeId: null } })
    expect(unlink.status).toBe(422)
    expect(unlink.data).toMatchObject({
      message: 'Every account must be linked to an employee.',
      details: { field: 'employeeId' },
    })

    // Nobody changes their own link, or they could read a review about themselves.
    const self = await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie, body: { employeeId: null } })
    expect(self.status).toBe(409)
    expect(self.data).toMatchObject({
      error: 'self_link',
      message: 'You cannot change the employee linked to your own account.',
    })

    // The first account may be unlinked by another Super Admin, and linked again.
    await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { superAdmin: true } })
    const other = await t.asAdmin()
    expect(
      (await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { employeeId: null } })).data
        .employeeId,
    ).toBeNull()
    expect(
      (await t.call('PATCH', `/api/users/${t.superUser.id}`, { cookie: other, body: { employeeId: t.person.id } })).data
        .employeeId,
    ).toBe(t.person.id)
  })

  it('on upgrade, leaves a shared employee with one account and says which accounts were unlinked', () => {
    const { sqlite, next } = migratedBefore('0004_')

    sqlite.exec(`
      insert into employees (id, code, first_name, last_name) values (1, 'E-1', 'Sam', 'Shared'), (2, 'E-2', 'Olu', 'Alone');
      insert into users (id, name, email, password_hash, role, employee_id, is_active) values
        (1, 'Old Off', 'off@x.example', 'x', 'admin', 1, 0),
        (2, 'Kept', 'kept@x.example', 'x', 'admin', 1, 1),
        (3, 'Later', 'later@x.example', 'x', 'admin', 1, 1),
        (4, 'Alone', 'alone@x.example', 'x', 'admin', 2, 1),
        (5, 'None', 'none@x.example', 'x', 'admin', null, 1);`)
    next()

    expect(sqlite.prepare('select id, employee_id as e from users order by id').all()).toEqual([
      { id: 1, e: null },
      { id: 2, e: 1 },
      { id: 3, e: null },
      { id: 4, e: 2 },
      { id: 5, e: null },
    ])
    expect(
      sqlite.prepare('select actor, action, entity_id as id, details from audit_log order by entity_id').all(),
    ).toEqual([
      {
        actor: 'migration',
        action: 'update',
        id: 1,
        details:
          'off@x.example · linked employee: E-1 Sam Shared → none (an employee may be linked to one account only)',
      },
      {
        actor: 'migration',
        action: 'update',
        id: 3,
        details:
          'later@x.example · linked employee: E-1 Sam Shared → none (an employee may be linked to one account only)',
      },
    ])
    sqlite.close()
  })
})
