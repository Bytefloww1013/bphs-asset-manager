import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { localToday } from '../../shared/schemas.ts'
import { employees, users } from '../db/schema.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { get } from '../lib/grievance-files.ts'
import { nextGrievanceCode } from '../services/grievances.ts'
import { ADMIN, setup } from './helpers.ts'

describe('the grievances workspace', () => {
  it('answers 401 to a signed-out request and an empty list to either role while there are none', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/grievances')).status).toBe(401)
    for (const cookie of [await t.asAdmin(), await t.asSuper()]) {
      const res = await t.call('GET', '/api/grievances', { cookie })
      expect(res.status).toBe(200)
      expect(res.data).toEqual({
        rows: [],
        owners: [],
        counts: { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, voided: 0 },
      })
    }
  })
})

describe('the grievance audit log', () => {
  const actor = (t: Awaited<ReturnType<typeof setup>>) => ({
    ...t.adminUser,
    employeeId: t.adminUser.employeeId ?? null,
  })

  it('takes an entry of its own and leaves the audit log alone', async () => {
    const t = await setup()
    const before = t.sqlite.prepare('select count(*) as n from audit_log').get()
    t.db.transaction((tx) =>
      writeGrievanceAudit(tx, actor(t), {
        action: 'create',
        entityType: 'grievance',
        entityId: 1,
        details: 'GR-2026-0001 · A title',
      }),
    )
    expect(
      t.sqlite.prepare('select user_id, actor, action, entity_type, entity_id, details from grievance_audit_log').all(),
    ).toEqual([
      {
        user_id: t.adminUser.id,
        actor: 'm.oyelaran@bphs.local',
        action: 'create',
        entity_type: 'grievance',
        entity_id: 1,
        details: 'GR-2026-0001 · A title',
      },
    ])
    expect(t.sqlite.prepare('select count(*) as n from audit_log').get()).toEqual(before)
  })

  it('is append-only', async () => {
    const t = await setup()
    writeGrievanceAudit(t.db, actor(t), { action: 'create', entityType: 'grievance', entityId: 1 })
    expect(() => t.sqlite.prepare("update grievance_audit_log set details = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('update grievance_audit_log set id = 99').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from grievance_audit_log').run()).toThrow(/append-only/)
    expect(() =>
      t.sqlite
        .prepare(
          "insert or replace into grievance_audit_log (id, occurred_at, actor, action, entity_type) values (1, 0, 'x', 'create', 'grievance')",
        )
        .run(),
    ).toThrow(/append-only/)
    // Deleting the account clears the link and keeps the entry and the name on it.
    t.sqlite.prepare('delete from sessions where user_id = ?').run(t.adminUser.id)
    t.sqlite.prepare('delete from users where id = ?').run(t.adminUser.id)
    expect(t.sqlite.prepare('select user_id, actor from grievance_audit_log').all()).toEqual([
      { user_id: null, actor: 'm.oyelaran@bphs.local' },
    ])
  })
})

// The logs are kept apart in the source as well: grievance and review code never write to the Audit Log, and nothing else writes to theirs.
describe('the grievance and review audit logs', () => {
  it.each([
    { prefix: 'grievance', writers: /\bwriteGrievanceAudit\b|\bgrievanceAuditLog\b/ },
    { prefix: 'review', writers: /\bwriteReviewAudit\b|\breviewAuditLog\b/ },
  ])(
    'the $prefix one is written by $prefix code only, which never writes to the audit log or notifies',
    ({ prefix, writers }) => {
      const server = path.resolve(import.meta.dirname, '..')
      const sources = (fs.readdirSync(server, { recursive: true }) as string[])
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('tests' + path.sep))
        .map((file) => ({
          file: file.split(path.sep).join('/'),
          text: fs.readFileSync(path.join(server, file), 'utf8'),
        }))
      const isOwn = (file: string) => path.basename(file).startsWith(prefix)
      expect(sources.filter((s) => isOwn(s.file)).map((s) => s.file)).toContain(`lib/${prefix}-audit.ts`)
      expect(
        sources
          .filter((s) => isOwn(s.file) && /\bwriteAudit\b|\bauditLog\b|\bnotify\b/.test(s.text))
          .map((s) => s.file),
      ).toEqual([])
      expect(
        sources.filter((s) => !isOwn(s.file) && s.file !== 'db/schema.ts' && writers.test(s.text)).map((s) => s.file),
      ).toEqual([])
    },
  )
})

describe('grievance categories', () => {
  const names = (rows: { name: string }[]) => rows.map((row) => row.name)

  it('start with the six from the migration, all active and unused', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/grievances/categories')).status).toBe(401)
    const res = await t.call('GET', '/api/grievances/categories', { cookie: await t.asAdmin() })
    expect(names(res.data)).toEqual([
      'Conduct',
      'Discrimination or harassment',
      'Health and safety',
      'Other',
      'Pay and hours',
      'Working conditions',
    ])
    expect(res.data.every((row: any) => row.isActive && row.grievanceCount === 0)).toBe(true)
  })

  it('can be added, renamed and deactivated by an admin, with each change in the grievance audit log only', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()

    const added = await t.call('POST', '/api/grievances/categories', { cookie, body: { name: 'Scheduling' } })
    expect(added.status).toBe(201)
    const id = added.data.id
    expect(
      (await t.call('POST', '/api/grievances/categories', { cookie, body: { name: 'scheduling' } })).data.error,
    ).toBe('duplicate_name')
    expect((await t.call('POST', '/api/grievances/categories', { cookie, body: { name: ' ' } })).status).toBe(422)

    expect(
      (await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { name: 'Conduct' } })).data.error,
    ).toBe('duplicate_name')
    expect(
      (await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { name: 'Rotas' } })).data.name,
    ).toBe('Rotas')
    expect(
      (await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { isActive: false } })).data.isActive,
    ).toBe(false)
    // Saving what is already there changes nothing and logs nothing.
    expect(
      (await t.call('PATCH', `/api/grievances/categories/${id}`, { cookie, body: { name: 'Rotas', isActive: false } }))
        .status,
    ).toBe(200)
    expect((await t.call('PATCH', '/api/grievances/categories/9999', { cookie, body: { name: 'Nope' } })).status).toBe(
      404,
    )

    expect(
      t.sqlite
        .prepare('select actor, action, entity_type, entity_id, details from grievance_audit_log order by id')
        .all(),
    ).toEqual([
      {
        actor: 'm.oyelaran@bphs.local',
        action: 'create',
        entity_type: 'category',
        entity_id: id,
        details: 'Scheduling',
      },
      {
        actor: 'm.oyelaran@bphs.local',
        action: 'update',
        entity_type: 'category',
        entity_id: id,
        details: 'Rotas · name: Scheduling → Rotas',
      },
      {
        actor: 'm.oyelaran@bphs.local',
        action: 'update',
        entity_type: 'category',
        entity_id: id,
        details: 'Rotas · active: true → false',
      },
    ])
  })

  it('can be deleted by a super admin only, and only when unused', async () => {
    const t = await setup()
    const [admin, superAdmin] = [await t.asAdmin(), await t.asSuper()]
    const rows = (await t.call('GET', '/api/grievances/categories', { cookie: admin })).data as {
      id: number
      name: string
    }[]
    const conduct = rows.find((row) => row.name === 'Conduct')!
    const other = rows.find((row) => row.name === 'Other')!

    expect((await t.call('DELETE', `/api/grievances/categories/${other.id}`, { cookie: admin })).status).toBe(403)

    t.sqlite
      .prepare(
        "insert into grievances (code, year, seq, title, short_description, body_html, body_text, date_made, owner_id, category_id, last_activity_at) values ('GR-2026-0001', 2026, 1, 'A title', 'Short', '<p>Body</p>', 'Body', '2026-10-12', ?, ?, 0)",
      )
      .run(t.person.id, conduct.id)
    const inUse = await t.call('DELETE', `/api/grievances/categories/${conduct.id}`, { cookie: superAdmin })
    expect(inUse.status).toBe(409)
    expect(inUse.data.error).toBe('in_use')
    expect(
      (await t.call('GET', '/api/grievances/categories', { cookie: admin })).data.find(
        (row: any) => row.id === conduct.id,
      ).grievanceCount,
    ).toBe(1)

    expect((await t.call('DELETE', `/api/grievances/categories/${other.id}`, { cookie: superAdmin })).status).toBe(204)
    expect(
      t.sqlite
        .prepare("select action, entity_type, entity_id, details from grievance_audit_log where action = 'delete'")
        .all(),
    ).toEqual([{ action: 'delete', entity_type: 'category', entity_id: other.id, details: 'unused category "Other"' }])
  })

  it('always keep one active', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const rows = (await t.call('GET', '/api/grievances/categories', { cookie })).data as { id: number }[]
    for (const row of rows.slice(1))
      expect(
        (await t.call('PATCH', `/api/grievances/categories/${row.id}`, { cookie, body: { isActive: false } })).status,
      ).toBe(200)
    const last = rows[0]!
    expect(
      (await t.call('PATCH', `/api/grievances/categories/${last.id}`, { cookie, body: { isActive: false } })).data
        .error,
    ).toBe('last_active')
    expect((await t.call('DELETE', `/api/grievances/categories/${last.id}`, { cookie })).data.error).toBe('last_active')
  })
})

describe('grievance tables and IDs', () => {
  const insert = (t: Awaited<ReturnType<typeof setup>>, values: Record<string, unknown> = {}) => {
    const row = {
      code: 'GR-2026-0001',
      year: 2026,
      seq: 1,
      title: 'A title',
      short_description: 'Short',
      body_html: '<p>Body</p>',
      body_text: 'Body',
      date_made: '2026-10-12',
      owner_id: t.person.id,
      category_id: 1,
      last_activity_at: 0,
      ...values,
    }
    const keys = Object.keys(row)
    return t.sqlite
      .prepare(`insert into grievances (${keys.join(', ')}) values (${keys.map(() => '?').join(', ')})`)
      .run(...(Object.values(row) as (string | number)[]))
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
  const add = (code: string, firstName: string, lastName: string) =>
    t.db.insert(employees).values({ code, firstName, lastName }).returning().get()
  const [dana, femi, ines] = [
    add('E-2001', 'Dana', 'Whitlock'),
    add('E-2002', 'Femi', 'Adeyemi'),
    add('E-2003', 'Ines', 'Carvalho'),
  ]
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

/** One grievance owned by Ines, whose account is the admin's, recorded by Noor, an outsider. Priya is the Super Admin and owns nothing. */
async function ownedFixture() {
  const t = await setup()
  const { dana, ines, femi, body } = grievanceFixture(t)
  t.sqlite.prepare('update users set employee_id = ? where id = ?').run(ines.id, t.adminUser.id)
  const outsider = t.db
    .insert(users)
    .values({
      name: 'Noor Haddad',
      email: 'n.haddad@bphs.local',
      passwordHash: t.superUser.passwordHash,
      access: ADMIN,
      mustChangePassword: false,
    })
    .returning()
    .get()
  const [owner, superAdmin, other] = [await t.asAdmin(), await t.asSuper(), (await t.signIn(outsider.email)).cookie]
  const made = (await t.call('POST', '/api/grievances', { cookie: other, body: { ...body, ownerId: ines.id } }))
    .data as { id: number; code: string }
  // Both read Grievances and no more, so only owning it lets the owner change it.
  t.sqlite
    .prepare(`update users set access = '{"grievances":"read"}' where id in (?, ?)`)
    .run(t.adminUser.id, outsider.id)
  const { ownerId: _, ...fields } = body
  return { t, dana, ines, femi, owner, superAdmin, other, made, fields, path: `/api/grievances/${made.code}` }
}
const timeline = (t: T) =>
  t.sqlite.prepare('select seq, kind, title, body_html, documented_by_label from grievance_entries order by seq').all()
const audit = (t: T) =>
  t.sqlite
    .prepare("select action, entity_type, details from grievance_audit_log where action <> 'create' order by id")
    .all()
const stored = (t: T) => t.sqlite.prepare('select title, version from grievances').get()

describe('creating a grievance', () => {
  it('is open to either role, numbers each one, and gives the body back with its formatting', async () => {
    const t = await setup()
    const { dana, femi, body } = grievanceFixture(t)
    expect((await t.call('POST', '/api/grievances', { body })).status).toBe(401)
    const [admin, superAdmin] = [await t.asAdmin(), await t.asSuper()]

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
      category: { id: 1, name: 'Conduct' },
      owner: { id: t.person.id, code: 'E-1042', name: 'Priya Raghunathan', archived: false },
      employees: [{ id: dana.id, code: 'E-2001', name: 'Dana Whitlock', archived: false }],
      management: [{ id: femi.id, code: 'E-2002', name: 'Femi Adeyemi', archived: false }],
      recordedBy: 'Marcus Oyelaran',
    })
    expect(first.data.createdAt).toBe(first.data.lastActivityAt)

    const second = await t.call('POST', '/api/grievances', {
      cookie: superAdmin,
      body: { ...body, title: 'A second one' },
    })
    expect(second.data).toMatchObject({ code: `GR-${year}-0002`, recordedBy: 'Priya Raghunathan' })

    expect(t.sqlite.prepare('select body_text from grievances where id = ?').get(first.data.id)).toEqual({
      body_text: 'What happened\nRequests were refused on three dates.\n2 September',
    })
    expect(
      t.sqlite
        .prepare('select actor, action, entity_type, entity_id, details from grievance_audit_log order by id')
        .all(),
    ).toEqual([
      {
        actor: 'm.oyelaran@bphs.local',
        action: 'create',
        entity_type: 'grievance',
        entity_id: first.data.id,
        details: `GR-${year}-0001 · ${body.title}`,
      },
      {
        actor: 'p.raghunathan@bphs.local',
        action: 'create',
        entity_type: 'grievance',
        entity_id: second.data.id,
        details: `GR-${year}-0002 · A second one`,
      },
    ])
  })

  it('stores a sanitised body, whatever it was sent, and names a person once however often they are sent', async () => {
    const t = await setup()
    const { dana, femi, body } = grievanceFixture(t)
    const res = await t.call('POST', '/api/grievances', {
      cookie: await t.asAdmin(),
      body: {
        ...body,
        body: '<p onclick="steal()" style="color:red">Said <a href="javascript:alert(1)">this</a>.</p><script>alert(1)</script><img src="x">',
        employeeIds: [dana.id, dana.id],
        managementIds: [femi.id, femi.id],
      },
    })
    expect(res.status).toBe(201)
    expect(res.data.bodyHtml).toBe('<p>Said this.</p>')
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
    const ok = await t.call('POST', '/api/grievances', {
      cookie,
      body: { ...body, dateMade: localToday(), ownerId: femi.id },
    })
    expect(ok.status).toBe(201)
  })

  it('keeps anyone named on a grievance from being deleted, without saying which grievance', async () => {
    const t = await setup()
    const { dana, femi, ines, body } = grievanceFixture(t)
    const cookie = await t.asSuper()
    const owner = t.db
      .insert(employees)
      .values({ code: 'E-2004', firstName: 'Owen', lastName: 'Marsh' })
      .returning()
      .get()
    expect((await t.call('POST', '/api/grievances', { cookie, body: { ...body, ownerId: owner.id } })).status).toBe(201)

    for (const named of [dana, femi, owner]) {
      const res = await t.call('DELETE', `/api/employees/${named.id}`, { cookie })
      expect(res.status).toBe(409)
      expect(res.data.message).toMatch(/Named on a grievance\. Archive instead/)
      expect(res.data.message).not.toMatch(/GR-|Shift swaps/)
    }
    const listed = (await t.call('GET', '/api/employees', { cookie })).data as {
      id: number
      deleteBlocked: string | null
    }[]
    expect(listed.find((row) => row.id === dana.id)!.deleteBlocked).toMatch(/^Named on a grievance/)
    expect((await t.call('DELETE', `/api/employees/${ines.id}`, { cookie })).status).toBe(204)
  })
})

describe('browsing grievances', () => {
  type Listed = {
    owners: { name: string }[]
    rows: { code: string; preview: string; status: string; [key: string]: unknown }[]
    counts: Record<string, number>
  }

  // Three grievances: the fixture's own, one about pay owned by Ines and made earlier, and a long one that is then resolved.
  async function three() {
    const t = await setup()
    const { dana, femi, ines, body } = grievanceFixture(t)
    const cookie = await t.asAdmin()
    const post = async (extra: object) =>
      (
        (await t.call('POST', '/api/grievances', { cookie, body: { ...body, ...extra } })).data as {
          id: number
          code: string
        }
      ).code
    const swaps = await post({})
    const pay = await post({
      title: 'Night allowance missing',
      shortDescription: 'Allowance not paid for 100% of August.',
      body: '<p>Payslips show no allowance.</p>',
      dateMade: '2026-08-15',
      ownerId: ines.id,
      categoryId: 2,
      employeeIds: [femi.id],
      managementIds: [dana.id],
    })
    const long = await post({
      title: 'Rota published late',
      body: `<p>${'word '.repeat(100)}</p><p>Unfindable_ending</p>`,
      dateMade: '2026-09-10',
    })
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
    expect((await list('?category=2&status=closed')).owners.map((owner) => owner.name)).toEqual([
      'Ines Carvalho',
      'Priya Raghunathan',
    ])
    expect((await list(`?status=resolved&owner=${t.person.id}`)).counts).toEqual({
      all: 2,
      open: 1,
      in_progress: 0,
      resolved: 1,
      closed: 0,
      voided: 0,
    })
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
    for (const query of [
      '?status=pending',
      '?owner=dana',
      '?category=0',
      '?from=2026-02-30',
      '?to=yesterday',
      `?q=${'x'.repeat(101)}`,
    ]) {
      expect((await t.call('GET', `/api/grievances${query}`, { cookie })).status, query).toBe(422)
    }
  })

  it('still names an employee who has since been archived, and says so', async () => {
    const { t, dana, list } = await three()
    t.sqlite.prepare('update employees set archived_at = ? where id = ?').run(Date.now(), dana.id)
    const { rows } = await list('?q=whitlock')
    expect(rows).toHaveLength(3)
    expect((rows[2]!.employees as { name: string; archived: boolean }[])[0]).toMatchObject({
      name: 'Dana Whitlock',
      archived: true,
    })
  })
})

describe('opening a grievance', () => {
  it('gives either role the whole grievance by its ID, in any letter case, and 404 for one that does not exist', async () => {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const [admin, superAdmin] = [await t.asAdmin(), await t.asSuper()]
    const made = (await t.call('POST', '/api/grievances', { cookie: admin, body })).data as { code: string }
    expect((await t.call('GET', `/api/grievances/${made.code}`)).status).toBe(401)
    for (const cookie of [admin, superAdmin]) {
      const res = await t.call('GET', `/api/grievances/${made.code.toLowerCase()}`, { cookie })
      expect(res.status).toBe(200)
      // What creating it gave back, checked field by field there.
      expect(res.data).toMatchObject(made)
    }
    for (const code of ['GR-2026-9999', 'GR-1', 'nothing', '1'])
      expect((await t.call('GET', `/api/grievances/${code}`, { cookie: admin })).status, code).toBe(404)
    // The fixed paths beside it are not taken for an ID.
    expect(Array.isArray((await t.call('GET', '/api/grievances/categories', { cookie: admin })).data)).toBe(true)
  })

  it('still names an archived employee, marked as archived, and reading it writes nothing', async () => {
    const t = await setup()
    const { dana, body } = grievanceFixture(t)
    const cookie = await t.asAdmin()
    const made = (await t.call('POST', '/api/grievances', { cookie, body })).data as { code: string }
    t.sqlite.prepare('update employees set archived_at = ? where id in (?, ?)').run(Date.now(), dana.id, t.person.id)
    const count = () => (t.sqlite.prepare('select count(*) as n from grievance_audit_log').get() as { n: number }).n
    const before = count()
    const data = (await t.call('GET', `/api/grievances/${made.code}`, { cookie })).data as {
      owner: { archived: boolean }
      employees: { archived: boolean }[]
      management: { archived: boolean }[]
    }
    expect([data.owner.archived, data.employees[0]!.archived, data.management[0]!.archived]).toEqual([
      true,
      true,
      false,
    ])
    expect(count()).toBe(before)
  })

  it('logs each case file printed or workbook taken, by ID and title only, and 404 for a grievance that does not exist', async () => {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const cookie = await t.asAdmin()
    const made = (await t.call('POST', '/api/grievances', { cookie, body })).data as { id: number; code: string }
    const res = await t.call('POST', `/api/grievances/${made.code.toLowerCase()}/exports`, {
      cookie,
      body: { format: 'pdf' },
    })
    expect(res.status).toBe(204)
    expect(
      (await t.call('POST', `/api/grievances/${made.code}/exports`, { cookie, body: { format: 'xlsx' } })).status,
    ).toBe(204)
    expect(
      t.sqlite
        .prepare("select entity_type, entity_id, details from grievance_audit_log where action = 'export' order by id")
        .all(),
    ).toEqual([
      {
        entity_type: 'grievance',
        entity_id: made.id,
        details: `${made.code} · ${body.title} · PDF case file (print dialog opened)`,
      },
      { entity_type: 'grievance', entity_id: made.id, details: `${made.code} · ${body.title} · Excel workbook` },
    ])
    expect(
      (await t.call('POST', `/api/grievances/${made.code}/exports`, { cookie, body: { format: 'docx' } })).status,
    ).toBe(422)
    expect(
      (await t.call('POST', '/api/grievances/GR-2026-9999/exports', { cookie, body: { format: 'pdf' } })).status,
    ).toBe(404)
    expect((await t.call('POST', `/api/grievances/${made.code}/exports`, { body: { format: 'pdf' } })).status).toBe(401)
  })
})

describe('adding to the timeline', () => {
  const entries = (t: T) =>
    t.sqlite
      .prepare(
        'select seq, kind, title, short_description, body_html, body_text, documented_by_employee_id, documented_by_user_id, documented_by_label, corrects_entry_id from grievance_entries order by grievance_id, seq',
      )
      .all()
  const entry = {
    kind: 'action',
    occurredAt: '2026-10-02T09:30:00.000Z',
    title: 'Met with Dana',
    shortDescription: 'Talked through the three dates.',
    body: '<p>She kept <strong>notes</strong>.</p>',
  }

  async function one() {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const [admin, superAdmin] = [await t.asAdmin(), await t.asSuper()]
    const base = body
    const made = (await t.call('POST', '/api/grievances', { cookie: admin, body })).data as {
      id: number
      code: string
      createdAt: string
      employees: { id: number }[]
      management: { id: number }[]
    }
    return { t, admin, superAdmin, made, base, path: `/api/grievances/${made.code}/entries` }
  }

  it('starts every grievance with "Grievance recorded", documented by the account that recorded it', async () => {
    const { t, made } = await one()
    expect(entries(t)).toEqual([
      {
        seq: 1,
        kind: 'system',
        title: 'Grievance recorded',
        short_description: '',
        body_html: '',
        body_text: '',
        documented_by_employee_id: null,
        documented_by_user_id: t.adminUser.id,
        documented_by_label: 'Marcus Oyelaran',
        corrects_entry_id: null,
      },
    ])
    expect(t.sqlite.prepare('select occurred_at, recorded_at from grievance_entries').get()).toEqual({
      occurred_at: Date.parse(made.createdAt),
      recorded_at: Date.parse(made.createdAt),
    })
  })

  it('takes an action or an event from either role, numbers them, and moves the last activity on', async () => {
    const { t, admin, superAdmin, made, path } = await one()
    expect((await t.call('POST', path, { body: entry })).status).toBe(401)
    t.sqlite.prepare('update grievances set last_activity_at = 1 where id = ?').run(made.id)

    const first = await t.call('POST', path.toLowerCase(), { cookie: superAdmin, body: entry })
    expect(first.status).toBe(201)
    expect(first.data).toMatchObject({
      seq: 2,
      kind: 'action',
      occurredAt: entry.occurredAt,
      title: entry.title,
      shortDescription: entry.shortDescription,
      bodyHtml: entry.body,
      documentedBy: 'Priya Raghunathan',
    })
    const second = await t.call('POST', path, {
      cookie: admin,
      body: {
        kind: 'event',
        occurredAt: '2026-09-02T08:00:00+01:00',
        title: 'First swap refused',
        shortDescription: 'Back-dated.',
      },
    })
    expect(second.data).toMatchObject({
      seq: 3,
      kind: 'event',
      occurredAt: '2026-09-02T07:00:00.000Z',
      bodyHtml: '',
      documentedBy: 'Marcus Oyelaran',
    })

    expect(entries(t).slice(1)).toMatchObject([
      {
        seq: 2,
        kind: 'action',
        body_text: 'She kept notes.',
        documented_by_employee_id: t.person.id,
        documented_by_user_id: t.superUser.id,
      },
      { seq: 3, kind: 'event', body_html: '', documented_by_employee_id: null, documented_by_user_id: t.adminUser.id },
    ])
    const after = t.sqlite.prepare('select last_activity_at as at from grievances where id = ?').get(made.id) as {
      at: number
    }
    expect(after.at).toBe(Date.parse(second.data.recordedAt))
    expect(
      t.sqlite
        .prepare(
          "select actor, entity_type, entity_id, details from grievance_audit_log where action = 'entry' order by id",
        )
        .all(),
    ).toEqual([
      {
        actor: 'p.raghunathan@bphs.local',
        entity_type: 'grievance_entry',
        entity_id: first.data.id,
        details: `${made.code} E02 · Met with Dana`,
      },
      {
        actor: 'm.oyelaran@bphs.local',
        entity_type: 'grievance_entry',
        entity_id: second.data.id,
        details: `${made.code} E03 · First swap refused`,
      },
    ])
  })

  it('takes Documented By from the session and nothing else, and sanitises the body', async () => {
    const { t, admin, path } = await one()
    const res = await t.call('POST', path, {
      cookie: admin,
      body: {
        ...entry,
        body: '<p onclick="x()">Fine</p><script>alert(1)</script>',
        documentedBy: 'Someone Else',
        documentedByUserId: t.superUser.id,
        documentedByEmployeeId: t.person.id,
        seq: 9,
        recordedAt: '2020-01-01T00:00:00Z',
      },
    })
    expect(res.status).toBe(201)
    expect(res.data).toMatchObject({ seq: 2, documentedBy: 'Marcus Oyelaran', bodyHtml: '<p>Fine</p>' })
    expect(Date.parse(res.data.recordedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(entries(t)[1]).toMatchObject({
      documented_by_user_id: t.adminUser.id,
      documented_by_employee_id: null,
      documented_by_label: 'Marcus Oyelaran',
    })
  })

  it('refuses an entry that breaks a rule, saying which field, and one for a grievance that does not exist', async () => {
    const { t, admin, path } = await one()
    const refused = async (change: object) => {
      const res = await t.call('POST', path, { cookie: admin, body: { ...entry, ...change } })
      expect(res.status, JSON.stringify(change)).toBe(422)
      return Object.keys(res.data.details.fields)
    }
    expect(await refused({ kind: 'system' })).toEqual(['kind'])
    expect(await refused({ title: '  ' })).toEqual(['title'])
    expect(await refused({ title: 'x'.repeat(151) })).toEqual(['title'])
    expect(await refused({ shortDescription: '' })).toEqual(['shortDescription'])
    expect(await refused({ occurredAt: 'yesterday' })).toEqual(['occurredAt'])
    expect(await refused({ occurredAt: new Date(Date.now() + 3_600_000).toISOString() })).toEqual(['occurredAt'])
    expect(await refused({ body: `<p>${'x'.repeat(100_001)}</p>` })).toEqual(['body'])
    expect((await t.call('POST', '/api/grievances/GR-2026-9999/entries', { cookie: admin, body: entry })).status).toBe(
      404,
    )
    expect(entries(t)).toHaveLength(1)
  })

  it('refuses anything more on a grievance that is Closed or Voided', async () => {
    const { t, admin, made, path } = await one()
    for (const [status, label] of [
      ['closed', 'Closed'],
      ['voided', 'Voided'],
    ]) {
      t.sqlite.prepare('update grievances set status = ? where id = ?').run(status, made.id)
      const res = await t.call('POST', path, { cookie: admin, body: entry })
      expect(res.status).toBe(409)
      expect(res.data).toMatchObject({
        error: 'grievance_sealed',
        message: `${made.code} is ${label}. Nothing more can be added to its timeline.`,
      })
    }
    for (const status of ['in_progress', 'resolved']) {
      t.sqlite.prepare('update grievances set status = ? where id = ?').run(status, made.id)
      expect((await t.call('POST', path, { cookie: admin, body: entry })).status, status).toBe(201)
    }
  })

  it('keeps every entry as it was written: the table itself refuses a change, a removal or a replacement', async () => {
    const { t, made } = await one()
    expect(() => t.sqlite.prepare("update grievance_entries set title = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('update grievance_entries set occurred_at = 0').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from grievance_entries').run()).toThrow(/append-only/)
    expect(() =>
      t.sqlite.prepare('insert or replace into grievance_entries select * from grievance_entries').run(),
    ).toThrow(/append-only/)
    // An entry belongs to a grievance that exists, and its grievance cannot be removed from under it.
    const insert =
      "insert into grievance_entries (grievance_id, seq, kind, occurred_at, recorded_at, title, short_description, body_html, body_text, documented_by_user_id, documented_by_label) values (?, 2, 'event', 0, 0, 't', '', '', '', ?, 'x')"
    expect(() => t.sqlite.prepare(insert).run(made.id + 1, t.adminUser.id)).toThrow(/FOREIGN KEY/)
    expect(() => t.sqlite.prepare('delete from grievance_people').run()).not.toThrow()
    expect(() => t.sqlite.prepare('delete from grievances').run()).toThrow(/FOREIGN KEY/)
  })

  it("reads a grievance's entries in the order they were recorded, for either role, and writes nothing by it", async () => {
    const { t, admin, superAdmin, made, path } = await one()
    await t.call('POST', path, { cookie: admin, body: entry })
    expect((await t.call('GET', path)).status).toBe(401)
    const audited = t.sqlite.prepare('select count(*) as n from grievance_audit_log').get()
    for (const cookie of [admin, superAdmin]) {
      const res = await t.call('GET', path.toLowerCase(), { cookie })
      expect(res.status).toBe(200)
      expect(res.data).toMatchObject([
        {
          seq: 1,
          kind: 'system',
          title: 'Grievance recorded',
          occurredAt: made.createdAt,
          bodyHtml: '',
          documentedBy: 'Marcus Oyelaran',
          corrects: null,
          correctedBy: [],
        },
        {
          seq: 2,
          kind: 'action',
          title: entry.title,
          shortDescription: entry.shortDescription,
          occurredAt: entry.occurredAt,
          bodyHtml: entry.body,
          corrects: null,
          correctedBy: [],
        },
      ])
    }
    expect(t.sqlite.prepare('select count(*) as n from grievance_audit_log').get()).toEqual(audited)
    expect((await t.call('GET', '/api/grievances/GR-2026-9999/entries', { cookie: admin })).status).toBe(404)
  })

  it('takes a correction that points at an entry of the same grievance, and leaves the original as it was', async () => {
    const { t, admin, superAdmin, made, base, path } = await one()
    const other = (
      await t.call('POST', '/api/grievances', {
        cookie: admin,
        body: {
          ...base,
          title: 'Another grievance',
          employeeIds: [made.employees[0]!.id],
          managementIds: [made.management[0]!.id],
        },
      })
    ).data as { code: string }
    await t.call('POST', path, { cookie: admin, body: entry })
    await t.call('POST', `/api/grievances/${other.code}/entries`, { cookie: admin, body: entry })
    await t.call('POST', `/api/grievances/${other.code}/entries`, { cookie: admin, body: entry })
    const original = t.sqlite.prepare('select * from grievance_entries where grievance_id = ? and seq = 2').get(made.id)
    const correction = {
      kind: 'correction',
      correctsSeq: 2,
      title: 'The meeting was on 3 October',
      shortDescription: 'E02 gives the wrong day.',
      occurredAt: '2001-01-01T00:00:00Z',
    }

    const res = await t.call('POST', path, { cookie: superAdmin, body: correction })
    expect(res.status).toBe(201)
    expect(res.data).toMatchObject({ seq: 3, kind: 'correction', corrects: 2, documentedBy: 'Priya Raghunathan' })
    // A correction happens when it is written, whatever the request says.
    expect(res.data.occurredAt).toBe(res.data.recordedAt)
    const again = await t.call('POST', path, {
      cookie: admin,
      body: { ...correction, correctsSeq: 3, title: 'Correcting the correction' },
    })
    expect(again.data).toMatchObject({ seq: 4, corrects: 3 })

    const listed = (await t.call('GET', path, { cookie: admin })).data as {
      seq: number
      corrects: number | null
      correctedBy: number[]
    }[]
    expect(listed.map((row) => [row.seq, row.corrects, row.correctedBy])).toEqual([
      [1, null, []],
      [2, null, [3]],
      [3, 2, [4]],
      [4, 3, []],
    ])
    expect(t.sqlite.prepare('select * from grievance_entries where grievance_id = ? and seq = 2').get(made.id)).toEqual(
      original,
    )

    const refused = async (change: object, field: string) => {
      const bad = await t.call('POST', path, { cookie: admin, body: { ...correction, ...change } })
      expect(bad.status, JSON.stringify(change)).toBe(422)
      expect(Object.keys(bad.data.details.fields)).toEqual([field])
    }
    await refused({ correctsSeq: undefined }, 'correctsSeq')
    await refused({ correctsSeq: 0 }, 'correctsSeq')
    // The other grievance has an E03 by now; this one's numbers are its own.
    await refused({ correctsSeq: 9 }, 'correctsSeq')
    await refused({ correctsSeq: 1 }, 'correctsSeq')
    await refused({ title: '' }, 'title')
    expect(listed).toHaveLength(4)
    // The table refuses what the service would never send: a correction pointing into another grievance.
    const foreign = t.sqlite
      .prepare('select id from grievance_entries where grievance_id != ? and seq = 2')
      .get(made.id) as { id: number }
    const insert =
      "insert into grievance_entries (grievance_id, seq, kind, corrects_entry_id, occurred_at, recorded_at, title, short_description, body_html, body_text, documented_by_user_id, documented_by_label) values (?, 9, ?, ?, 0, 0, 't', '', '', '', ?, 'x')"
    expect(() => t.sqlite.prepare(insert).run(made.id, 'correction', foreign.id, t.adminUser.id)).toThrow(
      /same grievance/,
    )
    expect(() => t.sqlite.prepare(insert).run(made.id, 'correction', null, t.adminUser.id)).toThrow(/CHECK/)
    expect(() =>
      t.sqlite.prepare(insert).run(made.id, 'action', (original as { id: number }).id, t.adminUser.id),
    ).toThrow(/CHECK/)
  })

  it('has no route that changes or removes an entry, and none is changed by trying', async () => {
    const { t, admin, superAdmin, made, path } = await one()
    const added = (await t.call('POST', path, { cookie: admin, body: entry })).data as { id: number }
    const routes = (t.app.routes as { method: string; path: string }[]).filter(
      (route) => route.path.startsWith('/api/grievances') && route.path.includes('/entries'),
    )
    // A route with a validator is listed once for each handler.
    expect([...new Set(routes.map((route) => `${route.method} ${route.path}`))].sort()).toEqual([
      'GET /api/grievances/:code/entries',
      'POST /api/grievances/:code/entries',
    ])
    const before = t.sqlite.prepare('select * from grievance_entries order by id').all()
    for (const cookie of [admin, superAdmin]) {
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        for (const target of [
          path,
          `${path}/2`,
          `${path}/${added.id}`,
          ...(method === 'PATCH' ? [] : [`/api/grievances/${made.code}`]),
        ]) {
          const res = await t.call(method, target, { cookie, body: { ...entry, title: 'Changed' } })
          expect([404, 405], `${method} ${target}`).toContain(res.status)
        }
      }
    }
    expect(t.sqlite.prepare('select * from grievance_entries order by id').all()).toEqual(before)
  })

  it('gives a grievance recorded before the timeline existed its first entry, from the migration', async () => {
    const t = await setup()
    t.sqlite
      .prepare(
        "insert into grievances (code, year, seq, title, short_description, body_html, body_text, date_made, owner_id, category_id, created_by_user_id, created_at, last_activity_at) values ('GR-2026-0001', 2026, 1, 'Old', 's', '<p>b</p>', 'b', '2026-10-01', ?, 1, ?, 1000, 1000)",
      )
      .run(t.person.id, t.superUser.id)
    const migration = fs.readFileSync(
      path.resolve(import.meta.dirname, '../db/migrations/0009_grievance_entries.sql'),
      'utf8',
    )
    const backfill = migration
      .split('--> statement-breakpoint')
      .find((statement) => statement.includes('INSERT INTO `grievance_entries`'))!
    t.sqlite.exec(backfill)
    expect(
      t.sqlite
        .prepare(
          'select seq, kind, title, occurred_at, recorded_at, documented_by_employee_id, documented_by_user_id, documented_by_label from grievance_entries',
        )
        .all(),
    ).toEqual([
      {
        seq: 1,
        kind: 'system',
        title: 'Grievance recorded',
        occurred_at: 1000,
        recorded_at: 1000,
        documented_by_employee_id: t.person.id,
        documented_by_user_id: t.superUser.id,
        documented_by_label: 'Priya Raghunathan',
      },
    ])
  })
})

describe("changing a grievance's status and owner", () => {
  const statusOf = (t: T) => (t.sqlite.prepare('select status from grievances').get() as { status: string }).status

  it('says whether the owner has an account that can sign in, and lists the employees who do', async () => {
    const { t, ines, owner, made, path } = await ownedFixture()
    expect((await t.call('GET', path, { cookie: owner })).data.ownerHasAccount).toBe(true)
    expect((await t.call('GET', '/api/grievances/account-holders')).status).toBe(401)
    expect((await t.call('GET', '/api/grievances/account-holders', { cookie: owner })).data).toEqual(
      [t.person.id, ines.id].sort((a, b) => a - b),
    )
    t.sqlite.prepare('update users set is_active = 0 where id = ?').run(t.adminUser.id)
    const res = await t.call('GET', `/api/grievances/${made.code}`, { cookie: await t.asSuper() })
    expect(res.data.ownerHasAccount).toBe(false)
    expect((await t.call('GET', '/api/grievances/account-holders', { cookie: await t.asSuper() })).data).toEqual([
      t.person.id,
    ])
  })

  it("lets the owner's account and a Super Admin move it between the four statuses, with a timeline entry and an audit entry each time", async () => {
    const { t, owner, superAdmin, path } = await ownedFixture()
    const moved = await t.call('POST', `${path}/status`, {
      cookie: owner,
      body: { status: 'in_progress', note: 'Meeting booked.\n\nRoom <b>2</b>' },
    })
    expect(moved.status).toBe(200)
    expect(moved.data.status).toBe('in_progress')
    expect(
      (await t.call('POST', `${path}/status`, { cookie: superAdmin, body: { status: 'resolved' } })).data.status,
    ).toBe('resolved')
    expect(
      (await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'closed', note: 'Agreed with Dana.' } }))
        .data.status,
    ).toBe('closed')
    // Reopening is a change like any other.
    expect((await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'open' } })).data.status).toBe(
      'open',
    )
    expect(timeline(t).slice(1)).toEqual([
      {
        seq: 2,
        kind: 'system',
        title: 'Status: Open → In progress',
        body_html: '<p>Meeting booked.</p><p>Room &lt;b&gt;2&lt;/b&gt;</p>',
        documented_by_label: 'Marcus Oyelaran',
      },
      {
        seq: 3,
        kind: 'system',
        title: 'Status: In progress → Resolved',
        body_html: '',
        documented_by_label: 'Priya Raghunathan',
      },
      {
        seq: 4,
        kind: 'system',
        title: 'Status: Resolved → Closed',
        body_html: '<p>Agreed with Dana.</p>',
        documented_by_label: 'Marcus Oyelaran',
      },
      { seq: 5, kind: 'system', title: 'Status: Closed → Open', body_html: '', documented_by_label: 'Marcus Oyelaran' },
    ])
    const title = 'Shift swaps refused without a reason'
    expect(audit(t)).toEqual(
      ['Open → In progress', 'In progress → Resolved', 'Resolved → Closed', 'Closed → Open'].map((change) => ({
        action: 'status',
        entity_type: 'grievance',
        details: `GR-2026-0001 · ${title} · Status: ${change}`,
      })),
    )
  })

  it('refuses a status change that breaks a rule and changes nothing', async () => {
    const { t, owner, path } = await ownedFixture()
    const closing = await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'closed', note: '  ' } })
    expect(closing.status).toBe(422)
    expect(closing.data.details.fields.note).toBe('Say why it is being closed')
    expect(
      (await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'voided', note: 'x' } })).status,
    ).toBe(422)
    expect(
      (await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'open', note: 'x'.repeat(2001) } }))
        .status,
    ).toBe(422)
    expect((await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'open' } })).data).toMatchObject({
      error: 'status_unchanged',
      message: 'GR-2026-0001 is already Open.',
    })
    expect(
      (await t.call('POST', '/api/grievances/GR-2026-0099/status', { cookie: owner, body: { status: 'resolved' } }))
        .status,
    ).toBe(404)
    expect(statusOf(t)).toBe('open')
    expect(timeline(t)).toHaveLength(1)
    expect(audit(t)).toEqual([])
  })

  it('answers 403 to any other account, for a status, an owner, an edit or a void, whatever it sends, and 401 to none', async () => {
    const { t, femi, other, owner, fields, path } = await ownedFixture()
    const reason = 'Only the owner (Ines Carvalho) or someone with Edit access to Grievances can do this.'
    for (const [method, target, body] of [
      ['POST', `${path}/status`, { status: 'resolved' }],
      ['POST', `${path}/owner`, { ownerId: femi.id }],
      ['PATCH', path, { ...fields, version: 1, reason: 'The title named the wrong month.', title: 'Changed' }],
    ] as const) {
      const res = await t.call(method, target, { cookie: other, body })
      expect(res.status, target).toBe(403)
      expect(res.data.message).toBe(reason)
      expect((await t.call(method, target, { body })).status).toBe(401)
    }
    // Voiding is for a Super Admin: not even the owner's account may.
    for (const cookie of [other, owner])
      expect((await t.call('POST', `${path}/void`, { cookie, body: { reason: 'Entered twice.' } })).status).toBe(403)
    expect(statusOf(t)).toBe('open')
    expect(stored(t)).toEqual({ title: 'Shift swaps refused without a reason', version: 1 })
    expect(timeline(t)).toHaveLength(1)
    expect(audit(t)).toEqual([])
  })

  it('lets Edit in Grievances manage any grievance, Full void it, and Read print it', async () => {
    const { t, femi, other, path } = await ownedFixture()
    expect((await t.call('POST', `${path}/exports`, { cookie: other, body: { format: 'pdf' } })).status).toBe(204)
    t.sqlite.prepare(`update users set access = '{"grievances":"edit"}' where email = 'n.haddad@bphs.local'`).run()
    expect((await t.call('POST', `${path}/status`, { cookie: other, body: { status: 'in_progress' } })).status).toBe(
      200,
    )
    expect((await t.call('POST', `${path}/owner`, { cookie: other, body: { ownerId: femi.id } })).status).toBe(200)
    const voiding = await t.call('POST', `${path}/void`, { cookie: other, body: { reason: 'Entered twice.' } })
    expect(voiding.data.message).toBe('You need Full access to Grievances for this.')
    t.sqlite.prepare(`update users set access = '{"grievances":"full"}' where email = 'n.haddad@bphs.local'`).run()
    expect(
      (await t.call('POST', `${path}/void`, { cookie: other, body: { reason: 'Entered twice.' } })).data.status,
    ).toBe('voided')
  })

  it("hands it to another owner, which ends the previous owner's say over it", async () => {
    const { t, ines, femi, owner, path } = await ownedFixture()
    const handed = await t.call('POST', `${path}/owner`, {
      cookie: owner,
      body: { ownerId: femi.id, note: 'Femi runs that team.' },
    })
    expect(handed.status).toBe(200)
    expect(handed.data).toMatchObject({ owner: { id: femi.id, name: 'Femi Adeyemi' }, ownerHasAccount: false })
    expect(timeline(t)[1]).toEqual({
      seq: 2,
      kind: 'system',
      title: 'Owner: Ines Carvalho → Femi Adeyemi',
      body_html: '<p>Femi runs that team.</p>',
      documented_by_label: 'Marcus Oyelaran',
    })
    expect(audit(t)).toEqual([
      {
        action: 'owner',
        entity_type: 'grievance',
        details: 'GR-2026-0001 · Shift swaps refused without a reason · Owner: Ines Carvalho → Femi Adeyemi',
      },
    ])
    const back = await t.call('POST', `${path}/owner`, { cookie: owner, body: { ownerId: ines.id } })
    expect(back.status).toBe(403)
    expect(back.data.message).toBe(
      'Only the owner (Femi Adeyemi) or someone with Edit access to Grievances can do this.',
    )
    expect((await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'resolved' } })).status).toBe(403)
  })

  it('refuses an owner who is the same, archived or unknown, and any new owner while it is Closed', async () => {
    const { t, ines, femi, owner, path } = await ownedFixture()
    const same = await t.call('POST', `${path}/owner`, { cookie: owner, body: { ownerId: ines.id } })
    expect(same.status).toBe(422)
    expect(same.data.details.fields.ownerId).toBe('Ines Carvalho already owns GR-2026-0001.')
    expect((await t.call('POST', `${path}/owner`, { cookie: owner, body: { ownerId: 9999 } })).status).toBe(422)
    expect((await t.call('POST', `${path}/owner`, { cookie: owner, body: {} })).data.details.fields.ownerId).toBe(
      'Choose an owner',
    )
    t.sqlite.prepare('update employees set archived_at = 1 where id = ?').run(femi.id)
    expect((await t.call('POST', `${path}/owner`, { cookie: owner, body: { ownerId: femi.id } })).status).toBe(422)
    t.sqlite.prepare('update employees set archived_at = null where id = ?').run(femi.id)
    await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'closed', note: 'Done.' } })
    expect((await t.call('POST', `${path}/owner`, { cookie: owner, body: { ownerId: femi.id } })).data).toMatchObject({
      error: 'grievance_sealed',
      message: 'GR-2026-0001 is Closed. Reopen it before changing its owner.',
    })
    expect(timeline(t)).toHaveLength(2)
  })

  it('is voided by a Super Admin with a reason, and after that nothing about it changes', async () => {
    const { t, femi, owner, superAdmin, path } = await ownedFixture()
    expect(
      (await t.call('POST', `${path}/void`, { cookie: superAdmin, body: { reason: ' ' } })).data.details.fields.reason,
    ).toBe('Required')
    const voided = await t.call('POST', `${path}/void`, {
      cookie: superAdmin,
      body: { reason: 'Entered twice; see GR-2026-0002.' },
    })
    expect(voided.status).toBe(200)
    expect(voided.data.status).toBe('voided')
    expect(timeline(t)[1]).toEqual({
      seq: 2,
      kind: 'system',
      title: 'Status: Open → Voided',
      body_html: '<p>Entered twice; see GR-2026-0002.</p>',
      documented_by_label: 'Priya Raghunathan',
    })
    expect(audit(t)).toEqual([
      {
        action: 'void',
        entity_type: 'grievance',
        details: 'GR-2026-0001 · Shift swaps refused without a reason · Status: Open → Voided',
      },
    ])
    for (const [action, body] of [
      ['status', { status: 'open' }],
      ['owner', { ownerId: femi.id }],
      ['void', { reason: 'Again.' }],
    ] as const) {
      const res = await t.call('POST', `${path}/${action}`, { cookie: superAdmin, body })
      expect(res.status, action).toBe(409)
      expect(res.data).toMatchObject({
        error: 'grievance_voided',
        message: 'GR-2026-0001 has been voided. It is kept as a record and cannot be changed.',
      })
    }
    expect((await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'open' } })).status).toBe(409)
    expect(timeline(t)).toHaveLength(2)
    // It leaves every tab but All.
    const list = (await t.call('GET', '/api/grievances?status=open', { cookie: owner })).data
    expect(list.rows).toEqual([])
    expect(list.counts).toMatchObject({ all: 1, open: 0, voided: 1 })
  })
})

describe('editing a grievance', () => {
  /** The owned grievance, with an edit of it that changes nothing yet. */
  async function one() {
    const fixture = await ownedFixture()
    return { ...fixture, edit: { ...fixture.fields, version: 1, reason: 'The title named the wrong month.' } }
  }

  it('replaces what the owner or a Super Admin changed, keeps what it said before as a version, and says which fields on the timeline and in the audit log', async () => {
    const { t, dana, ines, femi, owner, superAdmin, edit, path } = await one()
    expect((await t.call('GET', `${path}/versions`)).status).toBe(401)
    expect((await t.call('GET', `${path}/versions`, { cookie: owner })).data).toEqual([])
    const first = await t.call('PATCH', path, {
      cookie: owner,
      body: {
        ...edit,
        title: 'Shift swaps refused in August',
        body: '<p>Requests were refused on two dates.</p>',
        employeeIds: [dana.id, t.person.id],
      },
    })
    expect(first.status).toBe(200)
    expect(first.data).toMatchObject({
      title: 'Shift swaps refused in August',
      bodyHtml: '<p>Requests were refused on two dates.</p>',
      version: 2,
      status: 'open',
      owner: { id: ines.id },
    })
    expect(first.data.employees.map((person: any) => person.id).sort()).toEqual([dana.id, t.person.id].sort())
    expect(timeline(t)[1]).toEqual({
      seq: 2,
      kind: 'system',
      title: 'Edited: Title, Grievance, Employees involved',
      body_html: '<p>The title named the wrong month.</p>',
      documented_by_label: 'Marcus Oyelaran',
    })
    // Field names only: neither the old text nor the new, nor the reason.
    expect(audit(t)).toEqual([
      {
        action: 'update',
        entity_type: 'grievance',
        details: 'GR-2026-0001 · Shift swaps refused in August · Edited: Title, Grievance, Employees involved',
      },
    ])

    const second = await t.call('PATCH', path, {
      cookie: superAdmin,
      body: {
        ...edit,
        version: 2,
        title: 'Shift swaps refused in August',
        body: '<p>Requests were refused on two dates.</p>',
        dateMade: '2026-09-30',
        categoryId: 2,
        employeeIds: [dana.id],
        managementIds: [femi.id, t.person.id],
        reason: 'Date and category corrected.',
      },
    })
    expect(second.data).toMatchObject({ version: 3, dateMade: '2026-09-30', category: { id: 2 } })
    expect(timeline(t)[2]).toMatchObject({
      title: 'Edited: Date made, Category, Employees involved, Management involved',
      documented_by_label: 'Priya Raghunathan',
    })

    const versions = (await t.call('GET', `${path.toLowerCase()}/versions`, { cookie: await t.asSuper() })).data
    expect(versions.map((version: any) => version.version)).toEqual([2, 1])
    expect(versions[1]).toMatchObject({
      version: 1,
      title: 'Shift swaps refused without a reason',
      shortDescription: 'Three swap requests were turned down in September with no explanation.',
      dateMade: '2026-10-01',
      category: 'Conduct',
      employees: [{ code: 'E-2001', name: 'Dana Whitlock' }],
      management: [{ code: 'E-2002', name: 'Femi Adeyemi' }],
      changedBy: 'Marcus Oyelaran',
      reason: 'The title named the wrong month.',
    })
    expect(versions[1].bodyHtml).toContain('<strong>refused</strong>')
    expect(versions[0]).toMatchObject({
      version: 2,
      title: 'Shift swaps refused in August',
      bodyHtml: '<p>Requests were refused on two dates.</p>',
      changedBy: 'Priya Raghunathan',
      reason: 'Date and category corrected.',
    })
    expect(versions[0].employees).toHaveLength(2)
    expect((await t.call('GET', '/api/grievances/GR-2026-0099/versions', { cookie: owner })).status).toBe(404)
    // Search reads what it says now, not what it said.
    expect((await t.call('GET', '/api/grievances?q=two+dates', { cookie: owner })).data.rows).toHaveLength(1)
    expect((await t.call('GET', '/api/grievances?q=happened', { cookie: owner })).data.rows).toHaveLength(0)
  })

  it('refuses a save made from a version that has since been replaced, and one that changes nothing', async () => {
    const { t, owner, superAdmin, edit, path } = await one()
    expect((await t.call('PATCH', path, { cookie: superAdmin, body: { ...edit, title: 'First in' } })).status).toBe(200)
    const late = await t.call('PATCH', path, { cookie: owner, body: { ...edit, title: 'Second in' } })
    expect(late.status).toBe(409)
    expect(late.data).toMatchObject({
      error: 'stale_version',
      message: 'GR-2026-0001 was edited by Priya Raghunathan while you had it open. Nothing has been saved.',
    })
    const same = await t.call('PATCH', path, { cookie: owner, body: { ...edit, title: 'First in', version: 2 } })
    expect(same.status).toBe(409)
    expect(same.data.error).toBe('unchanged')
    expect(stored(t)).toEqual({ title: 'First in', version: 2 })
    expect(timeline(t)).toHaveLength(2)
    expect(t.sqlite.prepare('select count(*) as n from grievance_versions').get()).toEqual({ n: 1 })
  })

  it('refuses an edit that breaks a rule, saying which field', async () => {
    const { t, dana, femi, owner, edit, path } = await one()
    const refused = async (change: object) =>
      (await t.call('PATCH', path, { cookie: owner, body: { ...edit, ...change } })).data
    expect((await refused({ title: 'Changed', reason: ' ' })).details.fields.reason).toBe('Required')
    expect((await refused({ title: ' ' })).details.fields.title).toBeTruthy()
    expect((await refused({ body: '<p> </p>' })).details.fields.body).toBeTruthy()
    expect((await refused({ dateMade: '2999-01-01' })).details.fields.dateMade).toBeTruthy()
    expect((await refused({ employeeIds: [] })).details.fields.employeeIds).toBeTruthy()
    expect((await refused({ managementIds: [dana.id] })).details.fields.managementIds).toBeTruthy()
    expect((await refused({ version: undefined, title: 'Changed' })).details.fields.version).toBeTruthy()
    expect((await t.call('PATCH', path, { cookie: owner, body: { ...edit, categoryId: 999 } })).status).toBe(422)
    t.sqlite.prepare('update grievance_categories set is_active = 0 where id = 2').run()
    expect((await t.call('PATCH', path, { cookie: owner, body: { ...edit, categoryId: 2 } })).data.error).toBe(
      'category_inactive',
    )
    t.sqlite.prepare('update employees set archived_at = 1 where id = ?').run(t.person.id)
    expect((await refused({ managementIds: [femi.id, t.person.id] })).details.fields.managementIds).toBeTruthy()
    expect(stored(t)).toEqual({ title: 'Shift swaps refused without a reason', version: 1 })
    expect(timeline(t)).toHaveLength(1)
  })

  it('lets a person already named stay after they are archived, and a category no longer in use stay as it is', async () => {
    const { t, dana, owner, edit, path } = await one()
    t.sqlite.prepare('update employees set archived_at = 1 where id = ?').run(dana.id)
    t.sqlite.prepare('update grievance_categories set is_active = 0 where id = 1').run()
    const res = await t.call('PATCH', path, {
      cookie: owner,
      body: { ...edit, title: 'Shift swaps refused in August' },
    })
    expect(res.status).toBe(200)
    expect(res.data.employees).toMatchObject([{ id: dana.id, archived: true }])
    expect(res.data.category.id).toBe(1)
  })

  it('refuses an edit while it is Closed, and for good once it is Voided', async () => {
    const { t, owner, superAdmin, edit, path } = await one()
    await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'closed', note: 'Done.' } })
    const closed = await t.call('PATCH', path, { cookie: owner, body: { ...edit, title: 'Changed' } })
    expect(closed.status).toBe(409)
    expect(closed.data).toMatchObject({
      error: 'grievance_sealed',
      message: 'GR-2026-0001 is Closed. Reopen it before editing it.',
    })
    await t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'open' } })
    expect((await t.call('PATCH', path, { cookie: owner, body: { ...edit, title: 'Changed' } })).status).toBe(200)
    await t.call('POST', `${path}/void`, { cookie: superAdmin, body: { reason: 'Entered twice.' } })
    const voided = await t.call('PATCH', path, {
      cookie: superAdmin,
      body: { ...edit, version: 2, title: 'Changed again' },
    })
    expect(voided.status).toBe(409)
    expect(voided.data.error).toBe('grievance_voided')
    expect(stored(t)).toEqual({ title: 'Changed', version: 2 })
  })

  it('keeps every version as it was: the table refuses a change, a removal or a replacement, and no route offers one', async () => {
    const { t, owner, superAdmin, edit, path } = await one()
    await t.call('PATCH', path, { cookie: owner, body: { ...edit, title: 'Changed' } })
    const before = t.sqlite.prepare('select * from grievance_versions').all() as { id: number }[]
    expect(before).toHaveLength(1)
    expect(() => t.sqlite.prepare("update grievance_versions set title = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from grievance_versions').run()).toThrow(/append-only/)
    expect(() =>
      t.sqlite.prepare('insert or replace into grievance_versions select * from grievance_versions').run(),
    ).toThrow(/append-only/)
    const routes = (t.app.routes as { method: string; path: string }[]).filter((route) =>
      route.path.includes('/versions'),
    )
    expect([...new Set(routes.map((route) => `${route.method} ${route.path}`))]).toEqual([
      'GET /api/grievances/:code/versions',
    ])
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const target of [`${path}/versions`, `${path}/versions/1`])
        expect([404, 405], `${method} ${target}`).toContain(
          (await t.call(method, target, { cookie: superAdmin, body: {} })).status,
        )
    }
    expect(t.sqlite.prepare('select * from grievance_versions').all()).toEqual(before)
  })
})

describe('grievance guards on employees', () => {
  const entryBody = {
    kind: 'action',
    occurredAt: '2026-03-02T09:00:00.000Z',
    title: 'Met with Dana',
    shortDescription: 'A first meeting.',
    body: '<p>We met.</p>',
  }

  it('keeps whoever documented an entry from being deleted, for as long as their account is linked to them', async () => {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const writer = t.db
      .insert(employees)
      .values({ code: 'E-2005', firstName: 'Wren', lastName: 'Abara' })
      .returning()
      .get()
    t.sqlite.prepare('update users set employee_id = ? where id = ?').run(writer.id, t.adminUser.id)
    const cookie = await t.asSuper()
    const made = await t.call('POST', '/api/grievances', { cookie, body })
    expect(
      (
        await t.call('POST', `/api/grievances/${made.data.code}/entries`, {
          cookie: await t.asAdmin(),
          body: entryBody,
        })
      ).status,
    ).toBe(201)

    // The grievance is the reason given, ahead of the linked account, and it names nothing.
    const res = await t.call('DELETE', `/api/employees/${writer.id}`, { cookie })
    expect(res.status).toBe(409)
    expect(res.data.message).toMatch(/Named on a grievance\. Archive instead/)
    expect(res.data.message).not.toMatch(/GR-|Shift swaps|Met with Dana/)

    // An entry knows its writer by account. Once the account is unlinked nothing ties the employee to it; the entry keeps the name as text.
    t.sqlite.prepare('update users set employee_id = null where id = ?').run(t.adminUser.id)
    expect((await t.call('DELETE', `/api/employees/${writer.id}`, { cookie })).status).toBe(204)
    expect(
      t.sqlite
        .prepare('select documented_by_label as label from grievance_entries where documented_by_user_id = ?')
        .get(t.adminUser.id),
    ).toEqual({ label: 'Marcus Oyelaran' })
  })

  it('keeps the owner of a grievance that is not closed or voided from being archived, until it has another owner', async () => {
    const t = await setup()
    const { ines, body } = grievanceFixture(t)
    const cookie = await t.asSuper()
    const owner = t.db
      .insert(employees)
      .values({ code: 'E-2004', firstName: 'Owen', lastName: 'Marsh' })
      .returning()
      .get()
    const codes: string[] = []
    for (let i = 0; i < 3; i++)
      codes.push((await t.call('POST', '/api/grievances', { cookie, body: { ...body, ownerId: owner.id } })).data.code)
    const archive = () => t.call('POST', `/api/employees/${owner.id}/archive`, { cookie })
    const owned = async () =>
      ((await t.call('GET', '/api/employees', { cookie })).data as { id: number; openGrievancesOwned: number }[]).find(
        (row) => row.id === owner.id,
      )!.openGrievancesOwned

    const refused = await archive()
    expect(refused.status).toBe(409)
    expect(refused.data.error).toBe('owns_grievances')
    expect(refused.data.message).toBe(
      'Owen Marsh owns 3 grievances that are not closed. Give them to another owner before archiving.',
    )
    expect(refused.data.message).not.toMatch(/GR-|Shift swaps/)
    expect(await owned()).toBe(3)

    // Closing one, voiding one and handing the last to someone else each take it off the count. Resolved is still open to change, so it counts.
    expect(
      (
        await t.call('POST', `/api/grievances/${codes[0]}/status`, {
          cookie,
          body: { status: 'closed', note: 'Done.' },
        })
      ).status,
    ).toBe(200)
    expect(
      (await t.call('POST', `/api/grievances/${codes[1]}/void`, { cookie, body: { reason: 'Entered twice.' } })).status,
    ).toBe(200)
    expect(
      (
        await t.call('POST', `/api/grievances/${codes[2]}/status`, {
          cookie,
          body: { status: 'resolved', note: 'Agreed.' },
        })
      ).status,
    ).toBe(200)
    expect(await owned()).toBe(1)
    expect((await archive()).data.message).toBe(
      'Owen Marsh owns 1 grievance that is not closed. Give it to another owner before archiving.',
    )
    expect(
      (
        await t.call('POST', `/api/grievances/${codes[2]}/owner`, {
          cookie,
          body: { ownerId: ines.id, note: 'Owen is leaving.' },
        })
      ).status,
    ).toBe(200)
    expect(await owned()).toBe(0)

    const done = await archive()
    expect(done.status).toBe(200)
    expect(done.data.state).toBe('archived')
    // Someone only named on a grievance, or who owned one that is finished, is archived freely and is still not deletable.
    expect((await t.call('DELETE', `/api/employees/${owner.id}`, { cookie })).status).toBe(409)
  })
})

describe('reading the grievance audit log', () => {
  /** One grievance owned by Ines, whose account is the admin's, with one entry added by the Super Admin. */
  async function one() {
    const t = await setup()
    const { ines, femi, body } = grievanceFixture(t)
    t.sqlite.prepare('update users set employee_id = ? where id = ?').run(ines.id, t.adminUser.id)
    const [owner, superAdmin] = [await t.asAdmin(), await t.asSuper()]
    const made = (await t.call('POST', '/api/grievances', { cookie: owner, body: { ...body, ownerId: ines.id } }))
      .data as { id: number; code: string }
    const { ownerId: _, ...fields } = body
    return { t, femi, owner, superAdmin, made, fields, path: `/api/grievances/${made.code}` }
  }

  it('gets one entry in it, and none in the audit log, for every change to a grievance or a category', async () => {
    const { t, femi, owner, superAdmin, fields, path } = await one()
    const count = (table: string) => (t.sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n
    const category = (
      await t.call('POST', '/api/grievances/categories', { cookie: owner, body: { name: 'Rostering' } })
    ).data as { id: number }
    const changes: [string, () => ReturnType<T['call']>][] = [
      [
        'create',
        () =>
          t.call('POST', '/api/grievances', {
            cookie: owner,
            body: { ...fields, ownerId: femi.id, title: 'A second one' },
          }),
      ],
      ['create', () => t.call('POST', '/api/grievances/categories', { cookie: owner, body: { name: 'Overtime' } })],
      [
        'update',
        () =>
          t.call('PATCH', `/api/grievances/categories/${category.id}`, { cookie: owner, body: { name: 'Rosters' } }),
      ],
      ['delete', () => t.call('DELETE', `/api/grievances/categories/${category.id}`, { cookie: superAdmin })],
      [
        'entry',
        () =>
          t.call('POST', `${path}/entries`, {
            cookie: superAdmin,
            body: {
              kind: 'event',
              occurredAt: '2026-10-02T09:30:00.000Z',
              title: 'Met with Dana',
              shortDescription: 'Talked it through.',
            },
          }),
      ],
      [
        'update',
        () =>
          t.call('PATCH', path, {
            cookie: owner,
            body: { ...fields, title: 'Shift swaps refused in August', version: 1, reason: 'Wrong month.' },
          }),
      ],
      ['status', () => t.call('POST', `${path}/status`, { cookie: owner, body: { status: 'in_progress' } })],
      ['owner', () => t.call('POST', `${path}/owner`, { cookie: owner, body: { ownerId: femi.id } })],
      ['void', () => t.call('POST', `${path}/void`, { cookie: superAdmin, body: { reason: 'Entered twice.' } })],
    ]
    const audited = count('audit_log')
    for (const [action, change] of changes) {
      const before = count('grievance_audit_log')
      expect((await change()).status).toBeLessThan(300)
      expect(count('grievance_audit_log')).toBe(before + 1)
      expect(t.sqlite.prepare('select action from grievance_audit_log order by id desc limit 1').get()).toEqual({
        action,
      })
    }
    expect(count('audit_log')).toBe(audited)
  })

  it('lists entries newest first to either role, with the grievance and the timeline entry each one is about', async () => {
    const { t, owner, superAdmin, made, path } = await one()
    expect((await t.call('GET', '/api/grievances/audit')).status).toBe(401)
    await t.call('POST', `${path}/entries`, {
      cookie: superAdmin,
      body: {
        kind: 'event',
        occurredAt: '2026-10-02T09:30:00.000Z',
        title: 'Met with Dana',
        shortDescription: 'Talked it through.',
      },
    })
    await t.call('POST', '/api/grievances/categories', { cookie: owner, body: { name: 'Rostering' } })

    const res = await t.call('GET', '/api/grievances/audit', { cookie: owner })
    expect(res.status).toBe(200)
    expect(res.data.total).toBe(3)
    expect(res.data.entries).toMatchObject([
      {
        actor: 'm.oyelaran@bphs.local',
        action: 'create',
        entityType: 'category',
        details: 'Rostering',
        code: null,
        seq: null,
      },
      {
        actor: 'p.raghunathan@bphs.local',
        action: 'entry',
        entityType: 'grievance_entry',
        details: `${made.code} E02 · Met with Dana`,
        code: made.code,
        seq: 2,
      },
      { actor: 'm.oyelaran@bphs.local', action: 'create', entityType: 'grievance', code: made.code, seq: null },
    ])
    expect(res.data.entries[0].occurredAt).toMatch(/Z$/)
  })

  it('narrows by action, text and time, pages, and refuses an action it does not record', async () => {
    const { t, owner, superAdmin, made, path } = await one()
    await t.call('POST', `${path}/entries`, {
      cookie: superAdmin,
      body: {
        kind: 'event',
        occurredAt: '2026-10-02T09:30:00.000Z',
        title: 'Met with Dana',
        shortDescription: 'Talked it through.',
      },
    })
    const get = async (query: string) =>
      (await t.call('GET', `/api/grievances/audit${query}`, { cookie: owner })).data as {
        total: number
        entries: { action: string }[]
      }
    expect((await get('?action=entry')).entries.map((e) => e.action)).toEqual(['entry'])
    expect((await get('?q=Met%20with')).total).toBe(1)
    expect((await get('?q=p.raghunathan')).total).toBe(1)
    expect((await get(`?q=${made.code}`)).total).toBe(2)
    expect((await get('?to=2000-01-01T00:00:00Z')).total).toBe(0)
    expect(await get('?limit=1&offset=1')).toMatchObject({ total: 2, entries: [{ action: 'create' }] })
    expect((await t.call('GET', '/api/grievances/audit?action=issue', { cookie: owner })).status).toBe(422)
    // The other log's entries are not here, nor these there.
    expect((await t.call('GET', '/api/audit?q=Met%20with', { cookie: owner })).data.total).toBe(0)
  })

  it('exports the filtered entries as CSV, which Excel opens as text', async () => {
    const { t, owner, superAdmin, path } = await one()
    await t.call('POST', `${path}/entries`, {
      cookie: superAdmin,
      body: {
        kind: 'event',
        occurredAt: '2026-10-02T09:30:00.000Z',
        title: '=SUM(A1:A9)',
        shortDescription: 'Talked it through.',
      },
    })
    const res = await t.app.request('/api/grievances/audit.csv?action=entry', { headers: { cookie: owner } })
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="grievance-audit-log.csv"')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const lines = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('occurred_at,user,action,entity_type,entity_id,details')
    expect(lines.slice(1)).toEqual([
      expect.stringMatching(/,p\.raghunathan@bphs\.local,entry,grievance_entry,\d+,"?'?GR-.* E02 · =SUM\(A1:A9\)"?$/),
    ])
    expect((await t.app.request('/api/grievances/audit.csv')).status).toBe(401)
  })

  it('has no route that changes it', async () => {
    const t = await setup()
    const routes = (t.app.routes as { method: string; path: string }[]).filter((route) =>
      route.path.includes('/grievances/audit'),
    )
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.filter((route) => route.method !== 'GET' && route.method !== 'ALL')).toEqual([])
  })
})

describe('attaching files to a grievance', () => {
  const pdf = (name = 'letter.pdf', size = 100) =>
    new File([Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size)])], name, { type: 'application/pdf' })
  const txt = (name = 'notes.txt', text = 'Called Dana on Tuesday.') => new File([text], name, { type: 'text/plain' })
  const files = (t: T) =>
    t.sqlite
      .prepare(
        'select id, grievance_id, entry_id, filename, content_type, size, sha256, uploaded_by_label from grievance_attachments order by id',
      )
      .all() as { id: number; entry_id: number | null; filename: string; size: number; sha256: string }[]

  /** A multipart post, the way the page sends files: the JSON as `data`, the files as `files`, from this origin. */
  const send = (t: T, url: string, cookie: string, data: unknown, list: File[]) => {
    const form = new FormData()
    if (data !== undefined) form.set('data', JSON.stringify(data))
    for (const file of list) form.append('files', file)
    return t.app.request(url, { method: 'POST', headers: { cookie, origin: 'http://localhost' }, body: form })
  }

  async function one() {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const admin = await t.asAdmin()
    const made = (await t.call('POST', '/api/grievances', { cookie: admin, body })).data as { id: number; code: string }
    return { t, admin, body, made, url: `/api/grievances/${made.code}` }
  }

  it('takes files with a new grievance, with a new entry, and on their own, storing each one whole with one audit entry', async () => {
    const t = await setup()
    const { body } = grievanceFixture(t)
    const admin = await t.asAdmin()
    const created = await send(t, '/api/grievances', admin, body, [pdf(), txt()])
    expect(created.status).toBe(201)
    const made = (await created.json()) as { id: number; code: string }

    const entry = {
      kind: 'action',
      occurredAt: '2026-10-02T09:30:00.000Z',
      title: 'Met with Dana',
      shortDescription: 'Notes attached.',
    }
    const added = await send(t, `/api/grievances/${made.code}/entries`, admin, entry, [txt('minutes.txt')])
    expect(added.status).toBe(201)
    expect(await added.json()).toMatchObject({ seq: 2, title: 'Met with Dana' })

    const alone = await send(t, `/api/grievances/${made.code}/attachments`, admin, undefined, [
      pdf('scan.pdf'),
      txt('reply.txt'),
    ])
    expect(alone.status).toBe(201)
    expect(await alone.json()).toMatchObject([
      { filename: 'scan.pdf', contentType: 'application/pdf', entrySeq: 3, uploadedBy: 'Marcus Oyelaran' },
      { filename: 'reply.txt', contentType: 'text/plain', entrySeq: 3, uploadedBy: 'Marcus Oyelaran' },
    ])

    const entryId = (seq: number) =>
      (
        t.sqlite.prepare('select id from grievance_entries where grievance_id = ? and seq = ?').get(made.id, seq) as {
          id: number
        }
      ).id
    expect(files(t).map((f) => [f.filename, f.entry_id])).toEqual([
      ['letter.pdf', null],
      ['notes.txt', null],
      ['minutes.txt', entryId(2)],
      ['scan.pdf', entryId(3)],
      ['reply.txt', entryId(3)],
    ])
    expect(
      t.sqlite
        .prepare('select kind, title, short_description from grievance_entries where grievance_id = ? and seq = 3')
        .get(made.id),
    ).toEqual({ kind: 'system', title: '2 files attached', short_description: 'scan.pdf, reply.txt' })

    const stored = files(t)[1]!
    const bytes = get(t.db, stored.id)!
    expect(bytes.toString()).toBe('Called Dana on Tuesday.')
    expect([stored.size, stored.sha256]).toEqual([bytes.length, createHash('sha256').update(bytes).digest('hex')])
    expect(
      t.sqlite
        .prepare("select entity_type, entity_id, details from grievance_audit_log where action = 'attach' order by id")
        .all(),
    ).toEqual(
      files(t).map((f) => ({
        entity_type: 'grievance_attachment',
        entity_id: f.id,
        details: `${made.code} · ${f.filename}`,
      })),
    )
    // The Grievance Audit Log names the grievance a file belongs to, so the page can link to it.
    const audit = (await t.call('GET', '/api/grievances/audit?action=attach', { cookie: admin })).data as {
      entries: { code: string | null }[]
    }
    expect(audit.entries.map((e) => e.code)).toEqual(files(t).map(() => made.code))
  })

  it('refuses a file it does not take, saying so against the files, and writes nothing', async () => {
    const { t, admin, body, url } = await one()
    const count = () =>
      t.sqlite
        .prepare(
          'select (select count(*) from grievance_attachments) + (select count(*) from grievance_entries) + (select count(*) from grievances) as n',
        )
        .get()
    const before = count()
    const refused = async (to: string, data: unknown, list: File[], message: RegExp) => {
      const res = await send(t, to, admin, data, list)
      expect(res.status).toBe(422)
      const answer = (await res.json()) as { message: string; details: { fields: Record<string, string> } }
      expect(answer.message).toMatch(message)
      expect(answer.details.fields.files).toBe(answer.message)
    }
    await refused(
      `${url}/attachments`,
      undefined,
      [new File(['MZ'], 'run.exe')],
      /run\.exe is not a type that can be attached: PDF, PNG/,
    )
    await refused(
      `${url}/attachments`,
      undefined,
      [txt('fake.pdf')],
      /fake\.pdf is not the PDF file its name says it is/,
    )
    await refused(
      `${url}/attachments`,
      undefined,
      [new File([Buffer.from([0x89, 0x50, 0])], 'notes.txt')],
      /notes\.txt is not the TXT file/,
    )
    await refused(`${url}/attachments`, undefined, [new File([], 'empty.txt')], /empty\.txt is empty/)
    await refused(
      `${url}/attachments`,
      undefined,
      [pdf('huge.pdf', 10 * 1024 * 1024)],
      /huge\.pdf is larger than 10 MB/,
    )
    await refused(
      `${url}/attachments`,
      undefined,
      Array.from({ length: 11 }, (_, i) => txt(`n${i}.txt`)),
      /at most 10 files/,
    )
    await refused(`${url}/attachments`, undefined, [], /Choose a file/)
    await refused('/api/grievances', body, [pdf(), txt('fake.png')], /fake\.png/)
    expect(count()).toEqual(before)
    // A JSON post to the same route has no files to attach.
    expect((await t.call('POST', `${url}/attachments`, { cookie: admin, body: {} })).status).toBe(422)
  })

  it('refuses files on a grievance that is Closed or Voided, and from someone signed out or another site', async () => {
    const { t, admin, made, url } = await one()
    expect((await send(t, `${url}/attachments`, '', undefined, [txt()])).status).toBe(401)
    const crossSite = await t.app.request(`${url}/attachments`, {
      method: 'POST',
      headers: { cookie: admin, origin: 'https://evil.example' },
      body: (() => {
        const f = new FormData()
        f.append('files', txt())
        return f
      })(),
    })
    expect(crossSite.status).toBe(403)
    t.sqlite.prepare("update grievances set status = 'closed' where id = ?").run(made.id)
    const sealed = await send(t, `${url}/attachments`, admin, undefined, [txt()])
    expect(sealed.status).toBe(409)
    expect(await sealed.json()).toMatchObject({ error: 'grievance_sealed' })
    expect(files(t)).toEqual([])
  })

  it('takes a body of several megabytes on the routes that carry files, and keeps the usual limit everywhere else', async () => {
    const { t, admin, url } = await one()
    const big = pdf('big.pdf', 6 * 1024 * 1024)
    expect((await send(t, `${url}/attachments`, admin, undefined, [big])).status).toBe(201)
    expect((await send(t, '/api/assets', admin, { tag: 'A-1' }, [big])).status).toBe(413)
  })

  it('keeps every file as it was written: only a withdrawal changes a row, once, and the bytes never change', async () => {
    const { t, admin, url } = await one()
    await send(t, `${url}/attachments`, admin, undefined, [txt()])
    expect(() => t.sqlite.prepare("update grievance_attachments set filename = 'other.txt'").run()).toThrow(
      /only be withdrawn/,
    )
    expect(() => t.sqlite.prepare('update grievance_attachments set withdrawn_at = 1').run()).toThrow(
      /only be withdrawn/,
    )
    expect(() => t.sqlite.prepare('delete from grievance_attachments').run()).toThrow(/append-only/)
    expect(() =>
      t.sqlite.prepare('insert or replace into grievance_attachments select * from grievance_attachments').run(),
    ).toThrow(/append-only/)
    expect(() => t.sqlite.prepare("update grievance_attachment_data set bytes = x'00'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from grievance_attachment_data').run()).toThrow(/append-only/)
    expect(() =>
      t.sqlite
        .prepare('insert or replace into grievance_attachment_data select * from grievance_attachment_data')
        .run(),
    ).toThrow(/append-only/)
    t.sqlite.prepare("update grievance_attachments set withdrawn_at = 1, withdrawn_reason = 'Wrong file'").run()
    expect(() =>
      t.sqlite.prepare("update grievance_attachments set withdrawn_at = 2, withdrawn_reason = 'Again'").run(),
    ).toThrow(/only be withdrawn/)
  })

  it("keeps a file on an entry to that entry's grievance", async () => {
    const { t, admin, body, made } = await one()
    const other = (await t.call('POST', '/api/grievances', { cookie: admin, body })).data as { id: number }
    const otherEntry = (
      t.sqlite.prepare('select id from grievance_entries where grievance_id = ?').get(other.id) as { id: number }
    ).id
    const insert =
      "insert into grievance_attachments (grievance_id, entry_id, filename, content_type, size, sha256, uploaded_by_user_id, uploaded_by_label, uploaded_at) values (?, ?, 'a.txt', 'text/plain', 1, 'x', ?, 'x', 0)"
    expect(() => t.sqlite.prepare(insert).run(made.id, otherEntry, t.adminUser.id)).toThrow(/same grievance/)
  })

  it('lists the files and sends each one as a download, never shown in the page, logging every download', async () => {
    const { t, admin, body, url, made } = await one()
    await send(t, `${url}/attachments`, admin, undefined, [txt('notes – Dana.txt'), pdf()])
    const listed = (await t.call('GET', `${url}/attachments`, { cookie: admin })).data as { id: number }[]
    expect(listed).toMatchObject([
      {
        filename: 'notes – Dana.txt',
        size: 23,
        sha256: createHash('sha256').update('Called Dana on Tuesday.').digest('hex'),
        entrySeq: 2,
        uploadedBy: 'Marcus Oyelaran',
        withdrawnAt: null,
        withdrawnReason: null,
      },
      { filename: 'letter.pdf', entrySeq: 2 },
    ])

    const res = await t.app.request(`${url}/attachments/${listed[0]!.id}`, { headers: { cookie: admin } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="notes _ Dana.txt"; filename*=UTF-8''notes%20%E2%80%93%20Dana.txt`,
    )
    expect(await res.text()).toBe('Called Dana on Tuesday.')
    expect(
      t.sqlite.prepare("select entity_id, details from grievance_audit_log where action = 'download'").all(),
    ).toEqual([{ entity_id: listed[0]!.id, details: `${made.code} · notes – Dana.txt` }])
    expect(t.sqlite.prepare("select count(*) as n from audit_log where details like '%Dana%'").get()).toEqual({ n: 0 })

    // A file is found only under its own grievance.
    const other = (await t.call('POST', '/api/grievances', { cookie: admin, body })).data as { code: string }
    expect(
      (
        await t.app.request(`/api/grievances/${other.code}/attachments/${listed[0]!.id}`, {
          headers: { cookie: admin },
        })
      ).status,
    ).toBe(404)
    expect((await t.app.request(`${url}/attachments/${listed[0]!.id}`)).status).toBe(401)
  })

  it('lets a Super Admin withdraw a file with a reason: it stays listed and on the timeline, but can no longer be downloaded', async () => {
    const { t, admin, made, url } = await one()
    const superAdmin = await t.asSuper()
    const [file] = (await (await send(t, `${url}/attachments`, admin, undefined, [txt()])).json()) as { id: number }[]
    const withdraw = (cookie: string, body: unknown) =>
      t.call('POST', `${url}/attachments/${file!.id}/withdraw`, { cookie, body })

    expect((await withdraw(admin, { reason: 'Wrong file.' })).status).toBe(403)
    expect((await withdraw(superAdmin, { reason: ' ' })).status).toBe(422)
    const done = await withdraw(superAdmin, { reason: 'Wrong file.' })
    expect(done.status).toBe(200)
    expect(done.data).toMatchObject({
      filename: 'notes.txt',
      withdrawnReason: 'Wrong file.',
      withdrawnAt: expect.any(String),
    })
    expect((await withdraw(superAdmin, { reason: 'Again.' })).status).toBe(409)

    const listed = (await t.call('GET', `${url}/attachments`, { cookie: admin })).data
    expect(listed).toMatchObject([
      { filename: 'notes.txt', uploadedBy: 'Marcus Oyelaran', withdrawnReason: 'Wrong file.' },
    ])
    const gone = await t.app.request(`${url}/attachments/${file!.id}`, { headers: { cookie: admin } })
    expect(gone.status).toBe(410)
    expect(await gone.json()).toMatchObject({ error: 'attachment_withdrawn' })
    expect(
      t.sqlite
        .prepare(
          'select kind, title, short_description, body_text from grievance_entries where grievance_id = ? order by seq desc',
        )
        .get(made.id),
    ).toEqual({ kind: 'system', title: 'File withdrawn', short_description: 'notes.txt', body_text: 'Wrong file.' })
    expect(
      t.sqlite
        .prepare("select action, entity_id, details from grievance_audit_log where action in ('withdraw', 'download')")
        .all(),
    ).toEqual([{ action: 'withdraw', entity_id: file!.id, details: `${made.code} · notes.txt` }])
    // The bytes are kept, out of the app's reach.
    expect(get(t.db, file!.id)?.toString()).toBe('Called Dana on Tuesday.')
  })

  it('refuses a withdrawal on a grievance that is Closed or Voided, but still downloads its files', async () => {
    const { t, admin, made, url } = await one()
    const [file] = (await (await send(t, `${url}/attachments`, admin, undefined, [txt()])).json()) as { id: number }[]
    t.sqlite.prepare("update grievances set status = 'closed' where id = ?").run(made.id)
    const refused = await t.call('POST', `${url}/attachments/${file!.id}/withdraw`, {
      cookie: await t.asSuper(),
      body: { reason: 'Wrong file.' },
    })
    expect(refused.status).toBe(409)
    expect(refused.data).toMatchObject({ error: 'grievance_sealed' })
    expect((await t.app.request(`${url}/attachments/${file!.id}`, { headers: { cookie: admin } })).status).toBe(200)
  })
})
