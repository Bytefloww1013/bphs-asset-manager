import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt, ne, sql } from 'drizzle-orm'
import { LOCK_MINUTES, LOCK_THRESHOLD, REMEMBER_DAYS, type Role } from '../../shared/constants.ts'
import type { SessionUser } from '../../shared/types.ts'
import { config } from '../config.ts'
import type { Db, DbLike } from '../db/client.ts'
import { auditLog, sessions, users } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { HttpError } from '../lib/errors.ts'
import { hashPassword, verifyDecoy, verifyPassword } from '../lib/password.ts'

export interface AuthUser extends Actor {
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
    role: row.role as Role,
    employeeId: row.employeeId,
    mustChangePassword: row.mustChangePassword,
  }
}

function sessionExpiry(now: Date, remember: boolean) {
  return new Date(now.getTime() + (remember ? REMEMBER_DAYS * 24 : config.sessionIdleHours) * 60 * MINUTE)
}

export function createSession(db: DbLike, userId: number, remember: boolean, now = new Date()) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = sessionExpiry(now, remember)
  db.insert(sessions).values({ id: sha256(token), userId, lastSeenAt: now, expiresAt, remember }).run()
  return { token, expiresAt }
}

/**
 * Resolve a cookie token to its user, sliding the expiry forward. Null if unknown, expired or deactivated.
 * `extendedTo` is the new expiry when this lookup moved a remembered session, which the cookie in the browser has to follow.
 * Any other session's cookie ends with the browser, so it has no expiry to move.
 */
export function findSession(db: DbLike, token: string, now = new Date()): { user: AuthUser; extendedTo: Date | null } | null {
  const id = sha256(token)
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), eq(users.isActive, true)))
    .get()
  if (!row) return null
  let extendedTo: Date | null = null
  if (now.getTime() - row.session.lastSeenAt.getTime() > 5 * MINUTE) {
    const expiresAt = sessionExpiry(now, row.session.remember)
    db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id)).run()
    if (row.session.remember) extendedTo = expiresAt
  }
  return { user: toAuthUser(row.user), extendedTo }
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
const LOCKED = (until: Date) =>
  new HttpError(423, 'account_locked', 'This account is locked after too many incorrect attempts.', {
    lockedUntil: until.toISOString(),
  })

export async function login(db: Db, email: string, password: string, remember = false, now = new Date()) {
  const row = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get()
  if (!row || !row.isActive) {
    await verifyDecoy(password)
    throw INVALID()
  }

  if (row.lockedUntil && row.lockedUntil > now) throw LOCKED(row.lockedUntil)
  // A lock that has run out starts the count again.
  if (row.lockedUntil) db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, row.id)).run()

  const correct = await verifyPassword(password, row.passwordHash)

  // Other attempts may have been hashing at the same time, so nothing read before the await above is trusted from
  // here on: the count and the lock are decided in one UPDATE, and a correct password is checked against fresh state.
  if (!correct) {
    const lockUntil = new Date(now.getTime() + LOCK_MINUTES * MINUTE)
    const after = db.transaction((tx) => {
      const before = tx.select({ lockedUntil: users.lockedUntil }).from(users).where(eq(users.id, row.id)).get()
      const updated = tx
        .update(users)
        .set({
          failedLogins: sql`${users.failedLogins} + 1`,
          // An existing lock stands; otherwise this attempt locks the account if it is the one that reaches the limit.
          lockedUntil: sql`case
            when ${users.lockedUntil} > ${now.getTime()} then ${users.lockedUntil}
            when ${users.failedLogins} + 1 >= ${LOCK_THRESHOLD} then ${lockUntil.getTime()}
            else ${users.lockedUntil} end`,
        })
        .where(eq(users.id, row.id))
        .returning({ lockedUntil: users.lockedUntil })
        .get()
      // Of the failed attempts, only the one that sets the lock is logged. Nobody is signed in, so the entry has no user behind it.
      const wasLocked = !!before?.lockedUntil && before.lockedUntil > now
      if (!wasLocked && updated?.lockedUntil && updated.lockedUntil > now) {
        tx.insert(auditLog)
          .values({
            occurredAt: now,
            userId: null,
            actor: 'sign-in',
            action: 'lock',
            entityType: 'user',
            entityId: row.id,
            details: `${row.email} · locked for ${LOCK_MINUTES} minutes after ${LOCK_THRESHOLD} incorrect passwords`,
          })
          .run()
      }
      return updated
    })
    if (after?.lockedUntil && after.lockedUntil > now) throw LOCKED(after.lockedUntil)
    throw INVALID()
  }

  const current = db.select().from(users).where(eq(users.id, row.id)).get()
  // A reset or change that landed during the check makes the checked password stale.
  if (!current || !current.isActive || current.passwordHash !== row.passwordHash) throw INVALID()
  if (current.lockedUntil && current.lockedUntil > now) throw LOCKED(current.lockedUntil)

  const user = toAuthUser({ ...current, failedLogins: 0, lockedUntil: null })
  const session = db.transaction((tx) => {
    tx.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, row.id)).run()
    writeAudit(tx, user, { action: 'sign_in', entityType: 'user', entityId: row.id, details: `${row.email} · signed in`, at: now })
    return createSession(tx, row.id, remember, now)
  })
  return { user, ...session }
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
    // Only over the password checked above: a reset that landed meanwhile must stand, with its sessions ended.
    const { changes } = tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, row.passwordHash)))
      .run()
    if (changes === 0) {
      throw new HttpError(409, 'password_changed', 'Your password was changed or reset while this was being saved. Sign in again.')
    }
    deleteUserSessions(tx, user.id, keepToken)
    writeAudit(tx, user, { action: 'update', entityType: 'user', entityId: user.id, details: `${row.email} · password changed` })
  })
}
