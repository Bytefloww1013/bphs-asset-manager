import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AssetStatus, AuditAction, ConditionKind, DigitalAssetStatus, GrievanceAuditAction, GrievancePersonRole, GrievanceStatus, Role } from '../../shared/constants.ts'

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
    role: text('role').$type<Role>().notNull(),
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
