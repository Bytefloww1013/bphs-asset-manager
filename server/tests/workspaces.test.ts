import { describe, expect, it } from 'vitest'
import type { Access } from '../../shared/constants.ts'
import { employees, users } from '../db/schema.ts'
import { ASSET_ADMIN, GRIEVANCE_ADMIN, setup } from './helpers.ts'

/** Priya (Super Admin) owns an open grievance; an Asset Admin and a Grievance Admin are signed in beside her. */
async function workspaces() {
  const t = await setup()
  const person = (code: string, firstName: string) => t.db.insert(employees).values({ code, firstName, lastName: 'Tester' }).returning().get()
  const account = async (email: string, access: Access, employeeId: number | null = null) => {
    t.db.insert(users).values({ name: email, email, passwordHash: t.superUser.passwordHash, access, employeeId, mustChangePassword: false }).run()
    return (await t.signIn(email)).cookie
  }
  const [named, manager, assetPerson, grievancePerson] = [person('E-3001', 'Named'), person('E-3002', 'Manager'), person('E-3003', 'Asset'), person('E-3004', 'Grievance')]
  const superAdmin = await t.asSuper()
  const body = { title: 'A title', shortDescription: 'What it is about.', body: '<p>Body</p>', dateMade: '2026-10-01', ownerId: t.person.id, categoryId: 1, employeeIds: [named.id], managementIds: [manager.id] }
  expect((await t.call('POST', '/api/grievances', { cookie: superAdmin, body })).status).toBe(201)
  return {
    t,
    superAdmin,
    assetAdmin: await account('assets@bphs.local', ASSET_ADMIN, assetPerson.id),
    grievanceAdmin: await account('grievances@bphs.local', GRIEVANCE_ADMIN, grievancePerson.id),
    assetPerson,
    grievancePerson,
    account,
  }
}

const status = async (t: Awaited<ReturnType<typeof setup>>, cookie: string, method: string, path: string, body?: unknown) => (await t.call(method, path, { cookie, body })).status

describe('workspace access', () => {
  it('keeps an Asset Admin out of Grievances, and a Grievance Admin out of Assets', async () => {
    const { t, assetAdmin, grievanceAdmin } = await workspaces()
    for (const path of ['/api/grievances', '/api/grievances/account-holders', '/api/grievances/categories', '/api/grievances/audit']) {
      expect(await status(t, assetAdmin, 'GET', path)).toBe(403)
      expect(await status(t, grievanceAdmin, 'GET', path)).toBe(200)
    }
    expect(await status(t, assetAdmin, 'POST', '/api/grievances/categories', { name: 'Pay' })).toBe(403)
    for (const path of ['/api/assets', '/api/lookups', '/api/dashboard', '/api/audit', '/api/digital-assets', '/api/programs', '/api/asset-types']) {
      expect(await status(t, grievanceAdmin, 'GET', path)).toBe(403)
      expect(await status(t, assetAdmin, 'GET', path)).toBe(200)
    }
    expect(await status(t, grievanceAdmin, 'POST', '/api/assets', { tag: 'LT-1' })).toBe(403)
    // Accounts stay a Super Admin's.
    for (const cookie of [assetAdmin, grievanceAdmin]) expect(await status(t, cookie, 'GET', '/api/users')).toBe(403)
  })

  it('keeps everyone but a Super Admin out of Maintenance', async () => {
    const { t, superAdmin, assetAdmin, grievanceAdmin } = await workspaces()
    expect(await status(t, superAdmin, 'GET', '/api/maintenance')).toBe(200)
    for (const cookie of [assetAdmin, grievanceAdmin, await t.asAdmin()]) {
      expect(await status(t, cookie, 'GET', '/api/maintenance')).toBe(403)
      expect(await status(t, cookie, 'POST', '/api/maintenance', { firstName: 'A', location: 'B', description: 'C' })).toBe(403)
    }
  })

  it('opens Reviews with Read, and to no account that is not linked to an employee but the first', async () => {
    const { t, superAdmin, assetAdmin, account } = await workspaces()
    expect(await status(t, assetAdmin, 'GET', '/api/reviews')).toBe(403)
    const reader = t.db.insert(employees).values({ code: 'E-3005', firstName: 'Reader', lastName: 'Tester' }).returning().get()
    expect(await status(t, await account('reader@bphs.local', { reviews: 'read' }, reader.id), 'GET', '/api/reviews')).toBe(200)
    expect(await status(t, await account('nobody@bphs.local', { reviews: 'full' }), 'GET', '/api/reviews')).toBe(403)
    t.sqlite.prepare('update users set employee_id = null where id = ?').run(t.superUser.id)
    expect(await status(t, superAdmin, 'GET', '/api/reviews')).toBe(200)
  })

  it('shows both the employees, each with only the counts of their own workspace', async () => {
    const { t, superAdmin, assetAdmin, grievanceAdmin } = await workspaces()
    const priya = async (cookie: string) => ((await t.call('GET', '/api/employees', { cookie })).data as { id: number }[]).find((row) => row.id === t.person.id)
    expect(await priya(superAdmin)).toMatchObject({ openGrievancesOwned: 1, deleteBlocked: expect.any(String) })
    // Why delete is refused can name another workspace, so someone who cannot see them all is told less.
    const hidden = 'Has records you cannot see. Archive instead; history is never deleted.'
    expect(await priya(assetAdmin)).toMatchObject({ openGrievancesOwned: 0, deleteBlocked: hidden })
    expect(await priya(grievanceAdmin)).toMatchObject({ openGrievancesOwned: 1, assetsHeld: 0, digitalHeld: 0, hasHistory: false, deleteBlocked: hidden })
    for (const [cookie, code] of [[assetAdmin, 'E-4001'], [grievanceAdmin, 'E-4002']] as const) {
      const made = await t.call('POST', '/api/employees', { cookie, body: { code, firstName: 'New', lastName: 'Starter' } })
      expect(made.status).toBe(201)
      expect((await t.call('PATCH', `/api/employees/${made.data.id}`, { cookie, body: { jobTitle: 'Clerk' } })).status).toBe(200)
    }
  })

  it('counts only accounts that work in Grievances as able to own a grievance', async () => {
    const { t, superAdmin, grievanceAdmin, assetPerson, grievancePerson } = await workspaces()
    expect((await t.call('GET', '/api/grievances/account-holders', { cookie: grievanceAdmin })).data).toEqual([t.person.id, grievancePerson.id])
    const code = ((await t.call('GET', '/api/grievances', { cookie: superAdmin })).data as { rows: { code: string }[] }).rows[0]!.code
    for (const [person, hasAccount] of [[assetPerson, false], [grievancePerson, true]] as const) {
      expect((await t.call('POST', `/api/grievances/${code}/owner`, { cookie: superAdmin, body: { ownerId: person.id, note: 'Handing over.' } })).status).toBe(200)
      expect((await t.call('GET', `/api/grievances/${code}`, { cookie: grievanceAdmin })).data.ownerHasAccount).toBe(hasAccount)
    }
  })
})
