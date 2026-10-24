// What a physical asset tells the employee who holds it, and the Assets team when one comes back poor.
import { employees } from '#foundation/employees/server/index.ts'
import { notifications } from '#foundation/notifications/server/index.ts'
import { programs } from '#foundation/programs/server/index.ts'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { users } from '#kernel/db/schema.ts'
import { resetPassword, updateUser } from '#kernel/services/users.ts'
import { setup } from '#kernel/testing/index.ts'
import { issueAsset, issueInTx, returnAssignment, returnMany, sendOverdueReminders } from './assignments.ts'
import { assetBrands, assetTypes, conditionRatings } from './schema.ts'
import { createAsset, createAssetsBulk, updateAsset } from './service.ts'

type T = Awaited<ReturnType<typeof setup>>

const everything = (t: T) => t.db.select().from(notifications).orderBy(notifications.id).all()
const rowsOf = (t: T, userId: number, kind?: string) =>
  everything(t).filter((row) => row.userId === userId && (!kind || row.kind === kind))
const ratingId = (t: T, name: string) =>
  t.db.select().from(conditionRatings).where(eq(conditionRatings.name, name)).get()!.id

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

function asset(t: T, tag: string, holderId?: number) {
  const typeId = t.db.select().from(assetTypes).get()!.id
  const brandId = t.db.select().from(assetBrands).where(eq(assetBrands.isActive, true)).get()!.id
  return createAsset(t.db, t.adminUser, { tag, typeId, brandId, conditionRatingId: ratingId(t, 'Good'), holderId })
}

describe('assets issued to you', () => {
  it('tells the holder when an asset is issued, or created with them as its holder', async () => {
    const t = await setup()
    const made = asset(t, 'BPHS-0001', t.person.id)
    const later = asset(t, 'BPHS-0002')
    issueAsset(t.db, t.adminUser, {
      assetId: later.id,
      employeeId: t.person.id,
      conditionRatingId: ratingId(t, 'Good'),
    })
    expect(rowsOf(t, t.superUser.id)).toMatchObject([
      {
        kind: 'asset_issued',
        sourceKey: `asset:${made.id}`,
        title: 'BPHS-0001 was issued to you',
        body: `${made.type}, issued by Marcus Oyelaran.`,
        link: '/assets/BPHS-0001',
      },
      {
        kind: 'asset_issued',
        sourceKey: `asset:${later.id}`,
        title: 'BPHS-0002 was issued to you',
        link: '/assets/BPHS-0002',
      },
    ])
  })

  it('tells nobody for a program, an employee without an account, or a pasted import', async () => {
    const t = await setup()
    const program = t.db.insert(programs).values({ code: 'P-1', name: 'Youth' }).returning().get()
    const loner = person(t, 'E-2')
    issueAsset(t.db, t.adminUser, {
      assetId: asset(t, 'BPHS-0001').id,
      programId: program.id,
      conditionRatingId: ratingId(t, 'Good'),
    })
    issueAsset(t.db, t.adminUser, {
      assetId: asset(t, 'BPHS-0002').id,
      employeeId: loner.employee.id,
      conditionRatingId: ratingId(t, 'Good'),
    })
    const typeName = t.db.select().from(assetTypes).get()!.name
    const pasted = createAssetsBulk(t.db, t.adminUser, {
      rows: [{ tag: 'BPHS-0003', type: typeName, brand: 'Dell', holder: 'E-1042' }],
    })
    expect(pasted).toEqual({ created: 1, errors: [] })
    expect(everything(t)).toEqual([])
  })
})

describe('returned in poor condition', () => {
  it('tells the Assets team and Super Admins, not the actor or Read-only accounts, and only below the attention band', async () => {
    const t = await setup()
    const full = person(t, 'E-2', 'full@bphs.local', { access: { assets: 'full' } }).account!
    const reader = person(t, 'E-3', 'reader@bphs.local', { access: { assets: 'read' } }).account!
    const fair = asset(t, 'BPHS-0001', t.person.id)
    const poor = asset(t, 'BPHS-0002', t.person.id)
    returnAssignment(t.db, t.adminUser, fair.assignmentId!, { conditionRatingId: ratingId(t, 'Fair') })
    returnAssignment(t.db, t.adminUser, poor.assignmentId!, { conditionRatingId: ratingId(t, 'Poor') })
    const sent = everything(t).filter((row) => row.kind === 'asset_returned_poor')
    expect(sent.map((row) => row.userId).sort((a, b) => a - b)).toEqual([t.superUser.id, full.id].sort((a, b) => a - b))
    expect(sent[0]).toMatchObject({
      sourceKey: `asset:${poor.id}`,
      title: 'BPHS-0002 came back rated Poor',
      link: '/assets/BPHS-0002',
    })
    expect(rowsOf(t, t.adminUser.id)).toEqual([])
    expect(rowsOf(t, reader.id)).toEqual([])
  })

  it('sends one notification for a bulk return, however many came back poor', async () => {
    const t = await setup()
    const held = ['BPHS-0001', 'BPHS-0002', 'BPHS-0003'].map((tag) => asset(t, tag, t.person.id))
    const result = returnMany(t.db, t.adminUser, {
      ids: held.map((row) => row.assignmentId!),
      conditionRatingId: ratingId(t, 'Damaged'),
    })
    expect(result.returned).toHaveLength(3)
    expect(rowsOf(t, t.superUser.id, 'asset_returned_poor')).toMatchObject([
      {
        sourceKey: `return-bulk:${held[0]!.assignmentId}`,
        title: '3 assets came back in poor condition',
        body: 'BPHS-0001 (Damaged), BPHS-0002 (Damaged), BPHS-0003 (Damaged)',
        link: '/',
      },
    ])
  })

  it('leaves out rows that failed or came back Fair, and lists ten tags at most', async () => {
    const t = await setup()
    const held = Array.from({ length: 12 }, (_, n) => asset(t, `BPHS-${String(n + 1).padStart(4, '0')}`, t.person.id))
    const fair = asset(t, 'BPHS-0100', t.person.id)
    returnMany(t.db, t.adminUser, { ids: [fair.assignmentId!], conditionRatingId: ratingId(t, 'Fair') })
    const result = returnMany(t.db, t.adminUser, {
      ids: [fair.assignmentId!, ...held.map((row) => row.assignmentId!)],
      conditionRatingId: ratingId(t, 'Poor'),
    })
    expect([result.returned.length, result.failed.map((row) => row.id)]).toEqual([12, [fair.assignmentId]])
    const [sent, ...more] = rowsOf(t, t.superUser.id, 'asset_returned_poor')
    expect(more).toEqual([])
    expect(sent!.title).toBe('12 assets came back in poor condition')
    expect(sent!.body).toBe(
      `${held
        .slice(0, 10)
        .map((row) => `${row.tag} (Poor)`)
        .join(', ')}, and 2 more`,
    )
  })
})

describe('links that follow the change', () => {
  it('point at the new tag when an asset is renamed', async () => {
    const t = await setup()
    const made = asset(t, 'BPHS-0001', t.person.id)
    updateAsset(t.db, t.adminUser, made.id, { tag: 'BPHS-0099' })
    expect(rowsOf(t, t.superUser.id)).toMatchObject([{ kind: 'asset_issued', link: '/assets/BPHS-0099' }])
  })

  it('forget what an account was told as its old employee when the link changes', async () => {
    const t = await setup()
    const old = person(t, 'E-2').employee
    const next = person(t, 'E-3').employee
    const id = t.adminUser.id
    updateUser(t.db, t.superUser, id, { employeeId: old.id })
    // Issued by someone else, as the actor is never told.
    createAsset(t.db, t.superUser, {
      tag: 'BPHS-0001',
      typeId: t.db.select().from(assetTypes).get()!.id,
      brandId: t.db.select().from(assetBrands).where(eq(assetBrands.isActive, true)).get()!.id,
      conditionRatingId: ratingId(t, 'Good'),
      holderId: old.id,
    })
    await resetPassword(t.db, t.superUser, id)
    expect(rowsOf(t, id, 'asset_issued')).toHaveLength(1)
    updateUser(t.db, t.superUser, id, { employeeId: next.id })
    expect(rowsOf(t, id).map((row) => row.kind)).toEqual([
      'account_employee_linked',
      'account_password_reset',
      'account_employee_linked',
    ])
    expect(rowsOf(t, id, 'asset_issued')).toEqual([])
  })
})

describe('overdue reminders', () => {
  const DAY = 86_400_000
  const now = new Date('2026-10-19T12:00:00Z')
  const issuedAgo = (t: T, tag: string, days: number, holder: { employeeId?: number; programId?: number }) => {
    const row = asset(t, tag)
    const issuedAt = new Date(now.getTime() - days * DAY)
    return t.db.transaction((tx) =>
      issueInTx(
        tx,
        t.adminUser,
        { assetId: row.id, conditionRatingId: ratingId(t, 'Good'), ...holder },
        issuedAt,
        false,
      ),
    )
  }

  it('is sent once per assignment past OVERDUE_DAYS, and not for a returned asset or a program', async () => {
    const t = await setup()
    const program = t.db.insert(programs).values({ code: 'P-1', name: 'Youth' }).returning().get()
    const late = issuedAgo(t, 'BPHS-0001', 400, { employeeId: t.person.id })
    const year = issuedAgo(t, 'BPHS-0002', 365, { employeeId: t.person.id })
    const returned = issuedAgo(t, 'BPHS-0003', 400, { employeeId: t.person.id })
    returnAssignment(t.db, t.adminUser, returned, { conditionRatingId: ratingId(t, 'Good') })
    issuedAgo(t, 'BPHS-0004', 400, { programId: program.id })

    sendOverdueReminders(t.db, now)
    sendOverdueReminders(t.db, now)
    const first = {
      userId: t.superUser.id,
      kind: 'asset_overdue',
      sourceKey: `assignment:${late}`,
      title: 'BPHS-0001 is overdue',
      body: 'It has been issued to you for 400 days.',
      link: '/assets/BPHS-0001',
    }
    expect(everything(t)).toMatchObject([first])
    // A year to the day is not yet overdue; the next day it is, and BPHS-0001 is not sent again.
    sendOverdueReminders(t.db, new Date(now.getTime() + DAY))
    expect(everything(t)).toMatchObject([
      first,
      { sourceKey: `assignment:${year}`, body: 'It has been issued to you for 366 days.' },
    ])
  })
})
