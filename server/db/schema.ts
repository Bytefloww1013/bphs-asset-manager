import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AssetStatus, AuditAction, ConditionKind, Role } from '../../shared/constants.ts'

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
    // The one-active-Assignment rule, enforced by the database as well as the app.
    uniqueIndex('uq_assignments_one_open_per_asset')
      .on(t.assetId)
      .where(sql`${t.returnedAt} is null`),
    index('ix_assignments_employee').on(t.employeeId),
    index('ix_assignments_asset').on(t.assetId),
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
