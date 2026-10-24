import { writeAudit } from '#foundation/audit/server/index.ts'
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core'
import type { Db, DbLike } from '#kernel/db/client.ts'
import { users } from '#kernel/db/schema.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { invalid, notFound } from '#kernel/lib/errors.ts'
import { isInAppPath, type Section } from '#shared/constants.ts'
import { canAt } from '#shared/permissions.ts'
import { employeeNotificationKinds, notificationKinds, type NotificationKind } from '#shared/registry.ts'
import type { NoticeInput, NotificationListInput } from '../shared/schemas.ts'
import type { NoticeRow, NoticeText, NotificationPage, NotificationRow } from '../shared/types.ts'
import { notices, notifications } from './schema.ts'

export interface NewNotification {
  recipients: number[]
  kind: NotificationKind
  /** What it is about, as in `asset:113`. */
  sourceKey: string
  /** Names the thing, never sensitive details. */
  title: string
  body?: string | null
  /** An in-app path. */
  link: string
}

/**
 * The one writer of notifications. It runs inside the transaction of the change that caused it, so a change that rolls back takes
 * its notifications with it. The actor (null for the server CLI) and inactive accounts get nothing.
 * Returns how many were sent.
 */
export function notify(tx: DbLike, actor: { id: number } | null, input: NewNotification, now = new Date()): number {
  if (!isInAppPath(input.link)) throw new Error(`A notification link must be an in-app path, not ${input.link}`)
  if (!Object.hasOwn(notificationKinds(), input.kind))
    throw new Error(`No module declares the notification kind ${input.kind}`)
  const wanted = [...new Set(input.recipients)].filter((id) => id !== actor?.id)
  if (wanted.length === 0) return 0
  const recipients = tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, wanted), eq(users.isActive, true)))
    .all()
    .map((row) => row.id)
  if (recipients.length === 0) return 0
  tx.insert(notifications)
    .values(
      recipients.map((userId) => ({
        userId,
        kind: input.kind,
        sourceKey: input.sourceKey,
        title: input.title,
        body: input.body ?? null,
        link: input.link,
        createdAt: now,
      })),
    )
    .run()
  return recipients.length
}

/** The active account linked to an employee, as a recipient list: empty when they have none. `uq_users_employee` allows one at most. */
export function accountOf(db: DbLike, employeeId: number | null | undefined): number[] {
  if (!employeeId) return []
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.employeeId, employeeId), eq(users.isActive, true)))
    .all()
    .map((row) => row.id)
}

/** The team for a section: active accounts with Edit or Full there, which takes in every Super Admin. */
export function sectionTeam(db: DbLike, section: Section): number[] {
  return db
    .select({ id: users.id, access: users.access, superAdmin: users.superAdmin })
    .from(users)
    .where(eq(users.isActive, true))
    .all()
    .filter((user) => canAt(user, section, 'edit'))
    .map((user) => user.id)
}

// ---- The Inbox: every function touches the caller's own rows only ------------------------

const toRow = (row: typeof notifications.$inferSelect): NotificationRow => ({
  id: row.id,
  kind: row.kind as NotificationKind,
  title: row.title,
  body: row.body,
  link: row.link,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
})

/** Newest first. All and Unread leave out archived rows; Archived is only those. */
export function listNotifications(db: DbLike, userId: number, input: NotificationListInput): NotificationPage {
  const rows = db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        input.view === 'archived' ? isNotNull(notifications.archivedAt) : isNull(notifications.archivedAt),
        input.view === 'unread' ? isNull(notifications.readAt) : undefined,
        input.before ? lt(notifications.id, input.before) : undefined,
      ),
    )
    .orderBy(desc(notifications.id))
    .limit(input.limit + 1)
    .all()
  const items = rows.slice(0, input.limit).map(toRow)
  return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null }
}

/** The bell's count: unread and not archived. */
export function countUnread(db: DbLike, userId: number): number {
  return (
    db.get<{ n: number }>(
      sql`select count(*) as n from notifications where user_id = ${userId} and read_at is null and archived_at is null`,
    )?.n ?? 0
  )
}

function change(db: DbLike, userId: number, id: number, patch: SQLiteUpdateSetSource<typeof notifications>) {
  const result = db
    .update(notifications)
    .set(patch)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .run()
  // Someone else's notification is answered the same as one that does not exist.
  if (result.changes === 0) throw notFound('Notification')
}

export function setRead(db: DbLike, userId: number, id: number, read: boolean, now = new Date()) {
  change(db, userId, id, { readAt: read ? sql`coalesce(${notifications.readAt}, ${now.getTime()})` : null })
}

export function setArchived(db: DbLike, userId: number, id: number, archived: boolean, now = new Date()) {
  change(db, userId, id, { archivedAt: archived ? now : null })
}

/** Archived rows are left as they are. */
export function markAllRead(db: DbLike, userId: number, now = new Date()) {
  db.update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.archivedAt)))
    .run()
}

// ---- Notices ----------------------------------------------------------------------------

/** Sent notices, newest first, with how many of their recipients have read them: the counts come from the `notice` notifications. */
export function listNotices(db: DbLike, id?: number): NoticeRow[] {
  return db
    .all<Omit<NoticeRow, 'createdAt'> & { createdAt: number }>(
      sql`select n.id as id, n.title as title, n.body as body, n.audience as audience, u.name as sentBy, n.created_at as createdAt,
        coalesce(c.recipients, 0) as recipients, coalesce(c.read, 0) as read
      from notices n
      join users u on u.id = n.created_by_user_id
      left join (select source_key, count(*) as recipients, count(read_at) as read from notifications where kind = 'notice' group by source_key) c
        on c.source_key = 'notice:' || n.id
      ${id === undefined ? sql`` : sql`where n.id = ${id}`}
      order by n.id desc`,
    )
    .map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }))
}

/** One `notice` notification for each active account picked, or for every one. The sender gets none, and a notice nobody would get is refused. */
export function sendNotice(db: Db, actor: Actor, input: NoticeInput, now = new Date()): NoticeRow {
  return db.transaction((tx) => {
    const { id } = tx
      .insert(notices)
      .values({
        title: input.title,
        body: input.body,
        audience: input.audience === 'all' ? 'all' : 'picked',
        createdByUserId: actor.id,
        createdAt: now,
      })
      .returning({ id: notices.id })
      .get()
    const recipients =
      input.audience === 'all'
        ? tx
            .select({ id: users.id })
            .from(users)
            .all()
            .map((row) => row.id)
        : input.audience.userIds
    const sent = notify(
      tx,
      actor,
      {
        recipients,
        kind: 'notice',
        sourceKey: `notice:${id}`,
        title: input.title,
        body: input.body,
        link: `/me/inbox/${id}`,
      },
      now,
    )
    if (sent === 0)
      throw invalid('Nobody would get this notice. It goes only to active accounts, and never to you.', {
        field: 'audience',
      })
    // No title: the main audit log is open to every Assets reader, and a picked notice is for its recipients.
    writeAudit(tx, actor, {
      action: 'create',
      entityType: 'notice',
      entityId: id,
      details: `notice #${id} · to ${input.audience === 'all' ? 'everyone' : 'picked accounts'} · ${sent} recipient${sent === 1 ? '' : 's'}`,
      at: now,
    })
    return listNotices(tx, id)[0]!
  })
}

/** A notice as one of its recipients reads it, which marks their notification read. Anyone it was not sent to gets a 404. */
export function readNotice(db: DbLike, userId: number, id: number, now = new Date()): NoticeText {
  const mine = db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now.getTime()})` })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.kind, 'notice'),
        eq(notifications.sourceKey, `notice:${id}`),
      ),
    )
    .run()
  if (mine.changes === 0) throw notFound('Notice')
  const { id: noticeId, title, body, sentBy, createdAt } = listNotices(db, id)[0]!
  return { id: noticeId, title, body, sentBy, createdAt }
}

/** Notifications over a year old go, read or not, and so do the notices: a notice's recipients are its notifications. Runs on the 6-hourly timer. */
export function purgeNotifications(db: DbLike, now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
  db.delete(notifications).where(lt(notifications.createdAt, cutoff)).run()
  db.delete(notices).where(lt(notices.createdAt, cutoff)).run()
}

/** Drops what an account was told as the employee it was linked to. Call inside the transaction that changes the link. */
export function forgetEmployeeNotifications(tx: DbLike, userId: number) {
  tx.delete(notifications)
    .where(and(eq(notifications.userId, userId), inArray(notifications.kind, [...employeeNotificationKinds()])))
    .run()
}

/** Drops everything sent about one record, for everyone, when the record itself is deleted. */
export function forgetNotifications(tx: DbLike, sourceKey: string) {
  tx.delete(notifications).where(eq(notifications.sourceKey, sourceKey)).run()
}

/** Keeps links working after the page they point at moves (an asset's tag changes). Call inside the transaction that moves it. */
export function relinkNotifications(tx: DbLike, from: string, to: string) {
  tx.update(notifications).set({ link: to }).where(eq(notifications.link, from)).run()
}
