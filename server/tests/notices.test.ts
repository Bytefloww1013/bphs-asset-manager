import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { canSendNotices } from '../../shared/permissions.ts'
import { auditLog, notices, notifications, users } from '../db/schema.ts'
import { setup } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>

const addUser = (t: T, email: string, extra: Partial<typeof users.$inferInsert> = {}) =>
  t.db
    .insert(users)
    .values({ name: email, email, passwordHash: t.superUser.passwordHash, mustChangePassword: false, ...extra })
    .returning()
    .get()

const noticesOf = (t: T, userId: number) =>
  t.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.kind, 'notice'))).all()

const NOTICE = { title: 'Office closed Friday', body: 'The office is closed on Friday.\nIT is on call.' }

describe('canSendNotices', () => {
  it('is Super Admins only: Full access everywhere is not enough', () => {
    expect(canSendNotices({ access: {}, superAdmin: true })).toBe(true)
    expect(canSendNotices({ access: { assets: 'full', grievances: 'full', maintenance: 'full', reviews: 'full', employees: 'full' }, superAdmin: false })).toBe(false)
    expect(canSendNotices(null)).toBe(false)
  })
})

describe('the notices API', () => {
  it('refuses anyone who is not a Super Admin, and saves nothing', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    expect((await t.call('POST', '/api/notices', { cookie, body: { ...NOTICE, audience: 'all' } })).status).toBe(403)
    expect((await t.call('GET', '/api/notices', { cookie })).status).toBe(403)
    expect(t.db.select().from(notices).all()).toEqual([])
  })

  it('sends to every active account but the sender, and writes an audit line', async () => {
    const t = await setup()
    const gone = addUser(t, 'gone@bphs.local', { isActive: false })
    const res = await t.call('POST', '/api/notices', { cookie: await t.asSuper(), body: { ...NOTICE, audience: 'all' } })
    expect(res.status).toBe(201)
    expect(res.data).toMatchObject({ title: NOTICE.title, body: NOTICE.body, audience: 'all', sentBy: 'Priya Raghunathan', recipients: 1, read: 0 })
    expect(noticesOf(t, t.adminUser.id)).toMatchObject([{ title: NOTICE.title, sourceKey: `notice:${res.data.id}`, link: `/me/inbox/${res.data.id}` }])
    expect(noticesOf(t, t.superUser.id)).toEqual([])
    expect(noticesOf(t, gone.id)).toEqual([])
    expect(t.db.select().from(auditLog).where(eq(auditLog.entityType, 'notice')).all()).toMatchObject([
      { action: 'create', entityId: res.data.id, actor: 'p.raghunathan@bphs.local', details: `${NOTICE.title} · to everyone · 1 recipient` },
    ])
  })

  it('sends a picked audience to only those accounts, skipping deactivated ones', async () => {
    const t = await setup()
    const picked = addUser(t, 'picked@bphs.local')
    const gone = addUser(t, 'gone@bphs.local', { isActive: false })
    const res = await t.call('POST', '/api/notices', { cookie: await t.asSuper(), body: { ...NOTICE, audience: { userIds: [picked.id, gone.id] } } })
    expect(res.data).toMatchObject({ audience: 'picked', recipients: 1 })
    expect(noticesOf(t, picked.id)).toHaveLength(1)
    expect(noticesOf(t, t.adminUser.id)).toEqual([])
    expect(noticesOf(t, gone.id)).toEqual([])
  })

  it('refuses a notice nobody would get, and keeps no trace of it', async () => {
    const t = await setup()
    const gone = addUser(t, 'gone@bphs.local', { isActive: false })
    const cookie = await t.asSuper()
    for (const userIds of [[t.superUser.id], [gone.id]]) {
      const res = await t.call('POST', '/api/notices', { cookie, body: { ...NOTICE, audience: { userIds } } })
      expect(res.status).toBe(422)
    }
    expect((await t.call('POST', '/api/notices', { cookie, body: { ...NOTICE, audience: { userIds: [] } } })).status).toBe(422)
    expect((await t.call('POST', '/api/notices', { cookie, body: { ...NOTICE, body: 'x'.repeat(2001), audience: 'all' } })).status).toBe(422)
    expect(t.db.select().from(notices).all()).toEqual([])
    expect(t.db.select().from(auditLog).where(eq(auditLog.entityType, 'notice')).all()).toEqual([])
  })

  it('lets a recipient read it, which marks it read and shows in the sender’s count; anyone else gets 404', async () => {
    const t = await setup()
    addUser(t, 'other@bphs.local')
    const superCookie = await t.asSuper()
    const sent = (await t.call('POST', '/api/notices', { cookie: superCookie, body: { ...NOTICE, audience: { userIds: [t.adminUser.id] } } })).data
    const read = await t.call('GET', `/api/me/notices/${sent.id}`, { cookie: await t.asAdmin() })
    expect(read.data).toEqual({ id: sent.id, title: NOTICE.title, body: NOTICE.body, sentBy: 'Priya Raghunathan', createdAt: sent.createdAt })
    expect(noticesOf(t, t.adminUser.id)[0]!.readAt).not.toBeNull()
    expect((await t.call('GET', '/api/notices', { cookie: superCookie })).data).toMatchObject([{ id: sent.id, recipients: 1, read: 1 }])
    // Neither someone it was not sent to, nor its sender, has it in their Inbox.
    expect((await t.call('GET', `/api/me/notices/${sent.id}`, { cookie: (await t.signIn('other@bphs.local')).cookie })).status).toBe(404)
    expect((await t.call('GET', `/api/me/notices/${sent.id}`, { cookie: superCookie })).status).toBe(404)
  })
})
