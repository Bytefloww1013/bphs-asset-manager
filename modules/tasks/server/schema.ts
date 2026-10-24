// The tasks' tables (issue #23): each task sent to one account, its history, its files and their bytes. Tasks belong to
// accounts (`users`), not employees.
import { createdAt, ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'
import { sql } from 'drizzle-orm'
import { blob, check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { TaskAssignerReminders, TaskEventKind, TaskFileSide, TaskWeekday } from '../shared/constants.ts'

/** A task sent to one account. Its status is worked out from these times by `taskStatus()` in `../shared/tasks.ts`, never stored. */
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assigneeUserId: integer('assignee_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignerUserId: integer('assigner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Whether a Super Admin assigned it, as they were then: such a task needs Full to change. */
    assignerSuperAdmin: integer('assigner_super_admin', { mode: 'boolean' }).notNull().default(false),
    title: text('title').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    /** When it reaches the assignee: when it was assigned, or the scheduled send. */
    sendAt: ms('send_at').notNull(),
    dueAt: ms('due_at').notNull(),
    requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(false),
    /** Whether Mark complete needs at least one of the assignee's files on the task. */
    requiresFile: integer('requires_file', { mode: 'boolean' }).notNull().default(false),
    completedAt: ms('completed_at'),
    completionNote: text('completion_note'),
    approvedAt: ms('approved_at'),
    cancelledAt: ms('cancelled_at'),
    reminderDays: text('reminder_days', { mode: 'json' }).$type<TaskWeekday[]>().notNull(),
    /** HH:MM, in `reminderZone`, the assigner's time zone when they saved it. */
    reminderTime: text('reminder_time').notNull(),
    reminderZone: text('reminder_zone').notNull(),
    assignerReminders: text('assigner_reminders').$type<TaskAssignerReminders>().notNull().default('none'),
    // The task clock's markers, so a restart never sends anything twice.
    /** When the assignee was told it had arrived. */
    arrivedAt: ms('arrived_at'),
    /** When the clock first found it past due. */
    pastDueNotifiedAt: ms('past_due_notified_at'),
    /** The local date (YYYY-MM-DD, in `reminderZone`) of the last past-due reminder. */
    lastRemindedOn: text('last_reminded_on'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ix_tasks_assignee').on(t.assigneeUserId, t.sendAt),
    index('ix_tasks_due').on(t.dueAt),
    // The clock's every-minute look for what is still to be sent.
    index('ix_tasks_unsent')
      .on(t.sendAt)
      .where(sql`${t.arrivedAt} is null`),
    check('ck_tasks_assigner_reminders', sql`${t.assignerReminders} in ('none', 'first', 'every')`),
    check('ck_tasks_due', sql`${t.dueAt} > ${t.sendAt}`),
    check('ck_tasks_approved', sql`${t.approvedAt} is null or ${t.completedAt} is not null`),
  ],
)

/** A task's history. Goes with its task when a task is deleted. */
export const taskEvents = sqliteTable(
  'task_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<TaskEventKind>().notNull(),
    /** What the person wrote: a completion or send-back note. */
    note: text('note'),
    /** What the app records, as in which fields an edit changed. */
    details: text('details').notNull().default(''),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The name as it was. */
    actorLabel: text('actor_label').notNull(),
    createdAt: ms('created_at').notNull(),
  },
  (t) => [
    index('ix_task_events_task').on(t.taskId, t.createdAt),
    check(
      'ck_task_events_kind',
      sql`${t.kind} in ('assigned', 'edited', 'completed', 'sent_back', 'approved', 'cancelled', 'file_withdrawn')`,
    ),
  ],
)

/** A file on a task: the assigner's (with the task) or the assignee's (with a completion). Goes with its task; only a withdrawal changes a row, once. */
export const taskAttachments = sqliteTable(
  'task_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    side: text('side').$type<TaskFileSide>().notNull(),
    filename: text('filename').notNull(),
    /** Decided by the server from the file's content, never taken from the request. */
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    uploadedByUserId: integer('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The name as it was when the file was added. */
    uploadedByLabel: text('uploaded_by_label').notNull(),
    uploadedAt: ms('uploaded_at').notNull(),
    withdrawnAt: ms('withdrawn_at'),
    withdrawnReason: text('withdrawn_reason'),
  },
  (t) => [
    index('ix_task_attachments_task').on(t.taskId),
    check('ck_task_attachments_side', sql`${t.side} in ('assigner', 'assignee')`),
  ],
)

/** The bytes of each task file. Only `./files.ts` reads or writes this table. */
export const taskAttachmentData = sqliteTable('task_attachment_data', {
  attachmentId: integer('attachment_id')
    .primaryKey()
    .references(() => taskAttachments.id, { onDelete: 'cascade' }),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
})
