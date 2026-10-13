import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { nextGrievanceCode } from '../services/grievances.ts'
import { setup } from './helpers.ts'

describe('the grievances workspace', () => {
  it('answers 401 to a signed-out request and an empty list to either role', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/grievances')).status).toBe(401)
    for (const cookie of [await t.asAdmin(), await t.asSuper()]) {
      const res = await t.call('GET', '/api/grievances', { cookie })
      expect(res.status).toBe(200)
      expect(res.data).toEqual([])
    }
  })
})

describe('the grievance audit log', () => {
  const actor = (t: Awaited<ReturnType<typeof setup>>) => ({ ...t.adminUser, employeeId: t.adminUser.employeeId ?? null })

  it('takes an entry of its own and leaves the audit log alone', async () => {
    const t = await setup()
    const before = t.sqlite.prepare('select count(*) as n from audit_log').get()
    t.db.transaction((tx) => writeGrievanceAudit(tx, actor(t), { action: 'create', entityType: 'grievance', entityId: 1, details: 'GR-2026-0001 · A title' }))
    expect(t.sqlite.prepare('select user_id, actor, action, entity_type, entity_id, details from grievance_audit_log').all()).toEqual([
      { user_id: t.adminUser.id, actor: 'm.oyelaran@bphs.local', action: 'create', entity_type: 'grievance', entity_id: 1, details: 'GR-2026-0001 · A title' },
    ])
    expect(t.sqlite.prepare('select count(*) as n from audit_log').get()).toEqual(before)
  })

  it('is append-only', async () => {
    const t = await setup()
    writeGrievanceAudit(t.db, actor(t), { action: 'create', entityType: 'grievance', entityId: 1 })
    expect(() => t.sqlite.prepare("update grievance_audit_log set details = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('update grievance_audit_log set id = 99').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from grievance_audit_log').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare("insert or replace into grievance_audit_log (id, occurred_at, actor, action, entity_type) values (1, 0, 'x', 'create', 'grievance')").run()).toThrow(/append-only/)
    // Deleting the account clears the link and keeps the entry and the name on it.
    t.sqlite.prepare('delete from sessions where user_id = ?').run(t.adminUser.id)
    t.sqlite.prepare('delete from users where id = ?').run(t.adminUser.id)
    expect(t.sqlite.prepare('select user_id, actor from grievance_audit_log').all()).toEqual([{ user_id: null, actor: 'm.oyelaran@bphs.local' }])
  })

  // The two logs are kept apart in the source as well: grievance code never writes to the Audit Log, and nothing else writes to this one.
  it('is written by grievance code only, which never writes to the audit log', () => {
    const server = path.resolve(import.meta.dirname, '..')
    const sources = (fs.readdirSync(server, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('tests' + path.sep))
      .map((file) => ({ file: file.split(path.sep).join('/'), text: fs.readFileSync(path.join(server, file), 'utf8') }))
    const isGrievance = (file: string) => path.basename(file).startsWith('grievance')
    expect(sources.filter((s) => isGrievance(s.file)).map((s) => s.file)).toContain('lib/grievance-audit.ts')
    expect(sources.filter((s) => isGrievance(s.file) && /\bwriteAudit\b|\bauditLog\b/.test(s.text)).map((s) => s.file)).toEqual([])
    expect(sources.filter((s) => !isGrievance(s.file) && s.file !== 'db/schema.ts' && /\bwriteGrievanceAudit\b|\bgrievanceAuditLog\b/.test(s.text)).map((s) => s.file)).toEqual([])
  })
})

describe('grievance categories', () => {
  const names = (rows: { name: string }[]) => rows.map((row) => row.name)

  it('start with the six from the migration, all active and unused', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/grievances/categories')).status).toBe(401)
    const res = await t.call('GET', '/api/grievances/categories', { cookie: await t.asAdmin() })
    expect(names(res.data)).toEqual(['Conduct', 'Discrimination or harassment', 'Health and safety', 'Other', 'Pay and hours', 'Working conditions'])
    expect(res.data.every((row: any) => row.isActive && row.grievanceCount === 0)).toBe(true)
  })

  it('can be added, renamed and deactivated by an admin, with each change in the grievance audit log only', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const before = t.sqlite.prepare('select count(*) as n from audit_log').get()

    const added = await t.call('POST', '/api/grievances/categories', { cookie, body: { name: 'Scheduling' } })
    expect(added.status).toBe(201)
    const id = added.data.id
    expect((await t.call('POST', '/api/grievances/categories', { cookie, body: { name: 'scheduling' } })).data.error).toBe('duplicate_name')
    expect((await t.call('POST', '/api/grievances/categories', { cookie, body: { name: ' ' } })).status).toBe(422)

    expect((await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { name: 'Conduct' } })).data.error).toBe('duplicate_name')
    expect((await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { name: 'Rotas' } })).data.name).toBe('Rotas')
    expect((await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { isActive: false } })).data.isActive).toBe(false)
    // Saving what is already there changes nothing and logs nothing.
    expect((await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { name: 'Rotas', isActive: false } })).status).toBe(200)
    expect((await t.call('PATCH', '/api/grievances/categories/9999', { cookie, body: { name: 'Nope' } })).status).toBe(404)

    expect(t.sqlite.prepare('select actor, action, entity_type, entity_id, details from grievance_audit_log order by id').all()).toEqual([
      { actor: 'm.oyelaran@bphs.local', action: 'create', entity_type: 'category', entity_id: id, details: 'Scheduling' },
      { actor: 'm.oyelaran@bphs.local', action: 'update', entity_type: 'category', entity_id: id, details: 'Rotas · name: Scheduling → Rotas' },
      { actor: 'm.oyelaran@bphs.local', action: 'update', entity_type: 'category', entity_id: id, details: 'Rotas · active: true → false' },
    ])
    expect(t.sqlite.prepare('select count(*) as n from audit_log').get()).toEqual(before)
  })

  it('can be deleted by a super admin only, and only when unused', async () => {
    const t = await setup()
    const [admin, superAdmin] = [await t.asAdmin(), await t.asSuper()]
    const rows = (await t.call('GET', '/api/grievances/categories', { cookie: admin })).data as { id: number; name: string }[]
    const conduct = rows.find((row) => row.name === 'Conduct')!
    const other = rows.find((row) => row.name === 'Other')!

    expect((await t.call('DELETE', `/api/grievances/categories/${other.id}`, { cookie: admin })).status).toBe(403)

    t.sqlite
      .prepare("insert into grievances (code, year, seq, title, short_description, body_html, body_text, date_made, owner_id, category_id, last_activity_at) values ('GR-2026-0001', 2026, 1, 'A title', 'Short', '<p>Body</p>', 'Body', '2026-10-12', ?, ?, 0)")
      .run(t.person.id, conduct.id)
    const inUse = await t.call('DELETE', `/api/grievances/categories/${conduct.id}`, { cookie: superAdmin })
    expect(inUse.status).toBe(409)
    expect(inUse.data.error).toBe('in_use')
    expect((await t.call('GET', '/api/grievances/categories', { cookie: admin })).data.find((row: any) => row.id === conduct.id).grievanceCount).toBe(1)

    expect((await t.call('DELETE', `/api/grievances/categories/${other.id}`, { cookie: superAdmin })).status).toBe(204)
    expect(t.sqlite.prepare("select action, entity_type, entity_id, details from grievance_audit_log where action = 'delete'").all()).toEqual([
      { action: 'delete', entity_type: 'category', entity_id: other.id, details: 'unused category "Other"' },
    ])
  })

  it('always keep one active', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const rows = (await t.call('GET', '/api/grievances/categories', { cookie })).data as { id: number }[]
    for (const row of rows.slice(1)) expect((await t.call('PATCH', `/api/grievances/categories/${row.id}`, { cookie, body: { isActive: false } })).status).toBe(200)
    const last = rows[0]!
    expect((await t.call('PATCH', `/api/grievances/categories/${last.id}`, { cookie, body: { isActive: false } })).data.error).toBe('last_active')
    expect((await t.call('DELETE', `/api/grievances/categories/${last.id}`, { cookie })).data.error).toBe('last_active')
  })
})

describe('grievance tables and IDs', () => {
  const insert = (t: Awaited<ReturnType<typeof setup>>, values: Record<string, unknown> = {}) => {
    const row = { code: 'GR-2026-0001', year: 2026, seq: 1, title: 'A title', short_description: 'Short', body_html: '<p>Body</p>', body_text: 'Body', date_made: '2026-10-12', owner_id: t.person.id, category_id: 1, last_activity_at: 0, ...values }
    const keys = Object.keys(row)
    return t.sqlite.prepare(`insert into grievances (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`).run(...(Object.values(row) as (string | number)[]))
  }

  it('number grievances within the year they were entered in', async () => {
    const t = await setup()
    expect(nextGrievanceCode(t.db, new Date(2026, 9, 12))).toEqual({ code: 'GR-2026-0001', year: 2026, seq: 1 })
    insert(t)
    insert(t, { code: 'GR-2026-0007', seq: 7 })
    expect(nextGrievanceCode(t.db, new Date(2026, 11, 31))).toEqual({ code: 'GR-2026-0008', year: 2026, seq: 8 })
    expect(nextGrievanceCode(t.db, new Date(2027, 0, 1))).toEqual({ code: 'GR-2027-0001', year: 2027, seq: 1 })
  })

  it('start a grievance open at version 1 and refuse a repeated ID, an unknown status or a person named twice in one role', async () => {
    const t = await setup()
    const id = Number(insert(t).lastInsertRowid)
    expect(t.sqlite.prepare('select status, version from grievances').get()).toEqual({ status: 'open', version: 1 })
    expect(() => insert(t, { code: 'GR-2026-0002' })).toThrow(/UNIQUE/)
    expect(() => insert(t, { seq: 2 })).toThrow(/UNIQUE/)
    expect(() => insert(t, { code: 'GR-2026-0002', seq: 2, status: 'pending' })).toThrow(/CHECK/)

    const name = t.sqlite.prepare('insert into grievance_people (grievance_id, employee_id, role) values (?, ?, ?)')
    name.run(id, t.person.id, 'employee')
    name.run(id, t.person.id, 'management')
    expect(() => name.run(id, t.person.id, 'employee')).toThrow(/UNIQUE/)
    expect(() => name.run(id, t.person.id, 'witness')).toThrow(/CHECK/)
  })
})
