import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt, ne } from 'drizzle-orm'
import { LOCK_MINUTES, LOCK_THRESHOLD, type Role } from '../../shared/constants.ts'
import type { SessionUser } from '../../shared/types.ts'
import { config } from '../config.ts'
import type { Db, DbLike } from '../db/client.ts'
import { sessions, users } from '../db/schema.ts'
import { actorLabel, writeAudit, type Actor } from '../lib/audit.ts'
import { HttpError } from '../lib/errors.ts'
import { hashPassword, verifyDecoy, verifyPassword } from '../lib/password.ts'

export interface AuthUser extends Actor {
  email: string
  mustChangePassword: boolean
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const MINUTE = 60_000

export function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    employeeId: user.employeeId,
  }
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    label: actorLabel(row.email),
    role: row.role as Role,
    employeeId: row.employeeId,
    mustChangePassword: row.mustChangePassword,
  }
}

function sessionExpiry(now: Date) {
  return new Date(now.getTime() + config.sessionIdleHours * 60 * MINUTE)
}

export function createSession(db: DbLike, userId: number, now = new Date()) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = sessionExpiry(now)
  db.insert(sessions).values({ id: sha256(token), userId, lastSeenAt: now, expiresAt }).run()
  return { token, expiresAt }
}

/** Resolve a cookie token to its user, sliding the expiry forward. Null if unknown, expired or deactivated. */
export function findSession(db: DbLike, token: string, now = new Date()): AuthUser | null {
  const id = sha256(token)
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), eq(users.isActive, true)))
    .get()
  if (!row) return null
  if (now.getTime() - row.session.lastSeenAt.getTime() > 5 * MINUTE) {
    db.update(sessions).set({ lastSeenAt: now, expiresAt: sessionExpiry(now) }).where(eq(sessions.id, id)).run()
  }
  return toAuthUser(row.user)
}

export function deleteSession(db: DbLike, token: string) {
  db.delete(sessions).where(eq(sessions.id, sha256(token))).run()
}

export function deleteUserSessions(db: DbLike, userId: number, exceptToken?: string) {
  const condition = exceptToken
    ? and(eq(sessions.userId, userId), ne(sessions.id, sha256(exceptToken)))
    : eq(sessions.userId, userId)
  db.delete(sessions).where(condition).run()
}

export function purgeExpiredSessions(db: DbLike, now = new Date()) {
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run()
}

const INVALID = () => new HttpError(401, 'invalid_credentials', 'Incorrect email or password.')

export async function login(db: Db, email: string, password: string, now = new Date()) {
  const row = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get()
  if (!row || !row.isActive) {
    await verifyDecoy(password)
    throw INVALID()
  }

  // A lock that has run out starts the count again.
  let { failedLogins, lockedUntil } = row
  if (lockedUntil && lockedUntil <= now) {
    failedLogins = 0
    lockedUntil = null
    db.update(users).set({ failedLogins, lockedUntil }).where(eq(users.id, row.id)).run()
  }
  if (lockedUntil) {
    throw new HttpError(423, 'account_locked', 'This account is locked after too many incorrect attempts.', {
      lockedUntil: lockedUntil.toISOString(),
    })
  }

  if (!(await verifyPassword(password, row.passwordHash))) {
    failedLogins += 1
    if (failedLogins >= LOCK_THRESHOLD) {
      const until = new Date(now.getTime() + LOCK_MINUTES * MINUTE)
      db.update(users).set({ failedLogins, lockedUntil: until }).where(eq(users.id, row.id)).run()
      throw new HttpError(423, 'account_locked', 'This account is locked after too many incorrect attempts.', {
        lockedUntil: until.toISOString(),
      })
    }
    db.update(users).set({ failedLogins }).where(eq(users.id, row.id)).run()
    throw INVALID()
  }

  db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, row.id)).run()
  const session = createSession(db, row.id, now)
  return { user: toAuthUser({ ...row, failedLogins: 0, lockedUntil: null }), ...session }
}

export async function changePassword(
  db: Db,
  user: AuthUser,
  currentPassword: string,
  newPassword: string,
  keepToken: string | undefined,
) {
  const row = db.select().from(users).where(eq(users.id, user.id)).get()
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    throw new HttpError(422, 'wrong_password', 'Your current password is not correct.', { field: 'currentPassword' })
  }
  if (await verifyPassword(newPassword, row.passwordHash)) {
    throw new HttpError(422, 'password_reused', 'Choose a password different from the current one.', {
      field: 'newPassword',
    })
  }
  const passwordHash = await hashPassword(newPassword)
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, user.id)).run()
    deleteUserSessions(tx, user.id, keepToken)
    writeAudit(tx, user, { action: 'update', entityType: 'user', entityId: user.id, details: 'password changed' })
  })
}
