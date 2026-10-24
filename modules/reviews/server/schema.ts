// The reviews' tables (issue #23): each review, its Corrective Action Plans, its history, its files and their bytes, and the
// Review Audit Log, which is kept apart from the Audit Log and the Grievance Audit Log.
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
import type { ReviewAuditAction, ReviewCapStatus, ReviewEntryKind, ReviewStatus } from '../shared/constants.ts'

/**
 * An Administrative Review. Never shown to the account linked to the employee reviewed: every query that reads a review, or
 * anything hanging off one, goes through `reviewsVisibleTo` in `service.ts`.
 */
export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** AR-2026-0001: the year the record was entered (not the review date) and its number within that year. */
    code: text('code').notNull().unique(),
    year: integer('year').notNull(),
    seq: integer('seq').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    /** Plain text, several lines. */
    findings: text('findings').notNull().default(''),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    /** A calendar date as `YYYY-MM-DD` text, so time zones cannot shift it. */
    reviewDate: text('review_date').notNull(),
    /** The employee reviewed. */
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    reviewerId: integer('reviewer_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    status: text('status').$type<ReviewStatus>().notNull().default('open'),
    /** Starts at 1 and goes up by one with each edit. */
    version: integer('version').notNull().default(1),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    lastActivityAt: ms('last_activity_at').notNull(),
    completedAt: ms('completed_at'),
  },
  (t) => [
    uniqueIndex('uq_reviews_year_seq').on(t.year, t.seq),
    index('ix_reviews_status').on(t.status),
    index('ix_reviews_employee').on(t.employeeId),
    index('ix_reviews_reviewer').on(t.reviewerId),
    index('ix_reviews_review_date').on(t.reviewDate),
    check('ck_reviews_status', sql`${t.status} in ('open', 'in_progress', 'completed', 'voided')`),
    check('ck_reviews_people', sql`${t.employeeId} != ${t.reviewerId}`),
  ],
)

/** A Corrective Action Plan on a review, as it is now. Every change to one is also written to `review_entries`. */
export const reviewCaps = sqliteTable(
  'review_caps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'restrict' }),
    /** CAP01, CAP02 and so on, within its review. */
    seq: integer('seq').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    responsibleEmployeeId: integer('responsible_employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    /** Optional, as `YYYY-MM-DD` text. */
    dueDate: text('due_date'),
    status: text('status').$type<ReviewCapStatus>().notNull().default('not_started'),
    version: integer('version').notNull().default(1),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: ms('updated_at').notNull(),
    completedAt: ms('completed_at'),
    completedByUserId: integer('completed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
    /** The name as it was when the CAP was completed. */
    completedByLabel: text('completed_by_label'),
  },
  (t) => [
    uniqueIndex('uq_review_caps_seq').on(t.reviewId, t.seq),
    index('ix_review_caps_responsible').on(t.responsibleEmployeeId),
    index('ix_review_caps_due').on(t.dueDate),
    check('ck_review_caps_status', sql`${t.status} in ('not_started', 'in_progress', 'completed', 'cancelled')`),
    check('ck_review_caps_completed', sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`),
  ],
)

/**
 * A review's history: updates, corrections and what the app recorded. Append-only, and triggers in the migration hold it to that,
 * and to an entry's CAP and corrected entry being on the same review.
 */
export const reviewEntries = sqliteTable(
  'review_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'restrict' }),
    /** Null when the entry is about the review itself. */
    capId: integer('cap_id').references(() => reviewCaps.id, { onDelete: 'restrict' }),
    /** E01, E02 and so on: the order entries were recorded in. */
    seq: integer('seq').notNull(),
    kind: text('kind').$type<ReviewEntryKind>().notNull(),
    correctsEntryId: integer('corrects_entry_id').references((): AnySQLiteColumn => reviewEntries.id, {
      onDelete: 'restrict',
    }),
    occurredAt: ms('occurred_at').notNull(),
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
    documentedByLabel: text('documented_by_label').notNull(),
  },
  (t) => [
    uniqueIndex('uq_review_entries_seq').on(t.reviewId, t.seq),
    index('ix_review_entries_occurred').on(t.reviewId, t.occurredAt),
    index('ix_review_entries_cap').on(t.capId),
    check('ck_review_entries_kind', sql`${t.kind} in ('update', 'correction', 'system')`),
    check('ck_review_entries_corrects', sql`(${t.kind} = 'correction') = (${t.correctsEntryId} is not null)`),
  ],
)

/** The Review Audit Log: the Grievance Audit Log's shape, plus the review an entry is about, so it can be hidden from its employee reviewed. */
export const reviewAuditLog = sqliteTable(
  'review_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: ms('occurred_at').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').$type<ReviewAuditAction>().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    reviewId: integer('review_id').references(() => reviews.id, { onDelete: 'restrict' }),
    details: text('details').notNull().default(''),
  },
  (t) => [
    index('ix_review_audit_time').on(t.occurredAt),
    index('ix_review_audit_action').on(t.action),
    index('ix_review_audit_review').on(t.reviewId),
  ],
)

/**
 * A file on a review, or on one of its CAPs: a grievance file's columns, plus the CAP. Each hangs off the automatic history entry
 * that records it, which a trigger holds to the same review and CAP. Only a withdrawal changes a row, once.
 */
export const reviewAttachments = sqliteTable(
  'review_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'restrict' }),
    /** Null for a file on the review itself. */
    capId: integer('cap_id').references(() => reviewCaps.id, { onDelete: 'restrict' }),
    entryId: integer('entry_id')
      .notNull()
      .references(() => reviewEntries.id, { onDelete: 'restrict' }),
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
  (t) => [index('ix_review_attachments_review').on(t.reviewId), index('ix_review_attachments_cap').on(t.capId)],
)

/** The bytes of each review file. Only `files.ts` reads or writes this table. */
export const reviewAttachmentData = sqliteTable('review_attachment_data', {
  attachmentId: integer('attachment_id')
    .primaryKey()
    .references(() => reviewAttachments.id, { onDelete: 'restrict' }),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
})
