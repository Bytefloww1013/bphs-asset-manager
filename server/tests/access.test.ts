import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { Access } from '../../shared/constants.ts'
import { employees, users } from '../db/schema.ts'
import { setup } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>

/** Signs in a new account with exactly this access. */
async function as(t: T, access: Access) {
  const email = `x${Math.random().toString(36).slice(2)}@bphs.local`
  const user = t.db.insert(users).values({ name: 'Rosa Lindqvist', email, passwordHash: t.superUser.passwordHash, access, mustChangePassword: false }).returning().get()
  return { user, cookie: (await t.signIn(email)).cookie }
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
    const employeeId = (code: string) => t.db.insert(employees).values({ code, firstName: 'Ana', lastName: code }).returning().get().id
    const made = await t.call('POST', '/api/users', { cookie, body: { name: 'Emp Only', email: 'emp@bphs.local', access: { employees: 'edit' }, superAdmin: false, employeeId: employeeId('E-5001') } })
    expect(made.status).toBe(422)
    expect(made.data.details.fields.access).toBe('Give at least Read Only access to Assets, Grievances, Maintenance or Administrative Reviews, or make the account a Super Admin.')
    expect((await t.call('POST', '/api/users', { cookie, body: { name: 'Boss', email: 'boss@bphs.local', access: {}, superAdmin: true, employeeId: employeeId('E-5002') } })).status).toBe(201)
    expect((await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { access: { employees: 'full' } } })).status).toBe(422)
    const lowered = await t.call('PATCH', `/api/users/${t.adminUser.id}`, { cookie, body: { access: { maintenance: 'read' } } })
    expect(lowered.data).toMatchObject({ access: { maintenance: 'read' }, superAdmin: false })
  })

  it('on upgrade, gives each role the access it had', () => {
    const folder = path.join(import.meta.dirname, '../db/migrations')
    const statements = (file: string) => fs.readFileSync(path.join(folder, file), 'utf8').split('--> statement-breakpoint')
    const files = fs.readdirSync(folder).filter((file) => file.endsWith('.sql')).sort()
    const target = files.findIndex((file) => file.startsWith('0014_'))
    const sqlite = new Database(':memory:')
    for (const file of files.slice(0, target)) for (const statement of statements(file)) sqlite.exec(statement)

    sqlite.exec(`
      insert into users (id, name, email, password_hash, role) values
        (1, 'S', 's@x.example', 'x', 'super_admin'),
        (2, 'A', 'a@x.example', 'x', 'admin'),
        (3, 'AA', 'aa@x.example', 'x', 'asset_admin'),
        (4, 'GA', 'ga@x.example', 'x', 'grievance_admin');`)
    for (const statement of statements(files[target]!)) sqlite.exec(statement)

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
