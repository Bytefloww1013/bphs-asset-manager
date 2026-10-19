import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { muteEnds } from '../../shared/constants.ts'
import { employees, notificationMutes, notifications, users } from '../db/schema.ts'
import { accountOf, notify, purgeNotifications, sectionTeam, type NewNotification } from '../services/notifications.ts'
import { setup } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>

const ISSUED: NewNotification = { recipients: [], kind: 'asset_issued', sourceKey: 'asset:1', title: 'BP-0001 was issued to you', link: '/assets/BP-0001' }

/** Another account, with the same password as the others. */
const addUser = (t: T, email: string, extra: Partial<typeof users.$inferInsert> = {}) =>
  t.db
    .insert(users)
    .values({ name: email, email, passwordHash: t.superUser.passwordHash, mustChangePassword: false, ...extra })
    .returning()
    .get()

const rowsOf = (t: T, userId: number) => t.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.id).all()
const send = (t: T, recipients: number[], extra: Partial<NewNotification> = {}, actor: { id: number } | null = null) =>
  notify(t.db, actor, { ...ISSUED, recipients, ...extra })

describe('the notifications migration', () => {
  it('applies to the schema before it, and holds one mute per thing muted', () => {
    const folder = path.join(import.meta.dirname, '../db/migrations')
    const statements = (file: string) => fs.readFileSync(path.join(folder, file), 'utf8').split('--> statement-breakpoint')
    const files = fs.readdirSync(folder).filter((file) => file.endsWith('.sql')).sort()
    const target = files.findIndex((file) => file.startsWith('0017_'))
    const sqlite = new Database(':memory:')
    for (const file of files.slice(0, target)) for (const statement of statements(file)) sqlite.exec(statement)
    sqlite.exec(`insert into users (id, name, email, password_hash) values (1, 'S', 's@x.example', 'x')`)
    for (const statement of statements(files[target]!)) sqlite.exec(statement)

    sqlite.exec(`insert into notifications (user_id, kind, source_key, title, link, created_at) values (1, 'asset_issued', 'asset:1', 'T', '/', 0)`)
    const mute = sqlite.prepare(`insert into notification_mutes (user_id, kind, source_key, created_at) values (1, ?, ?, 0)`)
    mute.run('asset_overdue', null)
    mute.run('asset_overdue', 'assignment:1')
    expect(() => mute.run('asset_overdue', null)).toThrow(/UNIQUE/)
    expect(() => mute.run('asset_overdue', 'assignment:1')).toThrow(/UNIQUE/)
    expect(() => sqlite.exec(`insert into notices (title, body, audience, created_by_user_id, created_at) values ('T', 'B', 'some', 1, 0)`)).toThrow(/CHECK/)
    sqlite.close()
  })
})

describe('notify()', () => {
  it('skips the actor, inactive accounts and duplicates', async () => {
    const t = await setup()
    const gone = addUser(t, 'gone@bphs.local', { isActive: false })
    send(t, [t.superUser.id, t.adminUser.id, t.adminUser.id, gone.id], {}, t.superUser)
    expect(rowsOf(t, t.adminUser.id)).toMatchObject([{ kind: 'asset_issued', sourceKey: 'asset:1', muted: false, readAt: null }])
    expect(rowsOf(t, t.superUser.id)).toEqual([])
    expect(rowsOf(t, gone.id)).toEqual([])
  })

  it('finds an employee’s account, and nobody for an employee without one or with a deactivated one', async () => {
    const t = await setup()
    expect(accountOf(t.db, t.person.id)).toEqual([t.superUser.id])
    const loner = t.db.insert(employees).values({ code: 'E-2', firstName: 'No', lastName: 'Account' }).returning().get()
    expect(accountOf(t.db, loner.id)).toEqual([])
    expect(accountOf(t.db, null)).toEqual([])
    addUser(t, 'off@bphs.local', { employeeId: loner.id, isActive: false })
    expect(accountOf(t.db, loner.id)).toEqual([])
  })

  it('takes a section’s team to be its Edit and Full accounts plus every Super Admin', async () => {
    const t = await setup()
    const reader = addUser(t, 'reader@bphs.local', { access: { assets: 'read' } })
    const full = addUser(t, 'full@bphs.local', { access: { assets: 'full' } })
    addUser(t, 'off@bphs.local', { access: { assets: 'edit' }, isActive: false })
    expect(sectionTeam(t.db, 'assets').sort()).toEqual([t.superUser.id, t.adminUser.id, full.id].sort())
    expect(sectionTeam(t.db, 'assets')).not.toContain(reader.id)
    expect(sectionTeam(t.db, 'maintenance')).toEqual([t.superUser.id])
  })

  it('marks a row muted under a live item or kind mute, but never for an unmutable kind', async () => {
    const t = await setup()
    const now = new Date()
    const mute = (userId: number, kind: string, sourceKey: string | null, until: Date | null = null) =>
      t.db.insert(notificationMutes).values({ userId, kind, sourceKey, until, createdAt: now }).run()
    const other = addUser(t, 'other@bphs.local')
    mute(t.adminUser.id, 'asset_issued', 'asset:1')
    mute(t.superUser.id, 'asset_issued', null)
    mute(other.id, 'asset_issued', null, new Date(now.getTime() - 1))
    mute(t.adminUser.id, 'account_password_reset', null)

    const everyone = [t.adminUser.id, t.superUser.id, other.id]
    send(t, everyone)
    send(t, everyone, { sourceKey: 'asset:2' })
    send(t, [t.adminUser.id], { kind: 'account_password_reset', sourceKey: 'user:2', link: '/me' })
    const muted = (userId: number) => rowsOf(t, userId).map((row) => [row.sourceKey, row.muted])
    expect(muted(t.adminUser.id)).toEqual([['asset:1', true], ['asset:2', false], ['user:2', false]])
    expect(muted(t.superUser.id)).toEqual([['asset:1', true], ['asset:2', true]])
    // A mute that has ended mutes nothing.
    expect(muted(other.id)).toEqual([['asset:1', false], ['asset:2', false]])
  })

  it('leaves nothing behind when the change it belongs to rolls back', async () => {
    const t = await setup()
    expect(() =>
      t.db.transaction((tx) => {
        notify(tx, null, { ...ISSUED, recipients: [t.adminUser.id] })
        throw new Error('the change failed')
      }),
    ).toThrow('the change failed')
    expect(rowsOf(t, t.adminUser.id)).toEqual([])
  })

  it('refuses a link that is not an in-app path', async () => {
    const t = await setup()
    for (const link of ['https://evil.example/', '//evil.example', '/\\evil.example', 'assets/1', 'javascript:alert(1)']) {
      expect(() => send(t, [t.adminUser.id], { link })).toThrow(/in-app path/)
    }
    expect(rowsOf(t, t.adminUser.id)).toEqual([])
  })
})

describe('the Inbox API', () => {
  it('shows only your own rows, and answers another account’s id with 404', async () => {
    const t = await setup()
    send(t, [t.superUser.id], { title: 'Mine' })
    send(t, [t.adminUser.id], { title: 'Theirs' })
    const theirs = rowsOf(t, t.adminUser.id)[0]!.id
    const cookie = await t.asSuper()
    expect((await t.call('GET', '/api/me/notifications', { cookie })).data).toMatchObject({ items: [{ title: 'Mine' }], nextCursor: null })
    for (const action of ['read', 'unread', 'archive', 'unarchive']) {
      expect((await t.call('POST', `/api/me/notifications/${theirs}/${action}`, { cookie })).status).toBe(404)
    }
    expect(rowsOf(t, t.adminUser.id)).toMatchObject([{ readAt: null, archivedAt: null }])
  })

  it('needs a session but no section access', async () => {
    const t = await setup()
    const nobody = addUser(t, 'nobody@bphs.local')
    send(t, [nobody.id])
    const cookie = (await t.signIn('nobody@bphs.local')).cookie
    expect((await t.call('GET', '/api/me/notifications/count', { cookie })).data).toEqual({ unread: 1 })
    expect((await t.call('GET', '/api/me/notifications/count')).status).toBe(401)
  })

  it('counts unread rows that are not muted or archived, and read-all leaves archived rows alone', async () => {
    const t = await setup()
    const id = t.superUser.id
    t.db.insert(notificationMutes).values({ userId: id, kind: 'asset_overdue', createdAt: new Date() }).run()
    send(t, [id], { sourceKey: 'asset:1' })
    send(t, [id], { sourceKey: 'asset:2' })
    send(t, [id], { sourceKey: 'asset:3' })
    send(t, [id], { kind: 'asset_overdue', sourceKey: 'assignment:9' })
    const [first, second] = rowsOf(t, id)
    const cookie = await t.asSuper()
    const count = async () => (await t.call('GET', '/api/me/notifications/count', { cookie })).data.unread
    expect(await count()).toBe(3)

    expect((await t.call('POST', `/api/me/notifications/${first!.id}/archive`, { cookie })).status).toBe(204)
    expect(await count()).toBe(2)
    expect((await t.call('POST', `/api/me/notifications/${second!.id}/read`, { cookie })).status).toBe(204)
    expect(await count()).toBe(1)
    expect((await t.call('POST', `/api/me/notifications/${second!.id}/unread`, { cookie })).status).toBe(204)
    expect(await count()).toBe(2)

    expect((await t.call('POST', '/api/me/notifications/read-all', { cookie })).status).toBe(204)
    expect(await count()).toBe(0)
    expect(rowsOf(t, id).map((row) => [row.archivedAt !== null, row.readAt !== null])).toEqual([
      [true, false],
      [false, true],
      [false, true],
      [false, true],
    ])
    expect((await t.call('POST', `/api/me/notifications/${first!.id}/unarchive`, { cookie })).status).toBe(204)
    expect(await count()).toBe(1)
  })

  it('lists newest first by view, a page at a time', async () => {
    const t = await setup()
    for (const n of [1, 2, 3]) send(t, [t.superUser.id], { title: `N${n}`, sourceKey: `asset:${n}` })
    const [n1, n2] = rowsOf(t, t.superUser.id)
    const cookie = await t.asSuper()
    const list = async (query: string) => (await t.call('GET', `/api/me/notifications?${query}`, { cookie })).data
    const titles = (page: { items: { title: string }[] }) => page.items.map((item) => item.title)

    const first = await list('limit=2')
    expect(titles(first)).toEqual(['N3', 'N2'])
    const second = await list(`limit=2&before=${first.nextCursor}`)
    expect([titles(second), second.nextCursor]).toEqual([['N1'], null])

    await t.call('POST', `/api/me/notifications/${n1!.id}/archive`, { cookie })
    await t.call('POST', `/api/me/notifications/${n2!.id}/read`, { cookie })
    expect(titles(await list('view=all'))).toEqual(['N3', 'N2'])
    expect(titles(await list('view=unread'))).toEqual(['N3'])
    expect(titles(await list('view=archived'))).toEqual(['N1'])
    expect((await t.call('GET', '/api/me/notifications?view=mine', { cookie })).status).toBe(422)
  })
})

describe('the Mutes API', () => {
  it('refuses kinds that can never be muted', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    for (const kind of ['account_password_reset', 'account_access_changed', 'account_unlocked', 'account_employee_linked', 'notice']) {
      const res = await t.call('POST', '/api/me/mutes', { cookie, body: { kind, duration: '7d' } })
      expect(res.status).toBe(422)
    }
    expect((await t.call('POST', '/api/me/mutes', { cookie, body: { kind: 'grievance_filed', duration: '7d' } })).status).toBe(422)
    expect((await t.call('GET', '/api/me/mutes', { cookie })).data).toEqual([])
  })

  it('ends each duration where it should', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    for (const duration of ['24h', '7d', '1m', 'forever'] as const) {
      const made = (await t.call('POST', '/api/me/mutes', { cookie, body: { kind: 'asset_issued', sourceKey: `asset:${duration}`, duration } })).data
      expect(made.until).toBe(muteEnds(duration, new Date(made.createdAt))?.toISOString() ?? null)
    }
    const at = (iso: string) => new Date(iso)
    expect(muteEnds('24h', at('2026-10-19T08:00:00Z'))).toEqual(at('2026-10-20T08:00:00Z'))
    expect(muteEnds('7d', at('2026-10-19T08:00:00Z'))).toEqual(at('2026-10-26T08:00:00Z'))
    expect(muteEnds('1m', at('2026-10-19T08:00:00Z'))).toEqual(at('2026-11-19T08:00:00Z'))
    // A month from the 31st is the last day of a shorter month.
    expect(muteEnds('1m', at('2027-01-31T08:00:00Z'))).toEqual(at('2027-02-28T08:00:00Z'))
    expect(muteEnds('1m', at('2028-01-31T08:00:00Z'))).toEqual(at('2028-02-29T08:00:00Z'))
    expect(muteEnds('forever', at('2026-10-19T08:00:00Z'))).toBeNull()
  })

  it('replaces a mute of the same thing rather than stacking, and keeps item and kind mutes apart', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const mute = (body: object) => t.call('POST', '/api/me/mutes', { cookie, body })
    expect((await mute({ kind: 'maintenance_changed', sourceKey: 'maintenance:4', duration: '24h' })).status).toBe(201)
    await mute({ kind: 'maintenance_changed', sourceKey: 'maintenance:4', duration: 'forever' })
    await mute({ kind: 'maintenance_changed', duration: '7d' })
    await mute({ kind: 'maintenance_changed', duration: '1m' })
    const list = (await t.call('GET', '/api/me/mutes', { cookie })).data
    expect(list.map((row: { sourceKey: string | null; until: string | null }) => [row.sourceKey, row.until === null])).toEqual([
      [null, false],
      ['maintenance:4', true],
    ])
    expect(muteEnds('1m', new Date(list[0].createdAt))?.toISOString()).toBe(list[0].until)
  })

  it('names a muted item by its latest notification', async () => {
    const t = await setup()
    send(t, [t.superUser.id], { title: 'Older' })
    send(t, [t.superUser.id])
    send(t, [t.adminUser.id], { title: 'Not yours' })
    const cookie = await t.asSuper()
    const made = (await t.call('POST', '/api/me/mutes', { cookie, body: { kind: 'asset_issued', sourceKey: 'asset:1', duration: '7d' } })).data
    expect(made.about).toBe(ISSUED.title)
    await t.call('POST', '/api/me/mutes', { cookie, body: { kind: 'asset_issued', duration: '7d' } })
    await t.call('POST', '/api/me/mutes', { cookie, body: { kind: 'asset_overdue', sourceKey: 'assignment:9', duration: '7d' } })
    const list = (await t.call('GET', '/api/me/mutes', { cookie })).data
    expect(list.map((row: { about: string | null }) => row.about)).toEqual([null, null, ISSUED.title])
  })

  it('unmutes only your own, and lists only live mutes', async () => {
    const t = await setup()
    const theirs = t.db.insert(notificationMutes).values({ userId: t.adminUser.id, kind: 'asset_issued', createdAt: new Date() }).returning().get()
    t.db.insert(notificationMutes).values({ userId: t.superUser.id, kind: 'asset_overdue', until: new Date(Date.now() - 1000), createdAt: new Date() }).run()
    const cookie = await t.asSuper()
    expect((await t.call('GET', '/api/me/mutes', { cookie })).data).toEqual([])
    expect((await t.call('DELETE', `/api/me/mutes/${theirs.id}`, { cookie })).status).toBe(404)
    const mine = (await t.call('POST', '/api/me/mutes', { cookie, body: { kind: 'asset_issued', duration: 'forever' } })).data
    expect((await t.call('DELETE', `/api/me/mutes/${mine.id}`, { cookie })).status).toBe(204)
    expect((await t.call('GET', '/api/me/mutes', { cookie })).data).toEqual([])
    expect(t.db.select().from(notificationMutes).where(eq(notificationMutes.id, theirs.id)).get()).toBeTruthy()
  })
})

describe('retention', () => {
  it('deletes notifications over a year old, read or not, and mutes that have ended', async () => {
    const t = await setup()
    const now = new Date('2026-10-19T12:00:00Z')
    const yearAgo = new Date('2025-10-19T12:00:00Z')
    const at = (createdAt: Date, title: string, readAt: Date | null = null) =>
      t.db.insert(notifications).values({ ...ISSUED, userId: t.adminUser.id, title, createdAt, readAt }).run()
    at(yearAgo, 'exactly a year')
    at(new Date(yearAgo.getTime() - 1), 'a year and a moment, unread')
    at(new Date(yearAgo.getTime() - 1), 'a year and a moment, read', now)
    at(now, 'today')
    const mute = (until: Date | null, kind: string) => t.db.insert(notificationMutes).values({ userId: t.adminUser.id, kind, until, createdAt: yearAgo }).run()
    mute(now, 'ended now')
    mute(new Date(now.getTime() + 1), 'ends next')
    mute(null, 'forever')

    purgeNotifications(t.db, now)
    expect(rowsOf(t, t.adminUser.id).map((row) => row.title)).toEqual(['exactly a year', 'today'])
    expect(t.db.select().from(notificationMutes).all().map((row) => row.kind)).toEqual(['ends next', 'forever'])
  })
})
