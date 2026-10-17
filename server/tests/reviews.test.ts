import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Access } from '../../shared/constants.ts'
import { employees, users } from '../db/schema.ts'
import { nextReviewCode } from '../services/reviews.ts'
import { setup } from './helpers.ts'

/** Priya (Super Admin, E-1042) is signed in; Rhea Okafor conducts reviews of Dana Whitlock, and neither has an account yet. */
async function reviews() {
  const t = await setup()
  const employee = (code: string, firstName: string, lastName: string) => t.db.insert(employees).values({ code, firstName, lastName }).returning().get()
  const account = async (email: string, access: Access, employeeId: number | null = null) => {
    t.db.insert(users).values({ name: email, email, passwordHash: t.superUser.passwordHash, access, employeeId, mustChangePassword: false }).run()
    return (await t.signIn(email)).cookie
  }
  const reviewer = employee('E-4001', 'Rhea', 'Okafor')
  const dana = employee('E-4002', 'Dana', 'Whitlock')
  const superAdmin = await t.asSuper()
  const fields = {
    title: 'Missed handover',
    summary: 'Handover notes were not written.',
    reviewDate: '2026-10-01',
    reviewerId: reviewer.id,
    employeeId: dana.id,
    findings: 'Two handovers were missed.',
    body: '<p>What happened.</p>',
  }
  const create = (change: Partial<typeof fields> = {}, cookie = superAdmin) => t.call('POST', '/api/reviews', { cookie, body: { ...fields, ...change } })
  return { t, employee, account, reviewer, dana, superAdmin, fields, create }
}

const update = { kind: 'update', occurredAt: new Date().toISOString(), title: 'Spoke with Dana', shortDescription: 'Agreed a handover checklist.' }
const cap = (responsibleId: number, change: Record<string, unknown> = {}) => ({ title: 'Handover checklist', shortDescription: 'Write one and use it.', responsibleId, dueDate: '2026-11-02', ...change })

describe('the review audit log', () => {
  it('is append-only', async () => {
    const { t, create } = await reviews()
    await create()
    expect(() => t.sqlite.prepare("update review_audit_log set details = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from review_audit_log').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare("insert or replace into review_audit_log (id, occurred_at, actor, action, entity_type) values (1, 0, 'x', 'create', 'review')").run()).toThrow(
      /append-only/,
    )
  })

  // As with grievances: review code never writes to the other logs, and nothing else writes to this one.
  it('is written by review code only, which never writes to the audit log', () => {
    const server = path.resolve(import.meta.dirname, '..')
    const sources = (fs.readdirSync(server, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('tests' + path.sep))
      .map((file) => ({ file: file.split(path.sep).join('/'), text: fs.readFileSync(path.join(server, file), 'utf8') }))
    const isReview = (file: string) => path.basename(file).startsWith('review')
    expect(sources.filter((s) => isReview(s.file)).map((s) => s.file)).toContain('lib/review-audit.ts')
    expect(sources.filter((s) => isReview(s.file) && /\bwriteAudit\b|\bauditLog\b/.test(s.text)).map((s) => s.file)).toEqual([])
    expect(sources.filter((s) => !isReview(s.file) && s.file !== 'db/schema.ts' && /\bwriteReviewAudit\b|\breviewAuditLog\b/.test(s.text)).map((s) => s.file)).toEqual([])
  })
})

describe('recording a review', () => {
  it('numbers reviews by year, opens them, and logs them only to the review audit log', async () => {
    const { t, superAdmin, create, reviewer, dana } = await reviews()
    const year = new Date().getFullYear()
    const logs = () => t.sqlite.prepare('select (select count(*) from audit_log) as audit, (select count(*) from grievance_audit_log) as grievance').get()
    const before = logs()
    expect((await t.call('POST', '/api/reviews', { body: {} })).status).toBe(401)

    const res = await create()
    expect(res.status).toBe(201)
    expect(res.data).toMatchObject({
      code: `AR-${year}-0001`,
      status: 'open',
      version: 1,
      title: 'Missed handover',
      findings: 'Two handovers were missed.',
      bodyHtml: '<p>What happened.</p>',
      reviewer: { id: reviewer.id, code: 'E-4001', name: 'Rhea Okafor', archived: false },
      employee: { id: dana.id, code: 'E-4002', name: 'Dana Whitlock', archived: false },
      recordedBy: 'Priya Raghunathan',
      completedAt: null,
    })
    expect((await create()).data.code).toBe(`AR-${year}-0002`)
    expect(nextReviewCode(t.db, new Date(year + 1, 0, 1)).code).toBe(`AR-${year + 1}-0001`)

    const entries = (await t.call('GET', `/api/reviews/${res.data.code.toLowerCase()}/entries`, { cookie: superAdmin })).data
    expect(entries).toMatchObject([{ seq: 1, kind: 'system', title: 'Review created', documentedBy: 'Priya Raghunathan', corrects: null, correctedBy: [] }])
    expect(t.sqlite.prepare('select actor, action, entity_type, review_id, details from review_audit_log order by id limit 1').all()).toEqual([
      { actor: 'p.raghunathan@bphs.local', action: 'create', entity_type: 'review', review_id: res.data.id, details: `AR-${year}-0001 · Missed handover` },
    ])
    expect(logs()).toEqual(before)
  })

  it('refuses an archived person, the same person twice, a review of yourself, and an account without Edit', async () => {
    const { t, create, employee, account, reviewer } = await reviews()
    const gone = employee('E-4009', 'Gone', 'Away')
    t.sqlite.prepare('update employees set archived_at = 1 where id = ?').run(gone.id)
    for (const [change, field] of [
      [{ reviewerId: gone.id }, 'reviewerId'],
      [{ employeeId: gone.id }, 'employeeId'],
      [{ employeeId: reviewer.id }, 'employeeId'],
      [{ employeeId: t.person.id }, 'employeeId'],
      [{ reviewDate: '2999-01-01' }, 'reviewDate'],
    ] as const) {
      const res = await create(change)
      expect(res.status, JSON.stringify(change)).toBe(422)
      expect(JSON.stringify(res.data.details), JSON.stringify(change)).toContain(field)
    }
    expect((await create({ employeeId: t.person.id })).data.message).toBe('You cannot name yourself as the employee reviewed.')
    const reader = await account('reader@bphs.local', { reviews: 'read' }, employee('E-4010', 'Rea', 'Der').id)
    expect((await create({}, reader)).status).toBe(403)
    expect(t.sqlite.prepare('select count(*) as n from reviews').get()).toEqual({ n: 0 })
  })
})

describe('a review about you', () => {
  it('is not found by you, at any level, and is in none of your counts', async () => {
    const { t, superAdmin, create, employee, account } = await reviews()
    const editor = await account('editor@bphs.local', { reviews: 'edit' }, employee('E-4003', 'Eda', 'Mensah').id)
    const about = (await create({ employeeId: t.person.id }, editor)).data
    const other = (await create({}, editor)).data
    const path = `/api/reviews/${about.code}`
    expect((await t.call('GET', path, { cookie: editor })).status).toBe(200)
    const made = (await t.call('POST', `${path}/caps`, { cookie: editor, body: cap(about.reviewer.id) })).data
    await t.call('POST', `/api/reviews/${other.code}/caps`, { cookie: editor, body: cap(about.reviewer.id, { title: 'Visible' }) })

    for (const [method, target, body] of [
      ['GET', path, undefined],
      ['GET', `${path}/entries`, undefined],
      ['PATCH', path, { ...about, reviewerId: about.reviewer.id, employeeId: about.employee.id, body: about.bodyHtml, title: 'Changed' }],
      ['POST', `${path}/entries`, update],
      ['GET', `${path}/caps`, undefined],
      ['POST', `${path}/caps`, cap(about.reviewer.id)],
      ['GET', `${path}/caps/CAP01`, undefined],
      ['PATCH', `${path}/caps/CAP01`, { ...cap(about.reviewer.id, { title: 'Changed' }), version: made.version }],
      ['POST', `${path}/caps/CAP01/status`, { status: 'completed', version: made.version }],
    ] as const) {
      const res = await t.call(method, target, { cookie: superAdmin, body })
      expect(res.status, `${method} ${target}`).toBe(404)
      expect(res.data.message).toBe('Review not found.')
    }
    const list = (await t.call('GET', '/api/reviews', { cookie: superAdmin })).data
    expect(list.rows.map((row: { code: string }) => row.code)).toEqual([other.code])
    expect(list.counts.all).toBe(1)
    expect(list.employees.map((person: { name: string }) => person.name)).toEqual(['Dana Whitlock'])
    expect((await t.call('GET', `/api/reviews?q=${about.code}`, { cookie: superAdmin })).data.counts.all).toBe(0)
    expect((await t.call('GET', '/api/reviews', { cookie: editor })).data.counts.all).toBe(2)
    const items = async (cookie: string) => (await t.call('GET', '/api/reviews/action-items', { cookie })).data.map((item: { title: string }) => item.title)
    expect(await items(superAdmin)).toEqual(['Visible'])
    expect(await items(editor)).toEqual(['Handover checklist', 'Visible'])
  })
})

describe('editing a review', () => {
  const edit = (made: { title: string; summary: string; reviewDate: string; reviewer: { id: number }; employee: { id: number }; findings: string; bodyHtml: string; version: number }) => ({
    title: made.title,
    summary: made.summary,
    reviewDate: made.reviewDate,
    reviewerId: made.reviewer.id,
    employeeId: made.employee.id,
    findings: made.findings,
    body: made.bodyHtml,
    version: made.version,
  })

  it('keeps what it said before in its history, and refuses a stale or empty save', async () => {
    const { t, superAdmin, create } = await reviews()
    const made = (await create()).data
    const path = `/api/reviews/${made.code}`
    const res = await t.call('PATCH', path, { cookie: superAdmin, body: { ...edit(made), title: 'Missed <handover>', findings: 'Three handovers were missed.' } })
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ version: 2, title: 'Missed <handover>', findings: 'Three handovers were missed.' })

    const entries = (await t.call('GET', `${path}/entries`, { cookie: superAdmin })).data
    expect(entries[1]).toMatchObject({ seq: 2, kind: 'system', title: 'Edited: Title, Findings', documentedBy: 'Priya Raghunathan' })
    expect(entries[1].bodyHtml).toContain('<strong>Title:</strong> Missed handover → Missed &lt;handover&gt;')
    expect(entries[1].bodyHtml).toContain('<h3>Findings before</h3><p>Two handovers were missed.</p>')
    expect(entries[1].bodyHtml).not.toContain('Review body before')
    expect(t.sqlite.prepare("select details from review_audit_log where action = 'update'").all()).toEqual([
      { details: `${made.code} · Missed <handover> · Edited: Title, Findings` },
    ])

    const late = await t.call('PATCH', path, { cookie: superAdmin, body: { ...edit(made), summary: 'Something else.' } })
    expect(late.status).toBe(409)
    expect(late.data).toMatchObject({ error: 'stale_version', message: `${made.code} was edited by Priya Raghunathan while you had it open. Nothing has been saved.`, details: { version: 2 } })
    const same = await t.call('PATCH', path, { cookie: superAdmin, body: edit(res.data) })
    expect(same.status).toBe(409)
    expect(same.data.error).toBe('unchanged')

    t.sqlite.prepare("update reviews set status = 'voided' where id = ?").run(made.id)
    expect((await t.call('PATCH', path, { cookie: superAdmin, body: { ...edit(res.data), title: 'Again' } })).data.error).toBe('review_voided')
    expect((await t.call('POST', `${path}/entries`, { cookie: superAdmin, body: update })).data.error).toBe('review_voided')
    expect((await t.call('GET', `${path}/entries`, { cookie: superAdmin })).data).toHaveLength(2)
  })

  it('is open to the reviewer at Read Only, and to no other reader', async () => {
    const { t, create, employee, account, reviewer } = await reviews()
    const rhea = await account('rhea@bphs.local', { reviews: 'read' }, reviewer.id)
    const other = await account('other@bphs.local', { reviews: 'read' }, employee('E-4004', 'Olu', 'Bello').id)
    const made = (await create()).data
    const path = `/api/reviews/${made.code}`

    for (const cookie of [rhea, other]) expect((await t.call('GET', path, { cookie })).status).toBe(200)
    const refused = await t.call('PATCH', path, { cookie: other, body: { ...edit(made), title: 'Changed' } })
    expect(refused.status).toBe(403)
    expect(refused.data.message).toContain('Rhea Okafor')
    expect((await t.call('POST', `${path}/entries`, { cookie: other, body: update })).status).toBe(403)

    expect((await t.call('PATCH', path, { cookie: rhea, body: { ...edit(made), title: 'Changed' } })).status).toBe(200)
    const added = await t.call('POST', `${path}/entries`, { cookie: rhea, body: update })
    expect(added.status).toBe(201)
    expect(added.data).toMatchObject({ seq: 3, kind: 'update', title: 'Spoke with Dana', documentedBy: 'rhea@bphs.local' })
  })
})

describe('a review history', () => {
  it('takes an update and a correction of one, and never a correction of an automatic entry', async () => {
    const { t, superAdmin, create } = await reviews()
    const made = (await create()).data
    const path = `/api/reviews/${made.code}/entries`
    const correction = (correctsSeq: number) => ({ kind: 'correction', correctsSeq, title: 'Wrong day', shortDescription: 'It was the Tuesday.' })

    expect((await t.call('POST', path, { cookie: superAdmin, body: correction(1) })).data).toMatchObject({ message: 'An automatic entry cannot be corrected.', details: { field: 'correctsSeq' } })
    expect((await t.call('POST', path, { cookie: superAdmin, body: correction(9) })).data.message).toBe(`${made.code} has no entry E09 to correct.`)
    expect((await t.call('POST', path, { cookie: superAdmin, body: update })).status).toBe(201)
    const fixed = await t.call('POST', path, { cookie: superAdmin, body: correction(2) })
    expect(fixed.status).toBe(201)
    expect(fixed.data).toMatchObject({ seq: 3, kind: 'correction', corrects: 2 })

    const entries = (await t.call('GET', path, { cookie: superAdmin })).data
    expect(entries.map((entry: { seq: number; corrects: number | null; correctedBy: number[] }) => [entry.seq, entry.corrects, entry.correctedBy])).toEqual([
      [1, null, []],
      [2, null, [3]],
      [3, 2, []],
    ])
    expect(t.sqlite.prepare("select details from review_audit_log where action = 'entry' order by id").all()).toEqual([
      { details: `${made.code} E02 · Spoke with Dana` },
      { details: `${made.code} E03 · Wrong day` },
    ])
  })

  it('is kept by the database as it was written, each entry on its own review', async () => {
    const { t, create } = await reviews()
    const made = (await create()).data
    const other = (await create()).data
    expect(() => t.sqlite.prepare("update review_entries set title = 'x'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from review_entries').run()).toThrow(/append-only/)
    const insert =
      "insert or replace into review_entries (id, review_id, seq, kind, corrects_entry_id, occurred_at, recorded_at, title, short_description, body_html, body_text, documented_by_user_id, documented_by_label) values (?, ?, 9, 'correction', ?, 0, 0, 't', '', '', '', ?, 'x')"
    const foreign = t.sqlite.prepare('select id from review_entries where review_id = ?').get(other.id) as { id: number }
    expect(() => t.sqlite.prepare(insert).run(foreign.id, other.id, foreign.id, t.superUser.id)).toThrow(/append-only/)
    expect(() => t.sqlite.prepare(insert).run(null, made.id, foreign.id, t.superUser.id)).toThrow(/same review/)
  })

  it('has no route that changes or removes an entry, and none is changed by trying', async () => {
    const { t, superAdmin, create } = await reviews()
    const made = (await create()).data
    const path = `/api/reviews/${made.code}/entries`
    const added = (await t.call('POST', path, { cookie: superAdmin, body: update })).data as { id: number }
    const routes = (t.app.routes as { method: string; path: string }[]).filter((route) => route.path.startsWith('/api/reviews') && route.path.includes('/entries'))
    // A route with a validator is listed once for each handler.
    expect([...new Set(routes.map((route) => `${route.method} ${route.path}`))].sort()).toEqual(['GET /api/reviews/:code/entries', 'POST /api/reviews/:code/entries'])
    const before = t.sqlite.prepare('select * from review_entries order by id').all()
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      for (const target of [path, `${path}/2`, `${path}/${added.id}`, ...(method === 'PATCH' ? [] : [`/api/reviews/${made.code}`])]) {
        const res = await t.call(method, target, { cookie: superAdmin, body: { ...update, title: 'Changed' } })
        expect([404, 405], `${method} ${target}`).toContain(res.status)
      }
    }
    expect(t.sqlite.prepare('select * from review_entries order by id').all()).toEqual(before)
  })
})

describe('the reviews list', () => {
  it('counts every match by status, shows one tab, and finds by ID, title and name', async () => {
    const { t, superAdmin, create, employee, dana } = await reviews()
    const sam = employee('E-4005', 'Sam', 'Ferreira')
    const first = (await create()).data
    const second = (await create({ title: 'Late timesheets', employeeId: sam.id })).data
    const third = (await create({ title: 'Unsafe lifting', reviewerId: sam.id })).data
    t.sqlite.prepare("update reviews set status = 'in_progress' where id = ?").run(second.id)
    t.sqlite.prepare("update reviews set status = 'voided' where id = ?").run(third.id)
    const list = async (query = '') => (await t.call('GET', `/api/reviews${query}`, { cookie: superAdmin })).data
    const codes = async (query = '') => (await list(query)).rows.map((row: { code: string }) => row.code)

    const all = await list()
    expect(all.counts).toEqual({ all: 3, open: 1, in_progress: 1, completed: 0, voided: 1 })
    expect(all.rows.map((row: { code: string }) => row.code)).toEqual([third.code, second.code, first.code])
    expect(all.rows[2]).toMatchObject({ title: 'Missed handover', caps: { done: 0, total: 0 }, nextDue: null, reviewer: { name: 'Rhea Okafor' }, employee: { name: 'Dana Whitlock' } })
    expect(all.reviewers.map((person: { name: string }) => person.name)).toEqual(['Sam Ferreira', 'Rhea Okafor'])
    expect(all.employees.map((person: { name: string }) => person.name)).toEqual(['Sam Ferreira', 'Dana Whitlock'])

    expect(await codes('?status=open')).toEqual([first.code])
    expect(await codes('?status=voided')).toEqual([third.code])
    expect(await codes(`?q=${second.code.toLowerCase()}`)).toEqual([second.code])
    expect(await codes('?q=lifting')).toEqual([third.code])
    expect(await codes(`?q=${encodeURIComponent('sam ferreira')}`)).toEqual([third.code, second.code])
    expect(await codes(`?reviewer=${sam.id}`)).toEqual([third.code])
    expect(await codes(`?employee=${dana.id}&status=open`)).toEqual([first.code])
    expect(await codes('?to=2026-09-30')).toEqual([])
    expect((await list('?q=lifting&status=open')).counts).toEqual({ all: 1, open: 0, in_progress: 0, completed: 0, voided: 1 })
    expect((await t.call('GET', '/api/reviews?status=closed', { cookie: superAdmin })).status).toBe(422)
  })
})

describe('corrective action plans', () => {
  it('are numbered on their review, start Not started, and are each on the history', async () => {
    const { t, superAdmin, create, reviewer, dana } = await reviews()
    const made = (await create()).data
    const path = `/api/reviews/${made.code}`
    const first = await t.call('POST', `${path}/caps`, { cookie: superAdmin, body: cap(reviewer.id, { body: '<p>Use it every shift.</p>' }) })
    expect(first.status).toBe(201)
    expect(first.data).toMatchObject({
      seq: 1,
      status: 'not_started',
      version: 1,
      title: 'Handover checklist',
      bodyHtml: '<p>Use it every shift.</p>',
      responsible: { id: reviewer.id, name: 'Rhea Okafor' },
      dueDate: '2026-11-02',
      addedBy: 'Priya Raghunathan',
      completedAt: null,
      completedBy: null,
    })
    const second = (await t.call('POST', `${path}/caps`, { cookie: superAdmin, body: cap(dana.id, { title: 'Shadow a shift', dueDate: null }) })).data
    expect(second.seq).toBe(2)
    expect((await t.call('POST', `/api/reviews/${(await create()).data.code}/caps`, { cookie: superAdmin, body: cap(dana.id) })).data.seq).toBe(1)

    for (const address of ['CAP01', 'cap1', '1', '01']) expect((await t.call('GET', `${path}/caps/${address}`, { cookie: superAdmin })).data.id, address).toBe(first.data.id)
    for (const address of ['CAP09', 'CAP00', 'x']) expect((await t.call('GET', `${path}/caps/${address}`, { cookie: superAdmin })).status, address).toBe(404)
    expect((await t.call('GET', `${path}/caps`, { cookie: superAdmin })).data.map((one: { seq: number }) => one.seq)).toEqual([1, 2])

    const onCap = await t.call('POST', `${path}/entries`, { cookie: superAdmin, body: { ...update, capSeq: 2 } })
    expect(onCap.data).toMatchObject({ seq: 4, kind: 'update', cap: 2 })
    expect((await t.call('POST', `${path}/entries`, { cookie: superAdmin, body: { ...update, capSeq: 9 } })).data).toMatchObject({ message: `${made.code} has no CAP09.`, details: { field: 'capSeq' } })
    const fixed = await t.call('POST', `${path}/entries`, { cookie: superAdmin, body: { kind: 'correction', correctsSeq: 4, title: 'Wrong shift', shortDescription: 'It was the night shift.' } })
    expect(fixed.data).toMatchObject({ seq: 5, cap: 2, corrects: 4 })

    const entries = (await t.call('GET', `${path}/entries`, { cookie: superAdmin })).data
    expect(entries.map((entry: { seq: number; cap: number | null; title: string }) => [entry.seq, entry.cap, entry.title])).toEqual([
      [1, null, 'Review created'],
      [2, 1, 'CAP01 added: Handover checklist. Responsible: Rhea Okafor. Due: 11/02/2026.'],
      [3, 2, 'CAP02 added: Shadow a shift. Responsible: Dana Whitlock.'],
      [4, 2, 'Spoke with Dana'],
      [5, 2, 'Wrong shift'],
    ])
    expect(t.sqlite.prepare("select entity_type, review_id, details from review_audit_log where action = 'create' and entity_type = 'cap' order by id limit 2").all()).toEqual([
      { entity_type: 'cap', review_id: made.id, details: `${made.code} CAP01 · Handover checklist` },
      { entity_type: 'cap', review_id: made.id, details: `${made.code} CAP02 · Shadow a shift` },
    ])
    // A CAP is cancelled, never removed.
    expect((await t.call('DELETE', `${path}/caps/CAP01`, { cookie: superAdmin })).status).toBe(404)
  })

  it('keep each edit and status change on the history, stamp completion, and refuse a stale or closed one', async () => {
    const { t, superAdmin, create, reviewer, dana, employee } = await reviews()
    const made = (await create()).data
    const path = `/api/reviews/${made.code}/caps`
    const added = (await t.call('POST', path, { cookie: superAdmin, body: cap(reviewer.id) })).data
    const gone = employee('E-4009', 'Gone', 'Away')
    t.sqlite.prepare('update employees set archived_at = 1 where id = ?').run(gone.id)
    const edit = (change: Record<string, unknown>, version: number) => t.call('PATCH', `${path}/CAP01`, { cookie: superAdmin, body: { ...cap(reviewer.id), ...change, version } })
    const status = (body: Record<string, unknown>) => t.call('POST', `${path}/CAP01/status`, { cookie: superAdmin, body })

    expect((await edit({ responsibleId: gone.id }, 1)).data.details.field).toBe('responsibleId')
    expect((await edit({}, 1)).data.error).toBe('unchanged')
    const edited = await edit({ title: 'Handover <list>', responsibleId: dana.id, dueDate: null, body: '<p>New.</p>' }, 1)
    expect(edited.data).toMatchObject({ version: 2, title: 'Handover <list>', responsible: { name: 'Dana Whitlock' }, dueDate: null })
    const stale = await edit({ title: 'Again' }, 1)
    expect(stale.data).toMatchObject({ error: 'stale_version', message: 'CAP01 was changed by Priya Raghunathan while you had it open. Nothing has been saved.', details: { version: 2 } })

    expect((await status({ status: 'not_started', version: 2 })).data.error).toBe('status_unchanged')
    expect((await status({ status: 'cancelled', version: 2 })).data.details.fields).toHaveProperty('note')
    const done = await status({ status: 'completed', note: 'Checklist is in use.', version: 2 })
    expect(done.data).toMatchObject({ status: 'completed', version: 3, completedBy: 'Priya Raghunathan' })
    expect(done.data.completedAt).not.toBeNull()
    expect((await edit({ title: 'Too late' }, 3)).data).toMatchObject({ error: 'cap_closed', message: 'CAP01 is Completed. Reopen it before editing it.' })
    const reopened = await status({ status: 'in_progress', version: 3 })
    expect(reopened.data).toMatchObject({ status: 'in_progress', version: 4, completedAt: null, completedBy: null })
    expect(t.sqlite.prepare('select completed_by_user_id as user, completed_by_label as label from review_caps where id = ?').get(added.id)).toEqual({ user: null, label: null })

    const entries = (await t.call('GET', `/api/reviews/${made.code}/entries`, { cookie: superAdmin })).data.slice(2)
    expect(entries.map((entry: { cap: number; title: string }) => [entry.cap, entry.title])).toEqual([
      [1, 'CAP01 edited: Title, Responsible, Due date, Details'],
      [1, 'CAP01: Not started → Completed'],
      [1, 'CAP01: Completed → In progress'],
    ])
    expect(entries[0].bodyHtml).toContain('<strong>Title:</strong> Handover checklist → Handover &lt;list&gt;')
    expect(entries[0].bodyHtml).toContain('<strong>Due date:</strong> 11/02/2026 → None')
    expect(entries[0].bodyHtml).toContain('<h3>Details before</h3><p><em>Empty</em></p>')
    expect(entries[1].bodyHtml).toBe('<p>Checklist is in use.</p>')
    expect(t.sqlite.prepare("select action, details from review_audit_log where entity_type = 'cap' and action != 'create' order by id").all()).toEqual([
      { action: 'update', details: `${made.code} CAP01 · Handover <list> · CAP01 edited: Title, Responsible, Due date, Details` },
      { action: 'status', details: `${made.code} CAP01 · Handover <list> · CAP01: Not started → Completed` },
      { action: 'status', details: `${made.code} CAP01 · Handover <list> · CAP01: Completed → In progress` },
    ])

    // A Completed review is sealed; a voided one is a record only.
    t.sqlite.prepare("update reviews set status = 'completed' where id = ?").run(made.id)
    expect((await t.call('POST', path, { cookie: superAdmin, body: cap(reviewer.id) })).data).toMatchObject({ error: 'review_sealed', message: `${made.code} is Completed. Reopen it to add a CAP.` })
    expect((await status({ status: 'completed', version: 4 })).data.error).toBe('review_sealed')
    t.sqlite.prepare("update reviews set status = 'voided' where id = ?").run(made.id)
    expect((await edit({ title: 'Voided' }, 4)).data.error).toBe('review_voided')
  })

  it('are open to the reviewer at Read Only, and to no other reader, not even the one responsible', async () => {
    const { t, create, employee, account, reviewer } = await reviews()
    const olu = employee('E-4004', 'Olu', 'Bello')
    const rhea = await account('rhea@bphs.local', { reviews: 'read' }, reviewer.id)
    const responsible = await account('olu@bphs.local', { reviews: 'read' }, olu.id)
    const made = (await create()).data
    const path = `/api/reviews/${made.code}/caps`
    const added = (await t.call('POST', path, { cookie: rhea, body: cap(olu.id) })).data
    expect(added).toMatchObject({ seq: 1, addedBy: 'rhea@bphs.local' })

    expect((await t.call('GET', `${path}/CAP01`, { cookie: responsible })).status).toBe(200)
    for (const [method, target, body] of [
      ['POST', path, cap(olu.id)],
      ['PATCH', `${path}/CAP01`, { ...cap(olu.id, { title: 'Changed' }), version: 1 }],
      ['POST', `${path}/CAP01/status`, { status: 'completed', version: 1 }],
    ] as const) {
      const res = await t.call(method, target, { cookie: responsible, body })
      expect(res.status, `${method} ${target}`).toBe(403)
      expect(res.data.message).toContain('Rhea Okafor')
    }
    expect((await t.call('PATCH', `${path}/CAP01`, { cookie: rhea, body: { ...cap(reviewer.id), version: 1 } })).data.responsible.name).toBe('Rhea Okafor')
    expect((await t.call('POST', `${path}/CAP01/status`, { cookie: rhea, body: { status: 'completed', version: 2 } })).data).toMatchObject({ status: 'completed', completedBy: 'rhea@bphs.local' })
  })

  it('are listed as action items across reviews, soonest due first, leaving out voided reviews; each export is logged', async () => {
    const { t, superAdmin, create, reviewer, account } = await reviews()
    const first = (await create()).data
    const second = (await create({ title: 'Late timesheets' })).data
    const voided = (await create({ title: 'Entered twice' })).data
    const add = (code: string, title: string, dueDate: string | null) => t.call('POST', `/api/reviews/${code}/caps`, { cookie: superAdmin, body: cap(reviewer.id, { title, dueDate }) })
    await add(first.code, 'Undated', null)
    await add(first.code, 'Later', '2026-12-01')
    await add(second.code, 'Sooner', '2026-11-01')
    await add(voided.code, 'Not an action item', '2026-10-20')
    t.sqlite.prepare("update reviews set status = 'voided' where id = ?").run(voided.id)

    const items = (await t.call('GET', '/api/reviews/action-items', { cookie: superAdmin })).data
    expect(items.map((item: { title: string; review: { code: string } }) => [item.title, item.review.code])).toEqual([
      ['Sooner', second.code],
      ['Later', first.code],
      ['Undated', first.code],
    ])
    expect(items[0]).toMatchObject({ seq: 1, status: 'not_started', dueDate: '2026-11-01', responsible: { name: 'Rhea Okafor' }, review: { title: 'Late timesheets' }, completedAt: null })

    const reader = await account('reader@bphs.local', { reviews: 'read' }, reviewer.id)
    expect((await t.call('POST', '/api/reviews/action-items/exports', { cookie: reader, body: { format: 'xlsx', rows: 3 } })).status).toBe(204)
    expect((await t.call('POST', '/api/reviews/action-items/exports', { cookie: reader, body: { format: 'pdf', rows: 3 } })).status).toBe(422)
    expect(t.sqlite.prepare("select actor, entity_type, entity_id, review_id, details from review_audit_log where action = 'export'").all()).toEqual([
      { actor: 'reader@bphs.local', entity_type: 'cap', entity_id: null, review_id: null, details: 'Action items · 3 rows · Excel workbook' },
    ])
  })
})
