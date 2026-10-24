import { employees } from '#foundation/employees/server/index.ts'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { Access } from '../../shared/constants.ts'
import { createdAt, ms } from './columns.ts'

// ---- People -------------------------------------------------------------------

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
