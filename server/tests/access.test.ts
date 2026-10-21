import { describe, expect, it } from 'vitest'
import type { Access } from '../../shared/constants.ts'
import { employees, users } from '../db/schema.ts'
import { ASSET_ADMIN, GRIEVANCE_ADMIN, migratedBefore, setup } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>

/** Signs in a new account with exactly this access. */
async function as(t: T, access: Access, employeeId: number | null = null) {
  const email = `x${Math.random().toString(36).slice(2)}@bphs.local`
  const user = t.db.insert(users).values({ name: 'Rosa Lindqvist', email, passwordHash: t.superUser.passwordHash, access, employeeId, mustChangePassword: false }).returning().get()
  return { user, cookie: (await t.signIn(email)).cookie }
}

const employeeId = (t: T, code: string) => t.db.insert(employees).values({ code, firstName: 'Ana', lastName: code }).returning().get().id
const status = async (t: T, cookie: string, method: string, path: string, body?: unknown) => (await t.call(method, path, { cookie, body })).status

/** Priya (Super Admin) owns an open grievance; an Asset Admin and a Grievance Admin are signed in beside her. */
async function workspaces() {
  const t = await setup()
  const person = (code: string, firstName: string) => t.db.insert(employees).values({ code, firstName, lastName: 'Tester' }).returning().get()
  const [named, manager, assetPerson, grievancePerson] = [person('E-3001', 'Named'), person('E-3002', 'Manager'), person('E-3003', 'Asset'), person('E-3004', 'Grievance')]
  const superAdmin = await t.asSuper()
  const body = { title: 'A title', shortDescription: 'What it is about.', body: '<p>Body</p>', dateMade: '2026-10-01', ownerId: t.person.id, categoryId: 1, employeeIds: [named.id], managementIds: [manager.id] }
  expect((await t.call('POST', '/api/grievances', { cookie: superAdmin, body })).status).toBe(201)
  return {
    t,
    superAdmin,
    assetAdmin: (await as(t, ASSET_ADMIN, assetPerson.id)).cookie,
    grievanceAdmin: (await as(t, GRIEVANCE_ADMIN, grievancePerson.id)).cookie,
    assetPerson,
    grievancePerson,
  }
}

describe('section access', () => {
  it('lets Read see a section and asks for Edit to change anything in it', async () => {
    const t = await setup()
    const { cookie } = await as(t, { assets: 'read', grievances: 'read', maintenance: 'read', employees: 'read' })
    for (const [label, url] of [['Assets', '/api/assets'], ['Grievances', '/api/grievances'], ['Maintenance', '/api/maintenance'], ['Employees', '/api/employees']]) {
      expect((await t.call('GET', url!, { cookie })).status, url).toBe(200)
      const write = await t.call('POST', url!, { cookie, body: {} })
      expect(write.status, url).toBe(403)
      expect(write.data.message).toBe(`You need Edit access to ${label} for this.`)
    }
    // Edit gets past the gate to the form's own checks.
    const editor = await as(t, { assets: 'edit', maintenance: 'edit' })
    expect((await t.call('POST', '/api/assets', { cookie: editor.cookie, body: {} })).status).toBe(422)
    expect((await t.call('POST', '/api/maintenance', { cookie: editor.cookie, body: {} })).status).toBe(422)
  })

  it('shuts a section that is not given, but leaves the employee list open to every picker', async () => {
    const t = await setup()
    const { cookie } = await as(t, { maintenance: 'read' })
    const assets = await t.call('GET', '/api/assets', { cookie })
    expect(assets.status).toBe(403)
    expect(assets.data.message).toBe('Your account does not have access to Assets.')
    expect((await t.call('GET', '/api/grievances', { cookie })).status).toBe(403)
    expect((await t.call('GET', '/api/maintenance', { cookie: (await as(t, { assets: 'edit' })).cookie })).status).toBe(403)
    expect((await t.call('GET', '/api/employees', { cookie })).status).toBe(200)
    expect((await t.call('POST', '/api/employees', { cookie, body: {} })).status).toBe(403)
    expect((await t.call('GET', '/api/users', { cookie })).status).toBe(403)
  })

  it('asks for Full to delete or archive, and Full is enough', async () => {
    const t = await setup()
    const sup = await t.asSuper()
    const { assetTypes, conditionRatings } = await t.lookups(sup)
    const asset = (await t.call('POST', '/api/assets', { cookie: sup, body: { tag: 'BP-9001', typeId: assetTypes[0]!.id, conditionRatingId: conditionRatings[0]!.id } })).data
    const lee = t.db.insert(employees).values({ code: 'E-3001', firstName: 'Lee', lastName: 'Okoro' }).returning().get()
    const { user, cookie } = await as(t, { assets: 'edit', employees: 'edit' })

    const del = await t.call('DELETE', `/api/assets/${asset.id}`, { cookie })
    expect(del.status).toBe(403)
    expect(del.data.message).toBe('You need Full access to Assets for this.')
    const archive = await t.call('POST', `/api/employees/${lee.id}/archive`, { cookie })
    expect(archive.status).toBe(403)
    expect(archive.data.message).toBe('You need Full access to Employees for this.')

    // A change of access applies on the next request.
    t.sqlite.prepare(`update users set access = '{"assets":"full","employees":"full"}' where id = ?`).run(user.id)
    expect((await t.call('DELETE', `/api/assets/${asset.id}`, { cookie })).status).toBe(204)
    expect((await t.call('POST', `/api/employees/${lee.id}/archive`, { cookie })).data.state).toBe('archived')
  })

  it('lets an importer run with Edit in the section it writes to', async () => {
    const t = await setup()
    const employeesOnly = await as(t, { assets: 'read', employees: 'edit' })
    const assetsOnly = await as(t, { assets: 'edit' })
    const people = { rows: [{ row: 2, values: { code: 'E-4000', firstName: 'Ana', lastName: 'Cole' } }] }
    const programs = { rows: [{ row: 2, values: { code: 'PRG-1', name: 'Riverside' } }] }

    expect((await t.call('POST', '/api/import/employees/preview', { cookie: employeesOnly.cookie, body: people })).status).toBe(200)
    const noPrograms = await t.call('POST', '/api/import/programs', { cookie: employeesOnly.cookie, body: programs })
    expect(noPrograms.status).toBe(403)
    expect(noPrograms.data.message).toBe('You need Edit access to Assets for this.')
    expect((await t.call('POST', '/api/import/programs/preview', { cookie: assetsOnly.cookie, body: programs })).status).toBe(200)
    const noPeople = await t.call('POST', '/api/import/employees', { cookie: assetsOnly.cookie, body: people })
    expect(noPeople.status).toBe(403)
    expect(noPeople.data.message).toBe('You need Edit access to Employees for this.')
  })

  it('gives every account somewhere to land: at least Read in a workspace, or Super Admin', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const made = await t.call('POST', '/api/users', { cookie, body: { name: 'Emp Only', email: 'emp@bphs.local', access: { employees: 'edit' }, superAdmin: false, employeeId: employeeId(t, 'E-5001') } })
    expect(made.status).toBe(422)
    expect(made.data.details.fields.access).toBe('Give at least Read Only access to Assets, Grievances, Maintenance, Administrative Reviews or Employee Tasks, or make the account a Super Admin.')
    expect((await t.call('POST', '/api/users', { cookie, body: { name: 'Boss', email: 'boss@bphs.local', access: {}, superAdmin: true, employeeId: employeeId(t, 'E-5002') } })).status).toBe(201)
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { access: { employees: 'full' } } })).status).toBe(422)
    const lowered = await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { access: { maintenance: 'read' } } })
    expect(lowered.data).toMatchObject({ access: { maintenance: 'read' }, superAdmin: false })
  })

  it('takes Assign in Employee Tasks only', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const make = (email: string, access: Access, code: string) => t.call('POST', '/api/users', { cookie, body: { name: email, email, access, superAdmin: false, employeeId: employeeId(t, code) } })
    expect((await make('a@bphs.local', { assets: 'assign' } as unknown as Access, 'E-5101')).status).toBe(422)
    expect((await make('b@bphs.local', { tasks: 'assign' }, 'E-5102')).status).toBe(201)
  })

  it('on upgrade, gives each role the access it had', () => {
    const { sqlite, next } = migratedBefore('0014_')
    sqlite.exec(`
      insert into users (id, name, email, password_hash, role) values
        (1, 'S', 's@x.example', 'x', 'super_admin'),
        (2, 'A', 'a@x.example', 'x', 'admin'),
        (3, 'AA', 'aa@x.example', 'x', 'asset_admin'),
        (4, 'GA', 'ga@x.example', 'x', 'grievance_admin');`)
    next()

    expect(sqlite.prepare('select id, access, is_super_admin as superAdmin from users order by id').all()).toEqual([
      { id: 1, access: '{"assets":"full","grievances":"full","maintenance":"full","employees":"full"}', superAdmin: 1 },
      { id: 2, access: '{"assets":"edit","grievances":"edit","employees":"edit"}', superAdmin: 0 },
      { id: 3, access: '{"assets":"edit","employees":"edit"}', superAdmin: 0 },
      { id: 4, access: '{"grievances":"edit","employees":"edit"}', superAdmin: 0 },
    ])
    expect(sqlite.prepare("select count(*) as n from pragma_table_info('users') where name = 'role'").get()).toEqual({ n: 0 })
    sqlite.close()
  })
})

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

  it('opens Reviews with Read, and to no account that is not linked to an employee but the first', async () => {
    const { t, superAdmin, assetAdmin } = await workspaces()
    expect(await status(t, assetAdmin, 'GET', '/api/reviews')).toBe(403)
    expect(await status(t, (await as(t, { reviews: 'read' }, employeeId(t, 'E-3005'))).cookie, 'GET', '/api/reviews')).toBe(200)
    expect(await status(t, (await as(t, { reviews: 'full' })).cookie, 'GET', '/api/reviews')).toBe(403)
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
