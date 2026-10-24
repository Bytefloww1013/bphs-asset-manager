import { employees } from '#foundation/employees/server/index.ts'
import { ADMIN, setup } from '#kernel/testing/index.ts'
import { describe, expect, it } from 'vitest'
import { auditLog, writeAudit, type AuditInput } from './index.ts'

describe('writeAudit()', () => {
  // The Audit Log names each record by its entity type, so one no module declares would belong to nobody.
  it('refuses an entity type no module declares', async () => {
    const t = await setup()
    const before = t.db.select().from(auditLog).all().length
    const entityType = 'grievance' as AuditInput['entityType']
    expect(() => writeAudit(t.db, t.superUser, { action: 'create', entityType, entityId: 1 })).toThrow(
      'No module declares the audit entity type grievance',
    )
    expect(t.db.select().from(auditLog).all()).toHaveLength(before)
  })
})

describe('the Audit Log', () => {
  it('starts the audit CSV with the byte-order mark Excel needs, and keeps a cell from being read as a formula', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    await t.call('POST', '/api/asset-types', { cookie, body: { name: '=SUM(A1:A9)' } })
    const res = await t.app.request('/api/audit.csv', { headers: { cookie } })
    expect(res.headers.get('content-type')).toMatch(/text\/csv/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(text.slice(1)).toMatch(/^occurred_at,user,action,entity_type,entity_id,details\r\n/)
    expect(text).toContain(",'=SUM(A1:A9)\r\n")
  })

  it('the audit log is append-only at the database level', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    await t.call('POST', '/api/asset-types', { cookie, body: { name: 'Dock' } })
    expect(() => t.sqlite.prepare("update audit_log set details = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from audit_log').run()).toThrow(/append-only/)

    // Nor can an entry be renumbered, handed to someone else, or swapped for a new one under the same id.
    const first = t.sqlite.prepare('select * from audit_log order by id limit 1').get() as {
      id: number
      user_id: number
      details: string
    }
    const refused = [
      `update audit_log set id = 999999 where id = ${first.id}`,
      `update audit_log set user_id = ${t.adminUser.id} where id = ${first.id}`,
      `update or replace audit_log set details = 'tampered' where id = ${first.id}`,
      `insert or replace into audit_log (id, occurred_at, actor, action, entity_type, details) values (${first.id}, 0, 'x', 'create', 'x', 'swapped')`,
      `replace into audit_log (id, occurred_at, actor, action, entity_type, details) values (${first.id}, 0, 'x', 'create', 'x', 'swapped')`,
      `insert into audit_log (id, occurred_at, actor, action, entity_type, details) values (${first.id}, 0, 'x', 'create', 'x', 'swapped')`,
    ]
    for (const statement of refused)
      expect(() => t.sqlite.prepare(statement).run(), statement).toThrow(/append-only|UNIQUE/)
    expect(t.sqlite.prepare('select * from audit_log where id = ?').get(first.id)).toEqual(first)

    // Still let through: new entries, and (below) the foreign key clearing user_id when that user is deleted.
    const before = (t.sqlite.prepare('select count(*) as n from audit_log').get() as { n: number }).n
    await t.call('POST', '/api/asset-types', { cookie, body: { name: 'Cable' } })
    expect((t.sqlite.prepare('select count(*) as n from audit_log').get() as { n: number }).n).toBe(before + 1)

    t.sqlite.prepare('delete from sessions').run()
    t.sqlite.prepare('delete from users where id = ?').run(t.superUser.id)
    expect(t.sqlite.prepare('select user_id, details from audit_log where id = ?').get(first.id)).toEqual({
      user_id: null,
      details: first.details,
    })
  })

  it('filters the audit log by the instants the viewer asks for, whatever zone the server is in', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const record = (at: string, details: string) =>
      t.db
        .insert(auditLog)
        .values({
          occurredAt: new Date(at),
          actor: 'probe',
          action: 'create',
          entityType: 'asset',
          entityId: 1,
          details,
        })
        .run()
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
      for (const [name, offset] of [
        ['UTC', 0],
        ['America/New_York', 240],
        ['Pacific/Auckland', -780],
      ] as const) {
        process.env.TZ = name
        // The server really is in that zone, so the answers below mean something.
        expect(new Date(2026, 9, 9).getTimezoneOffset()).toBe(offset)

        const page = await t.call('GET', `/api/audit?${day}`, { cookie })
        expect(page.data.entries.map((e: { details: string }) => e.details).sort(), name).toEqual(expected)
        expect(page.data.total, name).toBe(3)
        const csv = await (await t.app.request(`/api/audit.csv?${day}`, { headers: { cookie } })).text()
        expect(
          expected.every((details) => csv.includes(details)),
          name,
        ).toBe(true)
        expect(csv).not.toContain('the 10th starts')
      }
    } finally {
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }

    // Either end can be left open, and an offset other than Z is understood: all three of these are midnight at the start of 10 October in UTC.
    for (const from of ['2026-10-10T00:00:00Z', '2026-10-09T20:00:00-04:00', '2026-10-10T05:30:00%2B05:30']) {
      const page = await t.call('GET', `/api/audit?from=${from}`, { cookie })
      // The sign-in at the top of this test is in the log as well, and it is later than all of these.
      const probes = page.data.entries.filter((e: { actor: string }) => e.actor === 'probe')
      expect(probes.map((e: { details: string }) => e.details).sort(), from).toEqual([
        'evening of the 9th',
        'the 10th starts',
        'the 9th ends',
      ])
    }
    const to = await t.call('GET', '/api/audit?to=2026-10-09T04:00:00.000Z', { cookie })
    expect(to.data.entries.map((e: { details: string }) => e.details)).toEqual(['one ms before the 9th starts'])

    // A date without a time is no longer an answer to "when", and says so instead of being read in some zone.
    expect((await t.call('GET', '/api/audit?from=2026-10-09', { cookie })).status).toBe(422)
    expect((await t.call('GET', '/api/audit?to=not-a-time', { cookie })).status).toBe(422)
  })
})

describe('entries', () => {
  it('records who acted by email and names the record and its old and new values in each entry', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const entries = async (query = '') =>
      (await t.call('GET', `/api/audit${query}`, { cookie })).data.entries as {
        actor: string
        action: string
        entityType: string
        details: string
      }[]
    const latest = async () => (await entries())[0]!

    // Two accounts whose emails share the part before the @ are two actors.
    const person = (code: string, firstName: string, lastName: string) =>
      t.db.insert(employees).values({ code, firstName, lastName }).returning().get().id
    const one = await t.call('POST', '/api/users', {
      cookie,
      body: {
        name: 'Pat One',
        email: 'pat@a.example',
        access: ADMIN,
        superAdmin: false,
        employeeId: person('E-1990', 'Pat', 'One'),
      },
    })
    const two = await t.call('POST', '/api/users', {
      cookie,
      body: {
        name: 'Pat Two',
        email: 'pat@b.example',
        access: ADMIN,
        superAdmin: false,
        employeeId: person('E-1991', 'Pat', 'Two'),
      },
    })
    for (const made of [one, two]) {
      const signedIn = await t.signIn(made.data.user.email, made.data.oneTimePassword)
      expect(
        (
          await t.call('POST', '/api/auth/password-change', {
            cookie: signedIn.cookie,
            body: { currentPassword: made.data.oneTimePassword, newPassword: 'Brand-new-1!' },
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await t.call('POST', '/api/asset-types', {
            cookie: signedIn.cookie,
            body: { name: `Type of ${made.data.user.name}` },
          })
        ).status,
      ).toBe(201)
    }
    const types = await entries('?q=Type%20of')
    expect(types.map((e) => `${e.actor} added ${e.details}`).sort()).toEqual([
      'pat@a.example added Type of Pat One',
      'pat@b.example added Type of Pat Two',
    ])
    expect(
      (await entries('?q=pat%40a.example')).every(
        (e) => e.actor === 'pat@a.example' || e.details.includes('pat@a.example'),
      ),
    ).toBe(true)
    expect((await t.call('GET', '/api/audit.csv?q=Type%20of%20Pat%20Two', { cookie })).data).toContain(
      'pat@b.example,create,assettype',
    )

    // Changes to an account say which account, and what it was linked to before and after.
    const other = t.db
      .insert(employees)
      .values({ code: 'E-2000', firstName: 'Lee', lastName: 'Okoro' })
      .returning()
      .get()
    const patId = one.data.user.id
    await t.call('PATCH', `/api/users/${patId}`, {
      cookie,
      body: { name: 'Pat First', superAdmin: true, employeeId: other.id },
    })
    expect(await latest()).toMatchObject({
      actor: 'p.raghunathan@bphs.local',
      details:
        'pat@a.example · name: Pat One → Pat First; access: Assets: Edit · Grievances: Edit · Employees: Edit → Super Admin; linked employee: E-1990 Pat One → E-2000 Lee Okoro',
    })
    const third = t.db
      .insert(employees)
      .values({ code: 'E-2002', firstName: 'Ana', lastName: 'Reyes' })
      .returning()
      .get()
    await t.call('PATCH', `/api/users/${patId}`, { cookie, body: { employeeId: third.id } })
    expect((await latest()).details).toBe('pat@a.example · linked employee: E-2000 Lee Okoro → E-2002 Ana Reyes')
    await t.call('POST', `/api/users/${patId}/reset-password`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · password reset · must change on next login')
    await t.call('POST', `/api/users/${patId}/clear-lock`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · locked_until cleared')
    await t.call('POST', `/api/users/${patId}/deactivate`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · deactivated')
    await t.call('POST', `/api/users/${patId}/reactivate`, { cookie })
    expect((await latest()).details).toBe('pat@a.example · reactivated')
    expect((await entries('?q=password%20changed')).map((e) => e.details).sort()).toEqual([
      'pat@a.example · password changed',
      'pat@b.example · password changed',
    ])

    // So do changes to an employee and to the two lists.
    await t.call('PATCH', `/api/employees/${other.id}`, { cookie, body: { code: 'E-2001', department: 'Ops' } })
    expect((await latest()).details).toBe('employee_id=E-2001 · employee_id: E-2000 → E-2001; department: — → Ops')
    const { assetTypes: typeList, conditionRatings: ratingList } = (await t.call('GET', '/api/lookups', { cookie }))
      .data
    await t.call('PATCH', `/api/asset-types/${typeList[0]!.id}`, { cookie, body: { isActive: false } })
    expect((await latest()).details).toBe(`${typeList[0]!.name} · active: true → false`)
    await t.call('PATCH', `/api/condition-ratings/${ratingList[0]!.id}`, { cookie, body: { name: 'Mint' } })
    expect((await latest()).details).toBe(`Mint · name: ${ratingList[0]!.name} → Mint`)

    // An entry written before emails were recorded holds only the part before the @. The log cannot be rewritten, so it is read
    // with the email of the account it points to; an entry with no account behind it is read as it was written.
    t.db
      .insert(auditLog)
      .values({
        occurredAt: new Date(),
        userId: t.adminUser.id,
        actor: 'm.oyelaran',
        action: 'create',
        entityType: 'asset',
        entityId: 1,
        details: 'an old entry',
      })
      .run()
    t.db
      .insert(auditLog)
      .values({
        occurredAt: new Date(),
        userId: null,
        actor: 'server-cli',
        action: 'update',
        entityType: 'user',
        entityId: 1,
        details: 'an old entry from the server',
      })
      .run()
    expect((await entries('?q=an%20old%20entry')).map((e) => e.actor).sort()).toEqual([
      'm.oyelaran@bphs.local',
      'server-cli',
    ])
    expect((await entries('?q=oyelaran%40bphs')).map((e) => e.details)).toContain('an old entry')
    expect(t.sqlite.prepare("select actor from audit_log where details = 'an old entry'").get()).toEqual({
      actor: 'm.oyelaran',
    })
    expect(
      (await t.call('GET', '/api/dashboard', { cookie })).data.recent.find(
        (e: { details: string }) => e.details === 'an old entry',
      ).actor,
    ).toBe('m.oyelaran@bphs.local')

    // The same email is shown wherever a person is named for what they did.
    const { assetBrands, conditionRatings } = (await t.call('GET', '/api/lookups', { cookie })).data
    const asset = (
      await t.call('POST', '/api/assets', {
        cookie,
        body: {
          tag: 'WHO-1',
          typeId: typeList[1]!.id,
          brandId: assetBrands[0]!.id,
          conditionRatingId: conditionRatings[0]!.id,
          holderId: t.person.id,
        },
      })
    ).data
    expect((await t.call('GET', '/api/assignments', { cookie })).data[0].issuedBy).toBe('p.raghunathan@bphs.local')
    const detail = (await t.call('GET', `/api/assets/tag/${asset.tag}`, { cookie })).data
    expect(detail.history[0].issuedBy).toBe('p.raghunathan@bphs.local')
    expect(detail.conditions[0].recordedBy).toBe('p.raghunathan@bphs.local')
  })
})
