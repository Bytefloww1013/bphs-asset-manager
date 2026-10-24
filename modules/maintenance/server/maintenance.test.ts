import { auditLog } from '#foundation/audit/server/index.ts'
import { employees } from '#foundation/employees/server/index.ts'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '#kernel/app.ts'
import { setup } from '#kernel/testing/index.ts'
import type { MaintenanceDetail } from '../shared/types.ts'

const SECRET = 'a-test-secret-that-is-long-enough-0123456789' // gitleaks:allow (test fixture)

/** An entry as Zoho sends it: every value text, under the Parameter Names the setup guide gives. */
const ENTRY = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'J.Doe@bphs.org',
  program: '0003-Yough',
  location: 'Room 12',
  addedTime: '15-Oct-2026 09:41:07',
  description: 'The sink "drips"\nall day.',
  urgent: 'No',
  requestDate: '15-Oct-2026',
  noticedDate: '14-Oct-2026',
}

/** Priya (Super Admin) signed in, Sam and Lee in the directory to be dispatched, and the webhook on with SECRET (or off with ''). */
async function maintenance(secret = SECRET) {
  const t = await setup()
  const app = createApp(t.db, { quiet: true, maintenanceWebhookSecret: secret })
  const post = async (body: string, headers: Record<string, string>) => {
    const res = await app.request('/api/webhooks/maintenance', { method: 'POST', headers, body })
    const data: any = await res.json().catch(() => null)
    return { status: res.status, data }
  }
  const hook = (body: unknown, secretSent: string | null = SECRET) =>
    post(JSON.stringify(body), {
      'content-type': 'application/json',
      ...(secretSent === null ? {} : { 'x-webhook-secret': secretSent }),
    })
  const person = (code: string, firstName: string) =>
    t.db.insert(employees).values({ code, firstName, lastName: 'Fixer' }).returning().get()
  const cookie = await t.asSuper()
  const get = async (id: number) =>
    (await t.call('GET', `/api/maintenance/${id}`, { cookie })).data as MaintenanceDetail
  const act = (id: number, action: 'dispatch' | 'status' | 'notes', body: unknown) =>
    t.call('POST', `/api/maintenance/${id}/${action}`, { cookie, body })
  const lines = (detail: MaintenanceDetail) => detail.notes.map((note) => note.body)
  return { t, post, hook, cookie, get, act, lines, sam: person('E-2001', 'Sam'), lee: person('E-2002', 'Lee') }
}

const count = (t: Awaited<ReturnType<typeof setup>>, table: string) =>
  t.db.get<{ n: number }>(sql.raw(`select count(*) as n from ${table}`)).n

describe('the Zoho webhook', () => {
  it('is off until a secret is configured, and refuses a missing or wrong one', async () => {
    expect((await (await maintenance('')).hook(ENTRY)).status).toBe(404)
    const { t, hook } = await maintenance()
    expect((await hook(ENTRY, null)).status).toBe(401)
    expect((await hook(ENTRY, `${SECRET}x`)).status).toBe(401)
    expect(count(t, 'maintenance_requests')).toBe(0)
  })

  it('stores an entry as Not Started, with every field as Zoho sent it', async () => {
    const { hook, get } = await maintenance()
    const res = await hook(ENTRY)
    expect(res).toEqual({ status: 201, data: { id: expect.any(Number) } })
    expect(await get(res.data.id)).toMatchObject({
      code: 'MR-0001',
      requestedBy: 'Jane Doe',
      email: 'j.doe@bphs.org',
      program: '0003-Yough',
      location: 'Room 12',
      description: 'The sink "drips"\nall day.',
      urgent: 'No',
      requestDate: '15-Oct-2026',
      noticedDate: '14-Oct-2026',
      zohoAddedTime: '15-Oct-2026 09:41:07',
      status: 'not_started',
      assignee: null,
      notes: [{ kind: 'system', body: 'Received from Zoho Forms', createdBy: 'Zoho Forms' }],
    })
  })

  it('answers an entry sent twice with the request it already made', async () => {
    const { t, hook } = await maintenance()
    const first = await hook(ENTRY)
    expect(await hook(ENTRY)).toEqual({ status: 200, data: { id: first.data.id, duplicate: true } })
    expect(count(t, 'maintenance_requests')).toBe(1)
    expect((await hook({ ...ENTRY, addedTime: '15-Oct-2026 09:45:00' })).status).toBe(201)
  })

  it('needs only a description, ignoring keys it does not know and values that are not text', async () => {
    const { hook, get } = await maintenance()
    const res = await hook({ description: '  Light out  ', urgent: 5, lastName: ['Doe'], somethingNew: 'x' })
    expect(res.status).toBe(201)
    expect(await get(res.data.id)).toMatchObject({
      firstName: '',
      lastName: null,
      email: '',
      description: 'Light out',
      urgent: null,
      zohoAddedTime: null,
    })
  })

  it('refuses an entry with no description, logging the keys it had but not their values', async () => {
    const { hook, post } = await maintenance()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await hook({ firstName: 'Jane', Description: 'Wrong case' })).status).toBe(400)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Keys received: firstName, Description'))
    expect(warn.mock.calls.flat().join()).not.toMatch(/Jane|Wrong case/)
    expect((await post('not json', { 'content-type': 'application/json', 'x-webhook-secret': SECRET })).status).toBe(
      400,
    )
    warn.mockRestore()
  })

  it('takes JSON only: a form-encoded post is refused before it is read', async () => {
    const { t, post } = await maintenance()
    const res = await post(new URLSearchParams(ENTRY).toString(), {
      'content-type': 'application/x-www-form-urlencoded',
      'x-webhook-secret': SECRET,
    })
    expect(res.status).toBe(403)
    expect(count(t, 'maintenance_requests')).toBe(0)
  })
})

describe('maintenance requests', () => {
  it('can be entered by hand, with a first name, location and description', async () => {
    const { t, cookie, lines } = await maintenance()
    const made = await t.call('POST', '/api/maintenance', {
      cookie,
      body: { firstName: 'Ann', location: 'Gym', description: 'Door sticks', email: '', noticedDate: '2026-10-14' },
    })
    expect(made.status).toBe(201)
    expect(made.data).toMatchObject({
      requestedBy: 'Ann',
      email: '',
      program: '',
      urgent: 'No',
      noticedDate: '2026-10-14',
      zohoAddedTime: null,
      status: 'not_started',
    })
    expect(lines(made.data)).toEqual(['Entered by Priya Raghunathan'])
    const refused = await t.call('POST', '/api/maintenance', {
      cookie,
      body: { firstName: ' ', email: 'not-an-email' },
    })
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.data.details.fields).sort()).toEqual(['description', 'email', 'firstName', 'location'])
  })

  it('is Dispatched when someone is chosen, and back to Not Started when they are cleared', async () => {
    const { hook, act, get, lines, sam, lee } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    expect((await act(id, 'dispatch', { employeeId: sam.id })).data).toMatchObject({
      status: 'dispatched',
      assignee: { id: sam.id, name: 'Sam Fixer' },
    })
    expect((await act(id, 'dispatch', { employeeId: lee.id })).data).toMatchObject({
      status: 'dispatched',
      assignee: { id: lee.id },
    })
    expect((await act(id, 'dispatch', { employeeId: null })).data).toMatchObject({
      status: 'not_started',
      assignee: null,
    })
    expect(lines(await get(id)).slice(1)).toEqual([
      'Dispatched to Sam Fixer',
      'Dispatch changed: Sam Fixer → Lee Fixer',
      'Dispatch to Lee Fixer cleared; back to Not Started',
    ])
  })

  it('keeps the status when the employee changes on a request that is not Not Started or Dispatched', async () => {
    const { hook, act, sam } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    expect((await act(id, 'status', { status: 'on_hold' })).data).toMatchObject({ status: 'on_hold', assignee: null })
    expect((await act(id, 'dispatch', { employeeId: sam.id })).data).toMatchObject({
      status: 'on_hold',
      assignee: { id: sam.id },
    })
    expect((await act(id, 'status', { status: 'finished' })).data).toMatchObject({
      status: 'finished',
      assignee: { id: sam.id },
    })
    expect((await act(id, 'dispatch', { employeeId: null })).data).toMatchObject({ status: 'finished', assignee: null })
  })

  it('applies the status rules', async () => {
    const { t, hook, act, get, lines, sam } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    expect((await act(id, 'status', { status: 'dispatched' })).data).toMatchObject({
      message: 'Choose who it is dispatched to.',
    })
    expect((await act(id, 'status', { status: 'not_started' })).status).toBe(409)
    await act(id, 'dispatch', { employeeId: sam.id })
    expect((await act(id, 'status', { status: 'rejected' })).data).toMatchObject({
      status: 'rejected',
      assignee: { id: sam.id },
    })
    expect((await act(id, 'status', { status: 'not_started' })).data).toMatchObject({
      status: 'not_started',
      assignee: null,
    })
    expect(lines(await get(id)).slice(2)).toEqual([
      'Status: Dispatched → Rejected',
      'Status: Rejected → Not Started; dispatch to Sam Fixer cleared',
    ])
    // The database holds the rule as well, whatever writes to it.
    expect(() =>
      t.sqlite.prepare(`update maintenance_requests set status = 'dispatched' where id = ?`).run(id),
    ).toThrow(/CHECK constraint failed/)
  })

  it('can be dispatched only to an active employee', async () => {
    const { t, hook, act, sam } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    t.db.update(employees).set({ archivedAt: new Date() }).where(eq(employees.id, sam.id)).run()
    expect((await act(id, 'dispatch', { employeeId: sam.id })).status).toBe(422)
    expect((await act(id, 'dispatch', { employeeId: 9999 })).status).toBe(422)
  })

  it('takes notes, but not an empty one', async () => {
    const { hook, act } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    const noted = (await act(id, 'notes', { body: '  Parts ordered.\nBack Monday.  ' })).data as MaintenanceDetail
    expect(noted.notes.at(-1)).toMatchObject({
      kind: 'note',
      body: 'Parts ordered.\nBack Monday.',
      createdBy: 'Priya Raghunathan',
    })
    expect((await act(id, 'notes', { body: '   ' })).status).toBe(422)
    expect((await act(9999, 'notes', { body: 'Hello' })).status).toBe(404)
  })

  it('can be deleted by a Super Admin only, with its timeline, leaving the code alone in the Audit log', async () => {
    const { t, hook, act, cookie } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    await act(id, 'notes', { body: 'Test entry.' })
    expect((await t.call('DELETE', `/api/maintenance/${id}`, { cookie: await t.asAdmin() })).status).toBe(403)
    expect((await t.call('DELETE', `/api/maintenance/${id}`, { cookie })).status).toBe(204)
    expect((await t.call('GET', `/api/maintenance/${id}`, { cookie })).status).toBe(404)
    expect(count(t, 'maintenance_notes')).toBe(0)
    expect(t.db.select().from(auditLog).where(eq(auditLog.entityType, 'maintenance_request')).all()).toMatchObject([
      { action: 'delete', entityId: id, details: 'MR-0001' },
    ])
  })

  it('keeps the employee it is dispatched to from being deleted', async () => {
    const { t, hook, act, cookie, sam } = await maintenance()
    const { id } = (await hook(ENTRY)).data
    await act(id, 'dispatch', { employeeId: sam.id })
    expect((await t.call('DELETE', `/api/employees/${sam.id}`, { cookie })).data).toMatchObject({
      error: 'has_history',
      message:
        'Sam Fixer cannot be deleted. Dispatched on a maintenance request. Archive instead; history is never deleted.',
    })
    await act(id, 'dispatch', { employeeId: null })
    expect((await t.call('DELETE', `/api/employees/${sam.id}`, { cookie })).status).toBe(204)
  })

  it('lists every request, newest first, with who has it', async () => {
    const { t, hook, act, cookie, sam } = await maintenance()
    const first = (await hook(ENTRY)).data.id
    const second = (await hook({ ...ENTRY, addedTime: 'later' })).data.id
    await act(first, 'dispatch', { employeeId: sam.id })
    const rows = (await t.call('GET', '/api/maintenance', { cookie })).data
    expect(rows).toMatchObject([
      { id: second, assignee: null },
      { id: first, assignee: { name: 'Sam Fixer' } },
    ])
  })
})
