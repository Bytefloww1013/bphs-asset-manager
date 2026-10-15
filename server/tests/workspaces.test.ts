import { describe, expect, it } from 'vitest'
import type { Role } from '../../shared/constants.ts'
import { employees, users } from '../db/schema.ts'
import { setup } from './helpers.ts'

/** Priya (Super Admin) owns an open grievance; an Asset Admin and a Grievance Admin are signed in beside her. */
async function workspaces() {
  const t = await setup()
  const person = (code: string, firstName: string) => t.db.insert(employees).values({ code, firstName, lastName: 'Tester' }).returning().get()
  const account = async (email: string, role: Role, employeeId: number | null = null) => {
    t.db.insert(users).values({ name: email, email, passwordHash: t.superUser.passwordHash, role, employeeId, mustChangePassword: false }).run()
    return (await t.signIn(email)).cookie
  }
  const [named, manager, assetPerson, grievancePerson] = [person('E-3001', 'Named'), person('E-3002', 'Manager'), person('E-3003', 'Asset'), person('E-3004', 'Grievance')]
  const superAdmin = await t.asSuper()
  const body = { title: 'A title', shortDescription: 'What it is about.', body: '<p>Body</p>', dateMade: '2026-10-01', ownerId: t.person.id, categoryId: 1, employeeIds: [named.id], managementIds: [manager.id] }
  expect((await t.call('POST', '/api/grievances', { cookie: superAdmin, body })).status).toBe(201)
  return {
    t,
    superAdmin,
    assetAdmin: await account('assets@bphs.local', 'asset_admin', assetPerson.id),
    grievanceAdmin: await account('grievances@bphs.local', 'grievance_admin', grievancePerson.id),
    assetPerson,
    grievancePerson,
  }
}

const status = async (t: Awaited<ReturnType<typeof setup>>, cookie: string, method: string, path: string, body?: unknown) => (await t.call(method, path, { cookie, body })).status

describe('workspace roles', () => {
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

  it('shows both the employees, each with only the counts of their own workspace', async () => {
    const { t, superAdmin, assetAdmin, grievanceAdmin } = await workspaces()
    const priya = async (cookie: string) => ((await t.call('GET', '/api/employees', { cookie })).data as { id: number }[]).find((row) => row.id === t.person.id)
    expect(await priya(superAdmin)).toMatchObject({ openGrievancesOwned: 1, deleteBlocked: expect.any(String) })
    expect(await priya(assetAdmin)).toMatchObject({ openGrievancesOwned: 0, deleteBlocked: null })
    expect(await priya(grievanceAdmin)).toMatchObject({ openGrievancesOwned: 1, assetsHeld: 0, digitalHeld: 0, hasHistory: false, deleteBlocked: null })
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
