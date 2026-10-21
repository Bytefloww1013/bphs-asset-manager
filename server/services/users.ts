import { and, eq, sql } from 'drizzle-orm'
import { ACCESS_LEVEL_LABEL, WORKSPACE_LABEL, WORKSPACES, type NotificationKind } from '../../shared/constants.ts'
import { describeAccess, workspacesOf, type Grantee } from '../../shared/permissions.ts'
import type { UserCreateInput, UserUpdateInput } from '../../shared/schemas.ts'
import type { UserRow, UserState, UserWithPassword } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, users } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'
import { generateOneTimePassword, hashPassword } from '../lib/password.ts'
import { deleteUserSessions, firstAccountId } from './auth.ts'
import { forgetEmployeeNotifications, notify } from './notifications.ts'
import { fullName } from './refs.ts'

function toRow(row: typeof users.$inferSelect, now = new Date()): UserRow {
  const locked = row.lockedUntil !== null && row.lockedUntil > now
  const state: UserState = !row.isActive ? 'deactivated' : locked ? 'locked' : 'active'
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    access: row.access,
    superAdmin: row.superAdmin,
    employeeId: row.employeeId,
    mustChangePassword: row.mustChangePassword,
    failedLogins: row.failedLogins,
    lockedUntil: locked && row.lockedUntil ? row.lockedUntil.toISOString() : null,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    state,
  }
}

export function listUsers(db: DbLike): UserRow[] {
  const now = new Date()
  return db
    .select()
    .from(users)
    .orderBy(sql`${users.isActive} desc, ${users.name} collate nocase`)
    .all()
    .map((row) => toRow(row, now))
}

function requireUser(db: DbLike, id: number) {
  const row = db.select().from(users).where(eq(users.id, id)).get()
  if (!row) throw notFound('User')
  return row
}

function assertEmailFree(db: DbLike, email: string, exceptId?: number) {
  const dup = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()
  if (dup && dup.id !== exceptId)
    throw conflict('duplicate_email', `An account for ${email} already exists.`, { field: 'email' })
}

function assertEmployee(db: DbLike, id: number | null | undefined) {
  if (id == null) return
  const employee = db.select().from(employees).where(eq(employees.id, id)).get()
  if (!employee) throw invalid('Choose an existing employee to link.', { field: 'employeeId' })
  // An employee is one person, and so is an account. Only called when the link changes, so the account found is another one.
  const taken = db.select({ email: users.email }).from(users).where(eq(users.employeeId, id)).get()
  if (taken) {
    throw conflict(
      'employee_linked',
      `${fullName(employee.firstName, employee.lastName)} is already linked to the account ${taken.email}. Link that account to someone else first.`,
      { field: 'employeeId' },
    )
  }
  // The pickers do not offer archived employees, and an account linked to one would record them as the assessor on what it issues.
  if (employee.archivedAt)
    throw invalid('That employee is archived. Restore them first, or choose someone else.', { field: 'employeeId' })
}

/** An account must be able to open something, or the app has nowhere to land it. */
function assertWorkspace(grantee: Grantee) {
  if (workspacesOf(grantee).length === 0) {
    const names = WORKSPACES.map((w) => WORKSPACE_LABEL[w])
    const list = `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
    throw invalid(`Give at least ${ACCESS_LEVEL_LABEL.read} access to ${list}, or make the account a Super Admin.`, {
      field: 'access',
    })
  }
}

/** An employee as the audit log names one: ID and name, or "none". */
function employeeLabel(db: DbLike, id: number | null) {
  const row = id == null ? undefined : db.select().from(employees).where(eq(employees.id, id)).get()
  return row ? `${row.code} ${fullName(row.firstName, row.lastName)}` : 'none'
}

/** Tells an account about a change to it, so a change nobody expected is noticed. Null actor: the server CLI. */
export function notifyAccount(
  tx: DbLike,
  actor: Actor | null,
  userId: number,
  kind: Extract<NotificationKind, `account_${string}`>,
  title: string,
  body: string,
) {
  notify(tx, actor, { recipients: [userId], kind, sourceKey: `user:${userId}`, title, body, link: '/me/profile' })
}

/** Clearing a failed-attempt count on an account that was never locked is not news. */
export const isLocked = (user: { lockedUntil: Date | null }, now = new Date()) =>
  user.lockedUntil !== null && user.lockedUntil > now

/** `by` says who did it: "by <name>", or "on the server, from its command line". */
export const tellUnlocked = (tx: DbLike, actor: Actor | null, userId: number, by: string) =>
  notifyAccount(tx, actor, userId, 'account_unlocked', 'Your account was unlocked', `Unlocked ${by}.`)
export const tellPasswordReset = (tx: DbLike, actor: Actor | null, userId: number, by: string) =>
  notifyAccount(
    tx,
    actor,
    userId,
    'account_password_reset',
    'Your password was reset',
    `Reset ${by}. If you did not expect this, tell a Super Admin.`,
  )

/** A new account starts with a one-time password and must change it on first login. */
export async function createUser(db: Db, actor: Actor, input: UserCreateInput): Promise<UserWithPassword> {
  const oneTimePassword = generateOneTimePassword()
  const passwordHash = await hashPassword(oneTimePassword)
  assertWorkspace(input)
  const id = db.transaction((tx) => {
    assertEmailFree(tx, input.email)
    assertEmployee(tx, input.employeeId)
    const row = tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        access: input.access,
        superAdmin: input.superAdmin,
        employeeId: input.employeeId,
        mustChangePassword: true,
      })
      .returning({ id: users.id })
      .get()
    writeAudit(tx, actor, {
      action: 'create',
      entityType: 'user',
      entityId: row.id,
      details: `${input.email} · ${describeAccess(input)}`,
    })
    return row.id
  })
  return { user: toRow(requireUser(db, id)), oneTimePassword }
}

export function updateUser(db: Db, actor: Actor, id: number, input: UserUpdateInput): UserRow {
  db.transaction((tx) => {
    const current = requireUser(tx, id)
    const patch: Partial<typeof users.$inferInsert> = {}
    const changes: string[] = []
    if (input.name !== undefined && input.name !== current.name) {
      patch.name = input.name
      changes.push(`name: ${current.name} → ${input.name}`)
    }
    const was = { access: current.access, superAdmin: current.superAdmin }
    const next = { access: input.access ?? was.access, superAdmin: input.superAdmin ?? was.superAdmin }
    if (describeAccess(next) !== describeAccess(was)) {
      if (id === actor.id) throw conflict('self_access', 'You cannot change your own access.')
      if (was.superAdmin && !next.superAdmin && activeSuperAdmins(tx) <= 1 && current.isActive) {
        throw conflict('last_super_admin', 'There must always be at least one active Super Admin.')
      }
      assertWorkspace(next)
      patch.access = next.access
      patch.superAdmin = next.superAdmin
      changes.push(`access: ${describeAccess(was)} → ${describeAccess(next)}`)
    }
    if (input.employeeId !== undefined && (input.employeeId ?? null) !== current.employeeId) {
      // Otherwise someone could unlink themselves to see an Administrative Review about them.
      if (id === actor.id) throw conflict('self_link', 'You cannot change the employee linked to your own account.')
      if (input.employeeId == null && id !== firstAccountId(tx))
        throw invalid('Every account must be linked to an employee.', { field: 'employeeId' })
      assertEmployee(tx, input.employeeId)
      patch.employeeId = input.employeeId ?? null
      changes.push(`linked employee: ${employeeLabel(tx, current.employeeId)} → ${employeeLabel(tx, patch.employeeId)}`)
    }
    if (changes.length === 0) return
    tx.update(users).set(patch).where(eq(users.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: id,
      details: `${current.email} · ${changes.join('; ')}`,
    })
    if (patch.access) {
      notifyAccount(
        tx,
        actor,
        id,
        'account_access_changed',
        'Your access was changed',
        `Changed by ${actor.name}. See your Profile for what you can do now.`,
      )
    }
    if (patch.employeeId !== undefined) {
      forgetEmployeeNotifications(tx, id)
      notifyAccount(
        tx,
        actor,
        id,
        'account_employee_linked',
        'The employee linked to your account was changed',
        `Now ${employeeLabel(tx, patch.employeeId)}. Changed by ${actor.name}.`,
      )
    }
  })
  return toRow(requireUser(db, id))
}

function activeSuperAdmins(db: DbLike): number {
  return db.get<{ n: number }>(sql`select count(*) as n from users where is_super_admin = 1 and is_active = 1`)?.n ?? 0
}

export async function resetPassword(db: Db, actor: Actor, id: number): Promise<UserWithPassword> {
  // A reset ends every session of the target, so resetting yourself would sign you out before the one-time password is read.
  if (id === actor.id)
    throw conflict('self_reset', 'You cannot reset your own password. Use Change password in your user menu.')
  const oneTimePassword = generateOneTimePassword()
  const passwordHash = await hashPassword(oneTimePassword)
  db.transaction((tx) => {
    const target = requireUser(tx, id)
    tx.update(users)
      .set({ passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, id))
      .run()
    deleteUserSessions(tx, id)
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: id,
      details: `${target.email} · password reset · must change on next login`,
    })
    tellPasswordReset(tx, actor, id, `by ${actor.name}`)
  })
  return { user: toRow(requireUser(db, id)), oneTimePassword }
}

export function clearLock(db: Db, actor: Actor, id: number): UserRow {
  db.transaction((tx) => {
    const target = requireUser(tx, id)
    tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: id,
      details: `${target.email} · locked_until cleared`,
    })
    if (isLocked(target)) tellUnlocked(tx, actor, id, `by ${actor.name}`)
  })
  return toRow(requireUser(db, id))
}

export function setActive(db: Db, actor: Actor, id: number, active: boolean): UserRow {
  db.transaction((tx) => {
    const current = requireUser(tx, id)
    if (current.isActive === active) return
    if (!active) {
      if (id === actor.id) throw conflict('self_deactivate', 'You cannot deactivate your own account.')
      if (current.superAdmin && activeSuperAdmins(tx) <= 1) {
        throw conflict('last_super_admin', 'There must always be at least one active Super Admin.')
      }
      deleteUserSessions(tx, id)
    }
    tx.update(users)
      .set({ isActive: active })
      .where(and(eq(users.id, id)))
      .run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: id,
      details: `${current.email} · ${active ? 'reactivated' : 'deactivated'}`,
    })
  })
  return toRow(requireUser(db, id))
}
