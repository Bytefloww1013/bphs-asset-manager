import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { localToday } from '../../shared/schemas.ts'
import { employees } from '../db/schema.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { nextGrievanceCode } from '../services/grievances.ts'
import { setup } from './helpers.ts'

describe('the grievances workspace', () => {
  it('answers 401 to a signed-out request and an empty list to either role while there are none', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/grievances')).status).toBe(401)
    for (const cookie of [await t.asAdmin(), await t.asSuper()]) {
      const res = await t.call('GET', '/api/grievances', { cookie })
      expect(res.status).toBe(200)
      expect(res.data).toEqual({ rows: [], owners: [], counts: { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, voided: 0 } })
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

type T = Awaited<ReturnType<typeof setup>>

/** Three more employees beside the one every test database starts with, and a body that passes every rule. */
function grievanceFixture(t: T) {
  const add = (code: string, firstName: string, lastName: string) => t.db.insert(employees).values({ code, firstName, lastName }).returning().get()
  const [dana, femi, ines] = [add('E-2001', 'Dana', 'Whitlock'), add('E-2002', 'Femi', 'Adeyemi'), add('E-2003', 'Ines', 'Carvalho')]
  const body = {
    title: 'Shift swaps refused without a reason',
    shortDescription: 'Three swap requests were turned down in September with no explanation.',
    body: '<h2>What happened</h2><p>Requests were <strong>refused</strong> on <em>three</em> dates.</p><ul><li><p>2 September</p></li></ul>',
    dateMade: '2026-10-01',
    ownerId: t.person.id,
    categoryId: 1,
    employeeIds: [dana.id],
    managementIds: [femi.id],
  }
  return { dana, femi, ines, body }
}

describe('creating a grievance', () => {
  it('is open to either role, numbers each one, and gives the body back with its formatting', async () => {
    const t = await setup()
    const { dana, femi, body } = grievanceFixture(t)
    expect((await t.call('POST', '/api/grievances', { body })).status).toBe(401)
    const [admin, superAdmin] = [await t.asAdmin(), await t.asSuper()]
    const before = t.sqlite.prepare('select count(*) as n from audit_log').get()

    const first = await t.call('POST', '/api/grievances', { cookie: admin, body })
    expect(first.status).toBe(201)
    const year = new Date().getFullYear()
    expect(first.data).toMatchObject({
      code: `GR-${year}-0001`,
      title: body.title,
      shortDescription: body.shortDescription,
      bodyHtml: body.body,
      dateMade: '2026-10-01',
      status: 'open',
      version: 1,
      category: { id: 1 },
      owner: { id: t.person.id, code: 'E-1042', name: 'Priya Raghunathan', archived: false },
      employees: [{ id: dana.id, code: 'E-2001', name: 'Dana Whitlock', archived: false }],
      management: [{ id: femi.id, code: 'E-2002', name: 'Femi Adeyemi', archived: false }],
      recordedBy: 'Marcus Oyelaran',
    })
    expect(first.data.createdAt).toBe(first.data.lastActivityAt)

    const second = await t.call('POST', '/api/grievances', { cookie: superAdmin, body: { ...body, title: 'A second one' } })
    expect(second.data).toMatchObject({ code: `GR-${year}-0002`, recordedBy: 'Priya Raghunathan' })

    expect(t.sqlite.prepare('select body_text from grievances where id = ?').get(first.data.id)).toEqual({ body_text: 'What happened\nRequests were refused on three dates.\n2 September' })
    expect(t.sqlite.prepare('select actor, action, entity_type, entity_id, details from grievance_audit_log order by id').all()).toEqual([
      { actor: 'm.oyelaran@bphs.local', action: 'create', entity_type: 'grievance', entity_id: first.data.id, details: `GR-${year}-0001 · ${body.title}` },
      { actor: 'p.raghunathan@bphs.local', action: 'create', entity_type: 'grievance', entity_id: second.data.id, details: `GR-${year}-0002 · A second one` },
    ])
    expect(t.sqlite.prepare('select count(*) as n from audit_log').get()).toEqual(before)
  })

  it('stores a sanitised body, whatever it was sent', async () => {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const res = await t.call('POST', '/api/grievances', {
      cookie: await t.asAdmin(),
      body: { ...body, body: '<p onclick="steal()" style="color:red">Said <a href="javascript:alert(1)">this</a>.</p><script>alert(1)</script><img src="x">' },
    })
    expect(res.status).toBe(201)
    expect(res.data.bodyHtml).toBe('<p>Said this.</p>')
  })

  it('names a person once however often they are sent', async () => {
    const t = await setup()
    const { dana, femi, body } = grievanceFixture(t)
    const res = await t.call('POST', '/api/grievances', { cookie: await t.asAdmin(), body: { ...body, employeeIds: [dana.id, dana.id], managementIds: [femi.id, femi.id] } })
    expect(res.status).toBe(201)
    expect(res.data.employees).toHaveLength(1)
    expect(res.data.management).toHaveLength(1)
  })

  it('refuses a grievance that breaks a rule, saying which field', async () => {
    const t = await setup()
    const { dana, femi, ines, body } = grievanceFixture(t)
    const cookie = await t.asAdmin()
    t.sqlite.prepare('update employees set archived_at = 1 where id = ?').run(ines.id)
    t.sqlite.prepare("insert into grievance_categories (id, name, is_active) values (90, 'Retired', 0)").run()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const cases: [string, Record<string, unknown>, string, number?][] = [
      ['no title', { title: '  ' }, 'title'],
      ['a title over 150 characters', { title: 'x'.repeat(151) }, 'title'],
      ['no short description', { shortDescription: '' }, 'shortDescription'],
      ['a short description over 300 characters', { shortDescription: 'x'.repeat(301) }, 'shortDescription'],
      ['no body', { body: '' }, 'body'],
      ['a body of empty paragraphs', { body: '<p></p><p><br></p>' }, 'body'],
      ['a body over the limit', { body: `<p>${'x'.repeat(100_001)}</p>` }, 'body'],
      ['no date made', { dateMade: '' }, 'dateMade'],
      ['a date that is not on the calendar', { dateMade: '2026-02-31' }, 'dateMade'],
      ['a date that is not a date', { dateMade: '01/10/2026' }, 'dateMade'],
      ['a date made in the future', { dateMade: localToday(tomorrow) }, 'dateMade'],
      ['no owner', { ownerId: null }, 'ownerId'],
      ['an owner who is not an employee', { ownerId: 9999 }, 'ownerId'],
      ['an archived owner', { ownerId: ines.id }, 'ownerId'],
      ['no category', { categoryId: undefined }, 'categoryId'],
      ['a category that does not exist', { categoryId: 9999 }, 'categoryId'],
      ['a category that is no longer in use', { categoryId: 90 }, 'categoryId', 409],
      ['no employee involved', { employeeIds: [] }, 'employeeIds'],
      ['an employee involved who is not in the directory', { employeeIds: [9999] }, 'employeeIds'],
      ['an archived employee involved', { employeeIds: [dana.id, ines.id] }, 'employeeIds'],
      ['no management involved', { managementIds: [] }, 'managementIds'],
      ['an archived person in management', { managementIds: [ines.id] }, 'managementIds'],
      ['someone in both lists', { employeeIds: [dana.id, femi.id] }, 'managementIds'],
    ]
    for (const [what, change, field, status = 422] of cases) {
      const res = await t.call('POST', '/api/grievances', { cookie, body: { ...body, ...change } })
      expect(res.status, what).toBe(status)
      expect(Object.keys(res.data.details.fields), what).toEqual([field])
    }
    expect(t.sqlite.prepare('select count(*) as n from grievances').get()).toEqual({ n: 0 })
    expect(t.sqlite.prepare('select count(*) as n from grievance_audit_log').get()).toEqual({ n: 0 })

    // Today is allowed, and so is an owner who is also named on it.
    const ok = await t.call('POST', '/api/grievances', { cookie, body: { ...body, dateMade: localToday(), ownerId: femi.id } })
    expect(ok.status).toBe(201)
  })

  it('keeps anyone named on a grievance from being deleted, without saying which grievance', async () => {
    const t = await setup()
    const { dana, femi, ines, body } = grievanceFixture(t)
    const cookie = await t.asSuper()
    const owner = t.db.insert(employees).values({ code: 'E-2004', firstName: 'Owen', lastName: 'Marsh' }).returning().get()
    expect((await t.call('POST', '/api/grievances', { cookie, body: { ...body, ownerId: owner.id } })).status).toBe(201)

    for (const named of [dana, femi, owner]) {
      const res = await t.call('DELETE', `/api/employees/${named.id}`, { cookie })
      expect(res.status).toBe(409)
      expect(res.data.message).toMatch(/Named on a grievance\. Archive instead/)
      expect(res.data.message).not.toMatch(/GR-|Shift swaps/)
    }
    const listed = (await t.call('GET', '/api/employees', { cookie })).data as { id: number; deleteBlocked: string | null }[]
    expect(listed.find((row) => row.id === dana.id)!.deleteBlocked).toMatch(/^Named on a grievance/)
    expect((await t.call('DELETE', `/api/employees/${ines.id}`, { cookie })).status).toBe(204)
  })
})

describe('browsing grievances', () => {
  type Listed = { owners: { name: string }[]; rows: { code: string; preview: string; status: string; [key: string]: unknown }[]; counts: Record<string, number> }

  // Three grievances: the fixture's own, one about pay owned by Ines and made earlier, and a long one that is then resolved.
  async function three() {
    const t = await setup()
    const { dana, femi, ines, body } = grievanceFixture(t)
    const cookie = await t.asAdmin()
    const post = async (extra: object) => ((await t.call('POST', '/api/grievances', { cookie, body: { ...body, ...extra } })).data as { id: number; code: string }).code
    const swaps = await post({})
    const pay = await post({ title: 'Night allowance missing', shortDescription: 'Allowance not paid for 100% of August.', body: '<p>Payslips show no allowance.</p>', dateMade: '2026-08-15', ownerId: ines.id, categoryId: 2, employeeIds: [femi.id], managementIds: [dana.id] })
    const long = await post({ title: 'Rota published late', body: `<p>${'word '.repeat(100)}</p><p>Unfindable_ending</p>`, dateMade: '2026-09-10' })
    t.sqlite.prepare("update grievances set status = 'resolved' where code = ?").run(long)
    t.sqlite.prepare('update grievances set last_activity_at = last_activity_at + seq').run()
    const list = async (query = '') => (await t.call('GET', `/api/grievances${query}`, { cookie })).data as Listed
    const codes = async (query: string) => (await list(query)).rows.map((row) => row.code)
    return { t, cookie, dana, femi, ines, swaps, pay, long, list, codes }
  }

  it('lists each grievance with its people and a preview, most recent activity first, and never the body', async () => {
    const { t, dana, femi, swaps, pay, long, list } = await three()
    const { rows, counts } = await list()
    expect(rows.map((row) => row.code)).toEqual([long, pay, swaps])
    expect(counts).toEqual({ all: 3, open: 2, in_progress: 0, resolved: 1, closed: 0, voided: 0 })
    expect(rows[2]).toMatchObject({
      code: swaps,
      title: 'Shift swaps refused without a reason',
      shortDescription: 'Three swap requests were turned down in September with no explanation.',
      dateMade: '2026-10-01',
      status: 'open',
      category: { id: 1, name: 'Conduct' },
      owner: { id: t.person.id, code: 'E-1042', archived: false },
      employees: [{ id: dana.id, code: 'E-2001', name: 'Dana Whitlock', archived: false }],
      management: [{ id: femi.id, code: 'E-2002', name: 'Femi Adeyemi', archived: false }],
    })
    // Plain text only, with the blocks kept apart.
    expect(rows[2]!.preview).toMatch(/^What happened\s+Requests were refused on three dates\./)
    expect(rows[0]!.preview).toHaveLength(300)
    expect(rows[0]!.preview.endsWith('…')).toBe(true)
    for (const row of rows) expect(Object.keys(row).filter((key) => /body|html/i.test(key))).toEqual([])
    expect(JSON.stringify(rows)).not.toContain('<')
  })

  it('narrows by status, owner, category and the days Date Made falls between, and counts each status under the other filters', async () => {
    const { t, ines, swaps, pay, long, list, codes } = await three()
    expect(await codes('?status=open')).toEqual([pay, swaps])
    expect(await codes('?status=resolved')).toEqual([long])
    expect(await codes('?status=voided')).toEqual([])
    expect(await codes(`?owner=${ines.id}`)).toEqual([pay])
    expect(await codes(`?owner=${t.person.id}&status=open`)).toEqual([swaps])
    expect(await codes('?category=2')).toEqual([pay])
    expect(await codes('?from=2026-09-10')).toEqual([long, swaps])
    expect(await codes('?to=2026-09-10')).toEqual([long, pay])
    expect(await codes('?from=2026-08-15&to=2026-08-15')).toEqual([pay])
    // The owner filter offers every owner, whatever else is chosen.
    expect((await list('?category=2&status=closed')).owners.map((owner) => owner.name)).toEqual(['Ines Carvalho', 'Priya Raghunathan'])
    expect((await list(`?status=resolved&owner=${t.person.id}`)).counts).toEqual({ all: 2, open: 1, in_progress: 0, resolved: 1, closed: 0, voided: 0 })
  })

  it('searches the ID, title, short description, body text and the names of the owner and the people named', async () => {
    const { swaps, pay, long, codes } = await three()
    expect(await codes(`?q=${swaps.toLowerCase()}`)).toEqual([swaps])
    expect(await codes('?q=ROTA')).toEqual([long])
    expect(await codes('?q=turned%20down')).toEqual([long, swaps])
    expect(await codes('?q=payslips')).toEqual([pay])
    // Past the preview, and with an underscore that must not act as a wildcard.
    expect(await codes('?q=unfindable_ending')).toEqual([long])
    expect(await codes('?q=unfindable.ending')).toEqual([])
    expect(await codes('?q=100%25')).toEqual([pay])
    expect(await codes('?q=carvalho')).toEqual([pay])
    expect(await codes('?q=dana%20whitlock')).toEqual([long, pay, swaps])
    expect(await codes('?q=Priya%20Raghunathan')).toEqual([long, swaps])
    // Every word must be found, though not all in one place.
    expect(await codes('?q=whitlock%20allowance')).toEqual([pay])
    expect(await codes('?q=whitlock%20nothing-like-it')).toEqual([])
    // Markup is not text.
    expect(await codes('?q=strong')).toEqual([])
  })

  it('refuses a query it cannot read', async () => {
    const { cookie, t } = await three()
    for (const query of ['?status=pending', '?owner=dana', '?category=0', '?from=2026-02-30', '?to=yesterday', `?q=${'x'.repeat(101)}`]) {
      expect((await t.call('GET', `/api/grievances${query}`, { cookie })).status, query).toBe(422)
    }
  })

  it('still names an employee who has since been archived, and says so', async () => {
    const { t, dana, list } = await three()
    t.sqlite.prepare('update employees set archived_at = ? where id = ?').run(Date.now(), dana.id)
    const { rows } = await list('?q=whitlock')
    expect(rows).toHaveLength(3)
    expect((rows[2]!.employees as { name: string; archived: boolean }[])[0]).toMatchObject({ name: 'Dana Whitlock', archived: true })
  })
})
