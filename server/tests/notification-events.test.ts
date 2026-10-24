import { employees } from '#foundation/employees/server/index.ts'
import { notifications } from '#foundation/notifications/server/index.ts'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { users } from '../db/schema.ts'
import { clearLock, resetPassword, updateUser } from '../services/users.ts'
import { setup } from '../testing/index.ts'

type T = Awaited<ReturnType<typeof setup>>

const everything = (t: T) => t.db.select().from(notifications).orderBy(notifications.id).all()
const rowsOf = (t: T, userId: number, kind?: string) =>
  everything(t).filter((row) => row.userId === userId && (!kind || row.kind === kind))
/** An employee, with an account when an email is given. */
function person(t: T, code: string, email?: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const employee = t.db.insert(employees).values({ code, firstName: 'Sam', lastName: code }).returning().get()
  const account = email
    ? t.db
        .insert(users)
        .values({
          name: `Sam ${code}`,
          email,
          passwordHash: t.superUser.passwordHash,
          mustChangePassword: false,
          employeeId: employee.id,
          ...extra,
        })
        .returning()
        .get()
    : null
  return { employee, account }
}

describe('account and security events', () => {
  it('tells the account about access, Super Admin, linked employee, password reset and unlock', async () => {
    const t = await setup()
    const linked = person(t, 'E-2').employee
    const id = t.adminUser.id
    updateUser(t.db, t.superUser, id, { name: 'Marcus O.' })
    updateUser(t.db, t.superUser, id, { access: { assets: 'full' } })
    updateUser(t.db, t.superUser, id, { superAdmin: true })
    updateUser(t.db, t.superUser, id, { employeeId: linked.id })
    await resetPassword(t.db, t.superUser, id)
    clearLock(t.db, t.superUser, id)
    t.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(users.id, id))
      .run()
    clearLock(t.db, t.superUser, id)

    const common = { sourceKey: `user:${id}`, link: '/me/profile' }
    expect(rowsOf(t, id)).toMatchObject([
      {
        ...common,
        kind: 'account_access_changed',
        title: 'Your access was changed',
        body: 'Changed by Priya Raghunathan. See your Profile for what you can do now.',
      },
      { ...common, kind: 'account_access_changed' },
      { ...common, kind: 'account_employee_linked', body: 'Now E-2 Sam E-2. Changed by Priya Raghunathan.' },
      { ...common, kind: 'account_password_reset', title: 'Your password was reset' },
      {
        ...common,
        kind: 'account_unlocked',
        title: 'Your account was unlocked',
        body: 'Unlocked by Priya Raghunathan.',
      },
    ])
  })
})
