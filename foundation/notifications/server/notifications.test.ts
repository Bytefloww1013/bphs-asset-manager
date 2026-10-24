import { employees } from '#foundation/employees/server/index.ts'
import { sessions } from '#kernel/db/schema.ts'
import { migratedBefore, setup } from '#kernel/testing/index.ts'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  accountOf,
  notices,
  notifications,
  notify,
  purgeNotifications,
  sectionTeam,
  type NewNotification,
} from './index.ts'

type T = Awaited<ReturnType<typeof setup>>

const ISSUED: NewNotification = {
  recipients: [],
  kind: 'asset_issued',
  sourceKey: 'asset:1',
  title: 'BP-0001 was issued to you',
  link: '/assets/BP-0001',
}

const rowsOf = (t: T, userId: number) =>
  t.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.id).all()
const send = (t: T, recipients: number[], extra: Partial<NewNotification> = {}, actor: { id: number } | null = null) =>
  notify(t.db, actor, { ...ISSUED, recipients, ...extra })

describe('the notifications migrations', () => {
  it('apply on top of a database that already has notifications, and keep its rows', () => {
    const { sqlite, rest } = migratedBefore('0018_')
    sqlite.exec(`insert into users (id, name, email, password_hash) values (1, 'S', 's@x.example', 'x')`)
    sqlite.exec(
      `insert into notifications (user_id, kind, source_key, title, link, created_at) values (1, 'asset_issued', 'asset:1', 'T', '/', 0)`,
    )
    rest()

    expect(sqlite.prepare(`select title from notifications`).all()).toEqual([{ title: 'T' }])
    expect(sqlite.prepare(`select name from pragma_table_info('notifications') where name = 'muted'`).all()).toEqual([])
    expect(sqlite.prepare(`select name from sqlite_master where name = 'notification_mutes'`).all()).toEqual([])
    expect(sqlite.prepare(`select name from sqlite_master where name = 'ix_notifications_source'`).all()).toEqual([
      { name: 'ix_notifications_source' },
    ])
    expect(() =>
      sqlite.exec(
        `insert into notices (title, body, audience, created_by_user_id, created_at) values ('T', 'B', 'some', 1, 0)`,
      ),
    ).toThrow(/CHECK/)
    sqlite.close()
  })
})

describe('notify()', () => {
  it('skips the actor, inactive accounts and duplicates', async () => {
    const t = await setup()
    const gone = t.addUser('gone@bphs.local', { isActive: false })
    send(t, [t.superUser.id, t.adminUser.id, t.adminUser.id, gone.id], {}, t.superUser)
    expect(rowsOf(t, t.adminUser.id)).toMatchObject([{ kind: 'asset_issued', sourceKey: 'asset:1', readAt: null }])
    expect(rowsOf(t, t.superUser.id)).toEqual([])
    expect(rowsOf(t, gone.id)).toEqual([])
  })

  it('finds an employee’s account, and nobody for an employee without one or with a deactivated one', async () => {
    const t = await setup()
    expect(accountOf(t.db, t.person.id)).toEqual([t.superUser.id])
    const loner = t.db.insert(employees).values({ code: 'E-2', firstName: 'No', lastName: 'Account' }).returning().get()
    expect(accountOf(t.db, loner.id)).toEqual([])
    expect(accountOf(t.db, null)).toEqual([])
    t.addUser('off@bphs.local', { employeeId: loner.id, isActive: false })
    expect(accountOf(t.db, loner.id)).toEqual([])
  })

  it('takes a section’s team to be its Edit and Full accounts plus every Super Admin', async () => {
    const t = await setup()
    const reader = t.addUser('reader@bphs.local', { access: { assets: 'read' } })
    const full = t.addUser('full@bphs.local', { access: { assets: 'full' } })
    t.addUser('off@bphs.local', { access: { assets: 'edit' }, isActive: false })
    expect(sectionTeam(t.db, 'assets').sort((a, b) => a - b)).toEqual(
      [t.superUser.id, t.adminUser.id, full.id].sort((a, b) => a - b),
    )
    expect(sectionTeam(t.db, 'assets')).not.toContain(reader.id)
    expect(sectionTeam(t.db, 'maintenance')).toEqual([t.superUser.id])
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
    for (const link of [
      'https://evil.example/',
      '//evil.example',
      '/\\evil.example',
      'assets/1',
      'javascript:alert(1)',
    ]) {
      expect(() => send(t, [t.adminUser.id], { link })).toThrow(/in-app path/)
    }
    expect(rowsOf(t, t.adminUser.id)).toEqual([])
  })

  // The Inbox labels each row from the manifests, so a kind no module declares would show as a bare "Notification".
  it('refuses a kind no module declares', async () => {
    const t = await setup()
    const kind = 'grievance_opened' as NewNotification['kind']
    expect(() => send(t, [t.adminUser.id], { kind })).toThrow(
      'No module declares the notification kind grievance_opened',
    )
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
    expect((await t.call('GET', '/api/me/notifications', { cookie })).data).toMatchObject({
      items: [{ title: 'Mine' }],
      nextCursor: null,
    })
    for (const action of ['read', 'unread', 'archive', 'unarchive']) {
      expect((await t.call('POST', `/api/me/notifications/${theirs}/${action}`, { cookie })).status).toBe(404)
    }
    expect(rowsOf(t, t.adminUser.id)).toMatchObject([{ readAt: null, archivedAt: null }])
  })

  it('needs a session but no section access', async () => {
    const t = await setup()
    const nobody = t.addUser('nobody@bphs.local')
    send(t, [nobody.id])
    const cookie = (await t.signIn('nobody@bphs.local')).cookie
    expect((await t.call('GET', '/api/me/notifications/count', { cookie })).data).toEqual({ unread: 1 })
    expect((await t.call('GET', '/api/me/notifications/count')).status).toBe(401)
  })

  it('counts unread rows that are not archived, and read-all leaves archived rows alone', async () => {
    const t = await setup()
    const id = t.superUser.id
    send(t, [id], { sourceKey: 'asset:1' })
    send(t, [id], { sourceKey: 'asset:2' })
    send(t, [id], { sourceKey: 'asset:3' })
    send(t, [t.adminUser.id], { sourceKey: 'asset:4' })
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
    ])
    expect((await t.call('POST', `/api/me/notifications/${first!.id}/unarchive`, { cookie })).status).toBe(204)
    expect(await count()).toBe(1)
    // Another account's count and rows are its own.
    expect(rowsOf(t, t.adminUser.id)).toMatchObject([{ readAt: null }])
    expect((await t.call('GET', '/api/me/notifications/count', { cookie: await t.asAdmin() })).data).toEqual({
      unread: 1,
    })
  })

  it('does not count the bell’s poll as activity, so an idle session still expires', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const lastSeen = () => t.db.select().from(sessions).get()!.lastSeenAt.getTime()
    t.db
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .run()
    const before = lastSeen()
    expect((await t.call('GET', '/api/me/notifications/count', { cookie })).status).toBe(200)
    expect(lastSeen()).toBe(before)
    await t.call('GET', '/api/me/notifications', { cookie })
    expect(lastSeen()).toBeGreaterThan(before)
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

describe('retention', () => {
  it('deletes notifications over a year old, read or not', async () => {
    const t = await setup()
    const now = new Date('2026-10-19T12:00:00Z')
    const yearAgo = new Date('2025-10-19T12:00:00Z')
    const at = (createdAt: Date, title: string, readAt: Date | null = null) =>
      t.db
        .insert(notifications)
        .values({ ...ISSUED, userId: t.adminUser.id, title, createdAt, readAt })
        .run()
    at(yearAgo, 'exactly a year')
    at(new Date(yearAgo.getTime() - 1), 'a year and a moment, unread')
    at(new Date(yearAgo.getTime() - 1), 'a year and a moment, read', now)
    at(now, 'today')

    purgeNotifications(t.db, now)
    expect(rowsOf(t, t.adminUser.id).map((row) => row.title)).toEqual(['exactly a year', 'today'])
  })

  it('deletes notices over a year old with them', async () => {
    const t = await setup()
    const now = new Date('2026-10-19T12:00:00Z')
    const notice = (title: string, createdAt: Date) =>
      t.db
        .insert(notices)
        .values({ title, body: 'B', audience: 'all', createdByUserId: t.superUser.id, createdAt })
        .run()
    notice('old', new Date('2025-10-01T12:00:00Z'))
    notice('new', now)
    purgeNotifications(t.db, now)
    expect(
      t.db
        .select()
        .from(notices)
        .all()
        .map((row) => row.title),
    ).toEqual(['new'])
  })
})
