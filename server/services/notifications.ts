import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core'
import { NOTIFICATION_KINDS, OVERDUE_DAYS, isInAppPath, muteEnds, type NotificationKind, type Section } from '../../shared/constants.ts'
import { canAt } from '../../shared/permissions.ts'
import type { MuteInput, NotificationListInput } from '../../shared/schemas.ts'
import type { MuteRow, NotificationPage, NotificationRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { notificationMutes, notifications, users } from '../db/schema.ts'
import { invalid, notFound } from '../lib/errors.ts'
import { daysBetween } from '../lib/time.ts'

export interface NewNotification {
  recipients: number[]
  kind: NotificationKind
  /** What it is about, as in `asset:113`: what "Mute this item" matches. */
  sourceKey: string
  /** Names the thing, never sensitive details. */
  title: string
  body?: string | null
  /** An in-app path. */
  link: string
}

/**
 * The one writer of notifications. It runs inside the transaction of the change that caused it, so a change that rolls back takes
 * its notifications with it. The actor (null for the server CLI) and inactive accounts get nothing; a live mute marks the row muted.
 */
export function notify(tx: DbLike, actor: { id: number } | null, input: NewNotification, now = new Date()) {
  if (!isInAppPath(input.link)) throw new Error(`A notification link must be an in-app path, not ${input.link}`)
  const wanted = [...new Set(input.recipients)].filter((id) => id !== actor?.id)
  if (wanted.length === 0) return
  const recipients = tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, wanted), eq(users.isActive, true)))
    .all()
    .map((row) => row.id)
  if (recipients.length === 0) return
  const muted = new Set(
    NOTIFICATION_KINDS[input.kind].unmutable
      ? []
      : tx
          .select({ userId: notificationMutes.userId })
          .from(notificationMutes)
          .where(
            and(
              inArray(notificationMutes.userId, recipients),
              eq(notificationMutes.kind, input.kind),
              or(isNull(notificationMutes.sourceKey), eq(notificationMutes.sourceKey, input.sourceKey)),
              or(isNull(notificationMutes.until), gt(notificationMutes.until, now)),
            ),
          )
          .all()
          .map((row) => row.userId),
  )
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
        muted: muted.has(userId),
      })),
    )
    .run()
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
  sourceKey: row.sourceKey,
  title: row.title,
  body: row.body,
  link: row.link,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  muted: row.muted,
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

/** The bell's count: unread, not archived and not muted. */
export function countUnread(db: DbLike, userId: number): number {
  return (
    db.get<{ n: number }>(
      sql`select count(*) as n from notifications where user_id = ${userId} and read_at is null and archived_at is null and muted = 0`,
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

// ---- Mutes ------------------------------------------------------------------------------

const toMute = ({ mute, about }: { mute: typeof notificationMutes.$inferSelect; about: string | null }): MuteRow => ({
  id: mute.id,
  kind: mute.kind as NotificationKind,
  sourceKey: mute.sourceKey,
  about,
  until: mute.until?.toISOString() ?? null,
  createdAt: mute.createdAt.toISOString(),
})

const selectMutes = (db: DbLike) =>
  db
    .select({
      mute: notificationMutes,
      // Written out in full: drizzle leaves the outer columns unqualified, and inside the subquery they would mean n's own.
      about: sql<string | null>`(select n.title from notifications n where n.user_id = notification_mutes.user_id and n.kind = notification_mutes.kind and n.source_key = notification_mutes.source_key order by n.id desc limit 1)`,
    })
    .from(notificationMutes)

/** Muting the same thing again replaces the old mute, so the new duration is the one that holds. */
export function addMute(db: Db, userId: number, input: MuteInput, now = new Date()): MuteRow {
  const kind = NOTIFICATION_KINDS[input.kind]
  if (kind.unmutable) throw invalid(`${kind.label} cannot be muted.`, { field: 'kind' })
  const sourceKey = input.sourceKey ?? null
  return db.transaction((tx) => {
    tx.delete(notificationMutes)
      .where(
        and(
          eq(notificationMutes.userId, userId),
          eq(notificationMutes.kind, input.kind),
          sourceKey === null ? isNull(notificationMutes.sourceKey) : eq(notificationMutes.sourceKey, sourceKey),
        ),
      )
      .run()
    const { id } = tx
      .insert(notificationMutes)
      .values({ userId, kind: input.kind, sourceKey, until: muteEnds(input.duration, now), createdAt: now })
      .returning({ id: notificationMutes.id })
      .get()
    return toMute(selectMutes(tx).where(eq(notificationMutes.id, id)).get()!)
  })
}

/** Live mutes only, newest first. */
export function listMutes(db: DbLike, userId: number, now = new Date()): MuteRow[] {
  return selectMutes(db)
    .where(and(eq(notificationMutes.userId, userId), or(isNull(notificationMutes.until), gt(notificationMutes.until, now))))
    .orderBy(desc(notificationMutes.id))
    .all()
    .map(toMute)
}

export function deleteMute(db: DbLike, userId: number, id: number) {
  const result = db
    .delete(notificationMutes)
    .where(and(eq(notificationMutes.id, id), eq(notificationMutes.userId, userId)))
    .run()
  if (result.changes === 0) throw notFound('Mute')
}

/** Notifications over a year old go, read or not, and so do mutes that have ended. Runs on the 6-hourly timer. */
export function purgeNotifications(db: DbLike, now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
  db.delete(notifications).where(lt(notifications.createdAt, cutoff)).run()
  db.delete(notificationMutes).where(lte(notificationMutes.until, now)).run()
}

/**
 * Tells each employee holding an asset past OVERDUE_DAYS, once per assignment. Runs on the 6-hourly timer.
 * shortcut: a reminder is sent again once the first one is purged a year on; keep a sent-at column if that matters.
 */
export function sendOverdueReminders(db: DbLike, now = new Date()) {
  const open = db.all<{ id: number; tag: string; employeeId: number; issuedAt: number }>(sql`
    select a.id as id, s.tag as tag, a.employee_id as employeeId, a.issued_at as issuedAt
    from assignments a join assets s on s.id = a.asset_id
    where a.returned_at is null and a.employee_id is not null
      and not exists (select 1 from notifications n where n.kind = 'asset_overdue' and n.source_key = 'assignment:' || a.id)`)
  for (const row of open) {
    const days = daysBetween(new Date(row.issuedAt), now)
    // The same rule as the Overview's overdue count.
    if (days <= OVERDUE_DAYS) continue
    notify(
      db,
      null,
      {
        recipients: accountOf(db, row.employeeId),
        kind: 'asset_overdue',
        sourceKey: `assignment:${row.id}`,
        title: `${row.tag} is overdue`,
        body: `It has been issued to you for ${days} days.`,
        link: `/assets/${row.tag}`,
      },
      now,
    )
  }
}
