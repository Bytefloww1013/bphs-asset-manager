import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { assetTypes, conditionRatings, digitalAssetTypes, employees, notificationMutes, notifications, programs, users } from '../db/schema.ts'
import { createAsset, createAssetsBulk } from '../services/assets.ts'
import { issueAsset, issueInTx, returnAssignment, returnMany } from '../services/assignments.ts'
import { createDigitalAsset, issueDigitalAsset } from '../services/digital-assets.ts'
import { addMaintenanceNote, changeMaintenanceStatus, createMaintenanceRequest, dispatchMaintenanceRequest } from '../services/maintenance.ts'
import { sendOverdueReminders } from '../services/notifications.ts'
import { clearLock, resetPassword, updateUser } from '../services/users.ts'
import { setup } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>

const everything = (t: T) => t.db.select().from(notifications).orderBy(notifications.id).all()
const rowsOf = (t: T, userId: number, kind?: string) => everything(t).filter((row) => row.userId === userId && (!kind || row.kind === kind))
const ratingId = (t: T, name: string) => t.db.select().from(conditionRatings).where(eq(conditionRatings.name, name)).get()!.id

/** An employee, with an account when an email is given. */
function person(t: T, code: string, email?: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const employee = t.db.insert(employees).values({ code, firstName: 'Sam', lastName: code }).returning().get()
  const account = email
    ? t.db.insert(users).values({ name: `Sam ${code}`, email, passwordHash: t.superUser.passwordHash, mustChangePassword: false, employeeId: employee.id, ...extra }).returning().get()
    : null
  return { employee, account }
}

function asset(t: T, tag: string, holderId?: number) {
  const typeId = t.db.select().from(assetTypes).get()!.id
  return createAsset(t.db, t.adminUser, { tag, typeId, conditionRatingId: ratingId(t, 'Good'), holderId })
}

describe('assets issued to you', () => {
  it('tells the holder when an asset is issued, or created with them as its holder', async () => {
    const t = await setup()
    const made = asset(t, 'BPHS-0001', t.person.id)
    const later = asset(t, 'BPHS-0002')
    issueAsset(t.db, t.adminUser, { assetId: later.id, employeeId: t.person.id, conditionRatingId: ratingId(t, 'Good') })
    expect(rowsOf(t, t.superUser.id)).toMatchObject([
      { kind: 'asset_issued', sourceKey: `asset:${made.id}`, title: 'BPHS-0001 was issued to you', body: `${made.type}, issued by Marcus Oyelaran.`, link: '/assets/BPHS-0001' },
      { kind: 'asset_issued', sourceKey: `asset:${later.id}`, title: 'BPHS-0002 was issued to you', link: '/assets/BPHS-0002' },
    ])
  })

  it('tells nobody for a program, an employee without an account, or a pasted import', async () => {
    const t = await setup()
    const program = t.db.insert(programs).values({ code: 'P-1', name: 'Youth' }).returning().get()
    const loner = person(t, 'E-2')
    issueAsset(t.db, t.adminUser, { assetId: asset(t, 'BPHS-0001').id, programId: program.id, conditionRatingId: ratingId(t, 'Good') })
    issueAsset(t.db, t.adminUser, { assetId: asset(t, 'BPHS-0002').id, employeeId: loner.employee.id, conditionRatingId: ratingId(t, 'Good') })
    const typeName = t.db.select().from(assetTypes).get()!.name
    const pasted = createAssetsBulk(t.db, t.adminUser, { rows: [{ tag: 'BPHS-0003', type: typeName, holder: 'E-1042' }] })
    expect(pasted).toEqual({ created: 1, errors: [] })
    expect(everything(t)).toEqual([])
  })

  it('tells the holder when a digital asset is issued, on creation or later', async () => {
    const t = await setup()
    const typeId = t.db.insert(digitalAssetTypes).values({ name: 'Microsoft 365' }).returning().get().id
    const made = createDigitalAsset(t.db, t.adminUser, { typeId, account: 'priya@bphs.org', employeeId: t.person.id })
    const later = createDigitalAsset(t.db, t.adminUser, { typeId, account: 'spare@bphs.org' })
    issueDigitalAsset(t.db, t.adminUser, later.id, { employeeId: t.person.id })
    expect(rowsOf(t, t.superUser.id)).toMatchObject([
      { kind: 'digital_issued', sourceKey: `digital:${made.id}`, title: `${made.code} was issued to you`, body: 'Microsoft 365, issued by Marcus Oyelaran.', link: '/digital-assets' },
      { kind: 'digital_issued', sourceKey: `digital:${later.id}`, title: `${later.code} was issued to you` },
    ])
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
    expect(sent.map((row) => row.userId).sort()).toEqual([t.superUser.id, full.id].sort())
    expect(sent[0]).toMatchObject({ sourceKey: `asset:${poor.id}`, title: 'BPHS-0002 came back rated Poor', link: '/assets/BPHS-0002' })
    expect(rowsOf(t, t.adminUser.id)).toEqual([])
    expect(rowsOf(t, reader.id)).toEqual([])
  })

  it('sends one notification for a bulk return, however many came back poor', async () => {
    const t = await setup()
    const held = ['BPHS-0001', 'BPHS-0002', 'BPHS-0003'].map((tag) => asset(t, tag, t.person.id))
    const result = returnMany(t.db, t.adminUser, { ids: held.map((row) => row.assignmentId!), conditionRatingId: ratingId(t, 'Damaged') })
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
})

describe('maintenance', () => {
  const request = (t: T) =>
    createMaintenanceRequest(t.db, null, {
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.org',
      program: 'Youth',
      location: 'Room 4',
      description: 'The heater is out',
      urgent: null,
      requestDate: null,
      noticedDate: null,
      zohoAddedTime: null,
    }).id

  it('tells the new assignee, and the previous one when it is reassigned or cleared', async () => {
    const t = await setup()
    const tech = person(t, 'E-2', 'tech@bphs.local').account!
    const id = request(t)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, t.person.id)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, tech.employeeId)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, null)
    const common = { sourceKey: `maintenance:${id}`, link: `/maintenance/${id}` }
    expect(rowsOf(t, t.superUser.id)).toMatchObject([
      { ...common, kind: 'maintenance_dispatched', title: 'MR-0001 was dispatched to you by Marcus Oyelaran', body: 'Room 4' },
      { ...common, kind: 'maintenance_changed', title: 'MR-0001 was reassigned to Sam E-2 by Marcus Oyelaran' },
    ])
    expect(rowsOf(t, tech.id)).toMatchObject([
      { ...common, kind: 'maintenance_dispatched', title: 'MR-0001 was dispatched to you by Marcus Oyelaran' },
      { ...common, kind: 'maintenance_changed', title: 'Your dispatch to MR-0001 was cleared by Marcus Oyelaran' },
    ])
  })

  it('tells the assignee about a status change or a note', async () => {
    const t = await setup()
    const id = request(t)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, t.person.id)
    changeMaintenanceStatus(t.db, t.adminUser, id, 'on_hold')
    addMaintenanceNote(t.db, t.adminUser, id, 'The part is on order.')
    changeMaintenanceStatus(t.db, t.adminUser, id, 'not_started')
    expect(rowsOf(t, t.superUser.id, 'maintenance_changed')).toMatchObject([
      { title: 'MR-0001 was set to On Hold by Marcus Oyelaran', body: null },
      { title: 'Marcus Oyelaran added a note to MR-0001', body: null },
      { title: 'MR-0001 was set to Not Started by Marcus Oyelaran', body: 'Your dispatch to it was cleared.' },
    ])
  })

  it('tells nobody when you act on your own request, or when nobody is dispatched', async () => {
    const t = await setup()
    const own = request(t)
    dispatchMaintenanceRequest(t.db, t.superUser, own, t.person.id)
    changeMaintenanceStatus(t.db, t.superUser, own, 'on_hold')
    addMaintenanceNote(t.db, t.superUser, own, 'On it.')
    const open = request(t)
    changeMaintenanceStatus(t.db, t.adminUser, open, 'on_hold')
    addMaintenanceNote(t.db, t.adminUser, open, 'Waiting on a quote.')
    expect(everything(t)).toEqual([])
  })
})

describe('account and security events', () => {
  it('tells the account about access, Super Admin, linked employee, password reset and unlock, and never mutes them', async () => {
    const t = await setup()
    const linked = person(t, 'E-2').employee
    for (const kind of ['account_access_changed', 'account_employee_linked', 'account_password_reset', 'account_unlocked']) {
      t.db.insert(notificationMutes).values({ userId: t.adminUser.id, kind, createdAt: new Date() }).run()
    }
    const id = t.adminUser.id
    updateUser(t.db, t.superUser, id, { name: 'Marcus O.' })
    updateUser(t.db, t.superUser, id, { access: { assets: 'full' } })
    updateUser(t.db, t.superUser, id, { superAdmin: true })
    updateUser(t.db, t.superUser, id, { employeeId: linked.id })
    await resetPassword(t.db, t.superUser, id)
    clearLock(t.db, t.superUser, id)
    t.db.update(users).set({ lockedUntil: new Date(Date.now() + 60_000) }).where(eq(users.id, id)).run()
    clearLock(t.db, t.superUser, id)

    const common = { sourceKey: `user:${id}`, link: '/me/profile', muted: false }
    expect(rowsOf(t, id)).toMatchObject([
      { ...common, kind: 'account_access_changed', title: 'Your access was changed', body: 'Changed by Priya Raghunathan. See your Profile for what you can do now.' },
      { ...common, kind: 'account_access_changed' },
      { ...common, kind: 'account_employee_linked', body: 'Now E-2 Sam E-2. Changed by Priya Raghunathan.' },
      { ...common, kind: 'account_password_reset', title: 'Your password was reset' },
      { ...common, kind: 'account_unlocked', title: 'Your account was unlocked', body: 'Unlocked by Priya Raghunathan.' },
    ])
  })
})

describe('overdue reminders', () => {
  const DAY = 86_400_000
  const now = new Date('2026-10-19T12:00:00Z')
  const issuedAgo = (t: T, tag: string, days: number, holder: { employeeId?: number; programId?: number }) => {
    const row = asset(t, tag)
    const issuedAt = new Date(now.getTime() - days * DAY)
    return t.db.transaction((tx) => issueInTx(tx, t.adminUser, { assetId: row.id, conditionRatingId: ratingId(t, 'Good'), ...holder }, issuedAt, false))
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
    const first = { userId: t.superUser.id, kind: 'asset_overdue', sourceKey: `assignment:${late}`, title: 'BPHS-0001 is overdue', body: 'It has been issued to you for 400 days.', link: '/assets/BPHS-0001' }
    expect(everything(t)).toMatchObject([first])
    // A year to the day is not yet overdue; the next day it is, and BPHS-0001 is not sent again.
    sendOverdueReminders(t.db, new Date(now.getTime() + DAY))
    expect(everything(t)).toMatchObject([first, { sourceKey: `assignment:${year}`, body: 'It has been issued to you for 366 days.' }])
  })
})
