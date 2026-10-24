import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'

/** One row per recipient. Written only by `notify()` (`service.ts`). */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A kind some module's manifest declares (`notificationKinds()`). Open text, so a new kind needs no migration. */
    kind: text('kind').notNull(),
    /** What the notification is about, as in `asset:113`. */
    sourceKey: text('source_key').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** An in-app path, never a full URL. */
    link: text('link').notNull(),
    createdAt: ms('created_at').notNull(),
    readAt: ms('read_at'),
    archivedAt: ms('archived_at'),
  },
  (t) => [
    index('ix_notifications_user').on(t.userId, t.archivedAt, t.createdAt),
    index('ix_notifications_unread')
      .on(t.userId)
      .where(sql`${t.readAt} is null and ${t.archivedAt} is null`),
    // The overdue reminders and the notices look rows up by what they are about.
    index('ix_notifications_source').on(t.sourceKey, t.kind),
  ],
)

/** An announcement a Super Admin sends. Each recipient gets a `notice` notification with the source key `notice:<id>`. */
export const notices = sqliteTable(
  'notices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    audience: text('audience').$type<'all' | 'picked'>().notNull(),
    createdByUserId: integer('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: ms('created_at').notNull(),
  },
  (t) => [check('ck_notices_audience', sql`${t.audience} in ('all', 'picked')`)],
)
