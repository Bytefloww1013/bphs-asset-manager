// What a maintenance request tells the employee it is dispatched to, through the account linked to them.
import { employees } from '#foundation/employees/server/index.ts'
import { notifications } from '#foundation/notifications/server/index.ts'
import { describe, expect, it } from 'vitest'
import { users } from '#kernel/db/schema.ts'
import { setup } from '#kernel/testing/index.ts'
import {
  addMaintenanceNote,
  changeMaintenanceStatus,
  createMaintenanceRequest,
  dispatchMaintenanceRequest,
} from './service.ts'

type T = Awaited<ReturnType<typeof setup>>

const everything = (t: T) => t.db.select().from(notifications).orderBy(notifications.id).all()
const rowsOf = (t: T, userId: number, kind?: string) =>
  everything(t).filter((row) => row.userId === userId && (!kind || row.kind === kind))

/** An employee with an account linked to them. */
function person(t: T, code: string, email: string) {
  const employee = t.db.insert(employees).values({ code, firstName: 'Sam', lastName: code }).returning().get()
  return t.db
    .insert(users)
    .values({
      name: `Sam ${code}`,
      email,
      passwordHash: t.superUser.passwordHash,
      mustChangePassword: false,
      employeeId: employee.id,
    })
    .returning()
    .get()
}

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
    const tech = person(t, 'E-2', 'tech@bphs.local')
    const id = request(t)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, t.person.id)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, tech.employeeId)
    dispatchMaintenanceRequest(t.db, t.adminUser, id, null)
    const common = { sourceKey: `maintenance:${id}`, link: `/maintenance/${id}` }
    expect(rowsOf(t, t.superUser.id)).toMatchObject([
      {
        ...common,
        kind: 'maintenance_dispatched',
        title: 'MR-0001 was dispatched to you by Marcus Oyelaran',
        body: 'Room 4',
      },
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
