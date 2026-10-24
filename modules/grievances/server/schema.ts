// The grievances' tables (issue #23): each grievance, the people named on it, its earlier versions, its timeline, its files and
// their bytes, the categories, and the Grievance Audit Log, which is kept apart from the Audit Log.
import { employees } from '#foundation/employees/server/index.ts'
import { sql } from 'drizzle-orm'
import {
  blob,
  check,
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { createdAt, ms } from '#kernel/db/columns.ts'
import { users } from '#kernel/db/schema.ts'
import type {
  GrievanceAuditAction,
  GrievanceEntryKind,
  GrievancePersonRole,
  GrievanceStatus,
} from '../shared/constants.ts'
import type { GrievanceVersionPerson } from '../shared/types.ts'

/** The Grievance Audit Log: the same shape as `audit_log`, and kept apart from it. */
export const grievanceAuditLog = sqliteTable(
  'grievance_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: ms('occurred_at').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').$type<GrievanceAuditAction>().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    details: text('details').notNull().default(''),
  },
  (t) => [index('ix_grievance_audit_time').on(t.occurredAt), index('ix_grievance_audit_action').on(t.action)],
)

export const grievanceCategories = sqliteTable('grievance_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
})

export const grievances = sqliteTable(
  'grievances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** GR-2026-0001: the year the record was entered (not Date Made) and its number within that year. */
    code: text('code').notNull().unique(),
    year: integer('year').notNull(),
    seq: integer('seq').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    /** A calendar date as `YYYY-MM-DD` text, so time zones cannot shift it. */
    dateMade: text('date_made').notNull(),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => grievanceCategories.id, { onDelete: 'restrict' }),
    status: text('status').$type<GrievanceStatus>().notNull().default('open'),
    /** Starts at 1 and goes up by one with each edit. */
    version: integer('version').notNull().default(1),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    lastActivityAt: ms('last_activity_at').notNull(),
  },
  (t) => [
    uniqueIndex('uq_grievances_year_seq').on(t.year, t.seq),
    index('ix_grievances_status').on(t.status),
    index('ix_grievances_owner').on(t.ownerId),
    index('ix_grievances_category').on(t.categoryId),
    index('ix_grievances_date_made').on(t.dateMade),
    check('ck_grievances_status', sql`${t.status} in ('open', 'in_progress', 'resolved', 'closed', 'voided')`),
  ],
)

export const grievancePeople = sqliteTable(
  'grievance_people',
  {
    grievanceId: integer('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'cascade' }),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    role: text('role').$type<GrievancePersonRole>().notNull(),
  },
  (t) => [
    uniqueIndex('uq_grievance_people').on(t.grievanceId, t.employeeId, t.role),
    index('ix_grievance_people_employee').on(t.employeeId),
    check('ck_grievance_people_role', sql`${t.role} in ('employee', 'management')`),
  ],
)

/**
 * A grievance as it stood before an edit replaced it: one row for each earlier version, written by the edit. Append-only, and
 * triggers in the migration hold it to that. Names are kept as text, as they were, so a later rename changes nothing here.
 */
export const grievanceVersions = sqliteTable(
  'grievance_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    grievanceId: integer('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'restrict' }),
    /** The version this row holds: 1 for the grievance as first recorded. */
    version: integer('version').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    dateMade: text('date_made').notNull(),
    categoryName: text('category_name').notNull(),
    /** Everyone named on it then, as JSON: `[{ role, code, name }]`. */
    people: text('people', { mode: 'json' }).$type<GrievanceVersionPerson[]>().notNull(),
    /** Who replaced this version, when, and the reason they gave. */
    changedByUserId: integer('changed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    changedByLabel: text('changed_by_label').notNull(),
    changedAt: ms('changed_at').notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [uniqueIndex('uq_grievance_versions').on(t.grievanceId, t.version)],
)

/**
 * The timeline of a grievance: what was done and what happened, one entry each. Append-only, and triggers in the migration
 * hold it to that: an entry is never changed or removed, only corrected by a later entry that points back at it.
 */
export const grievanceEntries = sqliteTable(
  'grievance_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    grievanceId: integer('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'restrict' }),
    /** E01, E02 and so on: the order entries were recorded in, which is not always the order things happened in. */
    seq: integer('seq').notNull(),
    kind: text('kind').$type<GrievanceEntryKind>().notNull(),
    /** Set only on a correction: the entry it corrects, in the same grievance. */
    correctsEntryId: integer('corrects_entry_id').references((): AnySQLiteColumn => grievanceEntries.id, {
      onDelete: 'restrict',
    }),
    /** When it happened, as the person recording it gave it. */
    occurredAt: ms('occurred_at').notNull(),
    /** When it was written down. Set by the server. */
    recordedAt: ms('recorded_at').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    documentedByEmployeeId: integer('documented_by_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    documentedByUserId: integer('documented_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The name as it was when the entry was written. */
    documentedByLabel: text('documented_by_label').notNull(),
  },
  (t) => [
    uniqueIndex('uq_grievance_entries_seq').on(t.grievanceId, t.seq),
    index('ix_grievance_entries_occurred').on(t.grievanceId, t.occurredAt),
    check('ck_grievance_entries_kind', sql`${t.kind} in ('action', 'event', 'correction', 'system')`),
    check('ck_grievance_entries_corrects', sql`(${t.kind} = 'correction') = (${t.correctsEntryId} is not null)`),
  ],
)

/**
 * A file added to a grievance, or to one entry on its timeline. Never removed: a file added by mistake is withdrawn, which keeps
 * this row and stops downloads. The bytes are in `grievance_attachment_data`, so a list never loads them.
 */
export const grievanceAttachments = sqliteTable(
  'grievance_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    grievanceId: integer('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'restrict' }),
    /** The entry it belongs to; null for a file added with the grievance itself. */
    entryId: integer('entry_id').references(() => grievanceEntries.id, { onDelete: 'restrict' }),
    filename: text('filename').notNull(),
    /** Decided by the server from the file's content, never taken from the request. */
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    uploadedByUserId: integer('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** The name as it was when the file was added. */
    uploadedByLabel: text('uploaded_by_label').notNull(),
    uploadedAt: ms('uploaded_at').notNull(),
    withdrawnAt: ms('withdrawn_at'),
    withdrawnReason: text('withdrawn_reason'),
  },
  (t) => [
    index('ix_grievance_attachments_grievance').on(t.grievanceId),
    index('ix_grievance_attachments_entry').on(t.entryId),
  ],
)

/** The bytes of each attachment. Only `server/files.ts` reads or writes this table. */
export const grievanceAttachmentData = sqliteTable('grievance_attachment_data', {
  attachmentId: integer('attachment_id')
    .primaryKey()
    .references(() => grievanceAttachments.id, { onDelete: 'restrict' }),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
})
