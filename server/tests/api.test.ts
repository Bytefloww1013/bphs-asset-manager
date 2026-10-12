import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { sessions, users } from '../db/schema.ts'
import { login } from '../services/auth.ts'
import { PASSWORD, findUser, setup } from './helpers.ts'

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
    expect(late.data.details.returnedBy).toBe('m.oyelaran')
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
  it('protects types in use, and keeps the rating order the user sets', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(cookie)
    await t.call('POST', '/api/assets', { cookie, body: { tag: 'X-1', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id } })
    const refused = await t.call('DELETE', `/api/asset-types/${assetTypes[0]!.id}`, { cookie })
    expect(refused.status).toBe(409)
    expect((await t.call('DELETE', `/api/asset-types/${assetTypes[1]!.id}`, { cookie })).status).toBe(204)
    expect((await t.call('POST', '/api/asset-types', { cookie, body: { name: assetTypes[0]!.name.toUpperCase() } })).status).toBe(409)

    const ids = conditionRatings.map((r) => r.id).reverse()
    const order = await t.call('PUT', '/api/condition-ratings/order', { cookie, body: { ids } })
    expect(order.data.map((r: { id: number }) => r.id)).toEqual(ids)
    expect((await t.lookups(cookie)).conditionRatings.map((r) => r.id)).toEqual(ids)
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
    const csv = await t.app.request('/api/audit.csv', { headers: { cookie } })
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/)
    expect(await csv.text()).toContain('assettype')
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
