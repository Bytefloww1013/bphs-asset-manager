import { sql } from 'drizzle-orm'
import { blob, check, type AnySQLiteColumn, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AssetStatus, AuditAction, ConditionKind, DigitalAssetStatus, GrievanceAuditAction, GrievanceEntryKind, GrievancePersonRole, GrievanceStatus, MaintenanceStatus, ReviewAuditAction, ReviewCapStatus, ReviewEntryKind, ReviewStatus, Access } from '../../shared/constants.ts'
import type { GrievanceVersionPerson } from '../../shared/types.ts'

const ms = (name: string) => integer(name, { mode: 'timestamp_ms' })
const createdAt = () => ms('created_at').notNull().default(sql`(unixepoch() * 1000)`)

// ---- People -------------------------------------------------------------------

export const employees = sqliteTable(
  'employees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    department: text('department'),
    jobTitle: text('job_title'),
    /** Set when an Employee with history leaves; they are archived, never deleted. */
    archivedAt: ms('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [index('ix_employees_name').on(t.lastName, t.firstName)],
)

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    /** The level in each section; a section left out is None. */
    access: text('access', { mode: 'json' }).$type<Access>().notNull().default({}),
    /** Full in every section, including any added later, and the only accounts that manage accounts. */
    superAdmin: integer('is_super_admin', { mode: 'boolean' }).notNull().default(false),
    employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'restrict' }),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: ms('locked_until'),
    lastLoginAt: ms('last_login_at'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  /** One account per employee at most; any number of accounts may be linked to nobody. */
  (t) => [uniqueIndex('uq_users_employee').on(t.employeeId)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the cookie token; the token itself is never stored. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: ms('last_seen_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
    /** Signed in with "Keep me signed in": a longer idle limit, and a cookie that outlives the browser. */
    remember: integer('remember', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('ix_sessions_user').on(t.userId)],
)

// ---- Programs ------------------------------------------------------------------

/** A program can hold assets, the same way an employee does. */
export const programs = sqliteTable(
  'programs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** The Program ID people type. Unique whatever the letter case, which the index below holds. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    /** A program that has held an asset is deactivated, never deleted. */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('uq_programs_code').on(sql`${t.code} collate nocase`), index('ix_programs_name').on(t.name)],
)

// ---- Reference lists --------------------------------------------------------------

export const assetTypes = sqliteTable('asset_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

export const conditionRatings = sqliteTable(
  'condition_ratings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    /**
     * 1 to 100, 100 being as good as new. It is what the rating means: the order of the scale, the colour of its badge,
     * the default choice and the dashboard's condition watch all come from it, never from the name. The default of 0 is
     * only there because SQLite needs one to add a NOT NULL column; every row is given a real score.
     */
    score: integer('score').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('uq_condition_ratings_score').on(t.score)],
)

// ---- Assets ---------------------------------------------------------------------------

export const assets = sqliteTable(
  'assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tag: text('tag').notNull().unique(),
    typeId: integer('type_id')
      .notNull()
      .references(() => assetTypes.id, { onDelete: 'restrict' }),
    serial: text('serial'),
    status: text('status').$type<AssetStatus>().notNull().default('in_service'),
    createdAt: createdAt(),
  },
  (t) => [index('ix_assets_type').on(t.typeId), index('ix_assets_serial').on(t.serial)],
)

export const assignments = sqliteTable(
  'assignments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetId: integer('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    /** The holder is an employee or a program, never both and never neither; the check below holds that. */
    employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'restrict' }),
    programId: integer('program_id').references(() => programs.id, { onDelete: 'restrict' }),
    issuedAt: ms('issued_at').notNull(),
    returnedAt: ms('returned_at'),
    issuedById: integer('issued_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    returnedById: integer('returned_by_id').references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // The one-active-Assignment rule, enforced by the database as well as the app.
    uniqueIndex('uq_assignments_one_open_per_asset')
      .on(t.assetId)
      .where(sql`${t.returnedAt} is null`),
    index('ix_assignments_employee').on(t.employeeId),
    index('ix_assignments_program').on(t.programId),
    index('ix_assignments_asset').on(t.assetId),
    check('ck_assignments_one_holder', sql`(${t.employeeId} is null) <> (${t.programId} is null)`),
  ],
)

/** A rating + notes snapshot taken when an asset is received, issued or returned. */
export const conditions = sqliteTable(
  'conditions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetId: integer('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    assignmentId: integer('assignment_id').references(() => assignments.id, { onDelete: 'restrict' }),
    kind: text('kind').$type<ConditionKind>().notNull(),
    ratingId: integer('rating_id')
      .notNull()
      .references(() => conditionRatings.id, { onDelete: 'restrict' }),
    assessedById: integer('assessed_by_id').references(() => employees.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    recordedById: integer('recorded_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    recordedAt: ms('recorded_at').notNull(),
  },
  (t) => [index('ix_conditions_asset').on(t.assetId), index('ix_conditions_rating').on(t.ratingId)],
)

// ---- Digital assets ------------------------------------------------------------------
// A licence or an account, one row per seat that can be given to one employee. Only what names the seat is kept: never a password or key.

export const digitalAssetTypes = sqliteTable('digital_asset_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

export const digitalAssets = sqliteTable(
  'digital_assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** DA-00001, made from the row's own id, which is never handed out twice. */
    code: text('code').notNull().unique(),
    typeId: integer('type_id')
      .notNull()
      .references(() => digitalAssetTypes.id, { onDelete: 'restrict' }),
    /** The License/Account: an email address or a licence reference. */
    account: text('account').notNull(),
    status: text('status').$type<DigitalAssetStatus>().notNull().default('in_service'),
    createdAt: createdAt(),
  },
  (t) => [index('ix_digital_assets_type').on(t.typeId)],
)

export const digitalAssignments = sqliteTable(
  'digital_assignments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    digitalAssetId: integer('digital_asset_id')
      .notNull()
      .references(() => digitalAssets.id, { onDelete: 'restrict' }),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    issuedAt: ms('issued_at').notNull(),
    returnedAt: ms('returned_at'),
    issuedById: integer('issued_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    returnedById: integer('returned_by_id').references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // One open assignment per seat, enforced by the database as well as the app.
    uniqueIndex('uq_digital_assignments_one_open_per_asset')
      .on(t.digitalAssetId)
      .where(sql`${t.returnedAt} is null`),
    index('ix_digital_assignments_employee').on(t.employeeId),
    index('ix_digital_assignments_asset').on(t.digitalAssetId),
  ],
)

// ---- Audit ------------------------------------------------------------------------------

/** Append-only. Nothing in the app updates or deletes these rows. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: ms('occurred_at').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Snapshot of the actor's email so history survives renames and deactivation. Entries from before October 2026 hold only the part before the @. */
    actor: text('actor').notNull(),
    action: text('action').$type<AuditAction>().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id'),
    details: text('details').notNull().default(''),
  },
  (t) => [index('ix_audit_time').on(t.occurredAt), index('ix_audit_action').on(t.action)],
)

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

// ---- Grievances -----------------------------------------------------------------------

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
    correctsEntryId: integer('corrects_entry_id').references((): AnySQLiteColumn => grievanceEntries.id, { onDelete: 'restrict' }),
    /** When it happened, as the person recording it gave it. */
    occurredAt: ms('occurred_at').notNull(),
    /** When it was written down. Set by the server. */
    recordedAt: ms('recorded_at').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    documentedByEmployeeId: integer('documented_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
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
  (t) => [index('ix_grievance_attachments_grievance').on(t.grievanceId), index('ix_grievance_attachments_entry').on(t.entryId)],
)

/** The bytes of each attachment. Only `server/lib/grievance-files.ts` reads or writes this table. */
export const grievanceAttachmentData = sqliteTable('grievance_attachment_data', {
  attachmentId: integer('attachment_id')
    .primaryKey()
    .references(() => grievanceAttachments.id, { onDelete: 'restrict' }),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
})

// ---- Administrative Reviews -------------------------------------------------------------

/**
 * An Administrative Review. Never shown to the account linked to the employee reviewed: every query that reads a review, or
 * anything hanging off one, goes through `reviewsVisibleTo` in `server/services/reviews.ts`.
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
    correctsEntryId: integer('corrects_entry_id').references((): AnySQLiteColumn => reviewEntries.id, { onDelete: 'restrict' }),
    occurredAt: ms('occurred_at').notNull(),
    recordedAt: ms('recorded_at').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    documentedByEmployeeId: integer('documented_by_employee_id').references(() => employees.id, { onDelete: 'set null' }),
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
  (t) => [index('ix_review_audit_time').on(t.occurredAt), index('ix_review_audit_action').on(t.action), index('ix_review_audit_review').on(t.reviewId)],
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

/** The bytes of each review file. Only `server/lib/review-files.ts` reads or writes this table. */
export const reviewAttachmentData = sqliteTable('review_attachment_data', {
  attachmentId: integer('attachment_id')
    .primaryKey()
    .references(() => reviewAttachments.id, { onDelete: 'restrict' }),
  bytes: blob('bytes', { mode: 'buffer' }).notNull(),
})

// ---- Maintenance ------------------------------------------------------------------------

/** A maintenance request, from the Zoho form's webhook or entered by hand. What Zoho sends is kept as the text it sent. */
export const maintenanceRequests = sqliteTable(
  'maintenance_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    /** Empty when none was given, as for a request phoned in. */
    email: text('email').notNull(),
    program: text('program').notNull(),
    location: text('location').notNull(),
    description: text('description').notNull(),
    urgent: text('urgent'),
    requestDate: text('request_date'),
    noticedDate: text('noticed_date'),
    /** Zoho's Added Time, as Zoho formats it. Null for a request entered by hand. */
    zohoAddedTime: text('zoho_added_time'),
    receivedAt: ms('received_at').notNull(),
    status: text('status').$type<MaintenanceStatus>().notNull().default('not_started'),
    assignedEmployeeId: integer('assigned_employee_id').references(() => employees.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // The same Zoho entry sent twice. Hand entries have no Added Time, and nulls never collide.
    uniqueIndex('uq_maintenance_dedupe').on(t.email, t.zohoAddedTime),
    index('ix_maintenance_received').on(t.receivedAt),
    check('ck_maintenance_status', sql`${t.status} in ('not_started', 'dispatched', 'on_hold', 'rejected', 'finished')`),
    // Dispatched means someone has it; Not Started means nobody does yet.
    check('ck_maintenance_dispatch', sql`(${t.status} != 'dispatched' or ${t.assignedEmployeeId} is not null) and (${t.status} != 'not_started' or ${t.assignedEmployeeId} is null)`),
  ],
)

/** A request's timeline: notes, and the lines the app writes when the request changes. */
export const maintenanceNotes = sqliteTable(
  'maintenance_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: integer('request_id')
      .notNull()
      .references(() => maintenanceRequests.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'note' | 'system'>().notNull(),
    body: text('body').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The writer's name as it was, or "Zoho Forms". */
    createdByLabel: text('created_by_label').notNull(),
    createdAt: ms('created_at').notNull(),
  },
  (t) => [index('ix_maintenance_notes_request').on(t.requestId, t.createdAt), check('ck_maintenance_notes_kind', sql`${t.kind} in ('note', 'system')`)],
)

// ---- Notifications ----------------------------------------------------------------------

/** One row per recipient. Written only by `notify()` in server/services/notifications.ts. */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** One of NOTIFICATION_KINDS. Open text, so a new kind needs no migration. */
    kind: text('kind').notNull(),
    /** What the notification is about, as in `asset:113`. It is what "Mute this item" matches. */
    sourceKey: text('source_key').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** An in-app path, never a full URL. */
    link: text('link').notNull(),
    createdAt: ms('created_at').notNull(),
    readAt: ms('read_at'),
    archivedAt: ms('archived_at'),
    /** Whether a mute applied when it arrived: it is in the Inbox but not in the bell's count. */
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('ix_notifications_user').on(t.userId, t.archivedAt, t.createdAt),
    index('ix_notifications_unread').on(t.userId).where(sql`${t.readAt} is null and ${t.archivedAt} is null and ${t.muted} = 0`),
  ],
)

/** "Mute this item" (with a source key) or "Mute this kind" (without), until a time or until the person changes it. */
export const notificationMutes = sqliteTable(
  'notification_mutes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    sourceKey: text('source_key'),
    /** Null means until the person changes it. */
    until: ms('until'),
    createdAt: ms('created_at').notNull(),
  },
  // Muting the same thing again replaces the mute; it never stacks.
  (t) => [uniqueIndex('uq_notification_mutes').on(t.userId, t.kind, sql`coalesce(${t.sourceKey}, '')`)],
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
