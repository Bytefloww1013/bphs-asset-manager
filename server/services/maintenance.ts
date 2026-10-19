import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { maintenanceCode, maintenanceStatusLabel, type MaintenanceStatus } from '../../shared/constants.ts'
import type { MaintenanceCreateInput } from '../../shared/schemas.ts'
import type { MaintenanceDetail, MaintenanceRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, maintenanceNotes, maintenanceRequests } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'
import { requireActiveEmployees } from './grievances.ts'
import { accountOf, notify } from './notifications.ts'
import { employeeRef, fullName, requireEmployee } from './refs.ts'

/** A new request's fields: a Zoho entry as the webhook read it, or one entered by hand. */
export type NewMaintenanceRequest = Omit<typeof maintenanceRequests.$inferInsert, 'id' | 'receivedAt' | 'status' | 'assignedEmployeeId'>

type Request = typeof maintenanceRequests.$inferSelect
type Employee = typeof employees.$inferSelect

function toRow(request: Request, assignee: Employee | null, lastActivityAt: number): MaintenanceRow {
  return {
    id: request.id,
    code: maintenanceCode(request.id),
    firstName: request.firstName,
    lastName: request.lastName,
    requestedBy: fullName(request.firstName, request.lastName ?? ''),
    email: request.email,
    program: request.program,
    location: request.location,
    description: request.description,
    urgent: request.urgent,
    status: request.status,
    assignee: assignee ? employeeRef(assignee) : null,
    receivedAt: request.receivedAt.toISOString(),
    lastActivityAt: new Date(lastActivityAt).toISOString(),
  }
}

const selectRows = (db: DbLike) =>
  db
    .select({
      request: maintenanceRequests,
      assignee: employees,
      lastActivityAt: sql<number>`(select max(n.created_at) from maintenance_notes n where n.request_id = ${maintenanceRequests.id})`,
    })
    .from(maintenanceRequests)
    .leftJoin(employees, eq(employees.id, maintenanceRequests.assignedEmployeeId))

/** Every request, newest first. */
export function listMaintenanceRequests(db: DbLike): MaintenanceRow[] {
  return selectRows(db)
    .orderBy(desc(maintenanceRequests.receivedAt), desc(maintenanceRequests.id))
    .all()
    .map((row) => toRow(row.request, row.assignee, row.lastActivityAt))
}

export function getMaintenanceRequest(db: DbLike, id: number): MaintenanceDetail {
  const row = selectRows(db).where(eq(maintenanceRequests.id, id)).get()
  if (!row) throw notFound('Maintenance request')
  const notes = db.select().from(maintenanceNotes).where(eq(maintenanceNotes.requestId, id)).orderBy(asc(maintenanceNotes.createdAt), asc(maintenanceNotes.id)).all()
  return {
    ...toRow(row.request, row.assignee, row.lastActivityAt),
    requestDate: row.request.requestDate,
    noticedDate: row.request.noticedDate,
    zohoAddedTime: row.request.zohoAddedTime,
    notes: notes.map((note) => ({ id: note.id, kind: note.kind, body: note.body, createdBy: note.createdByLabel, createdAt: note.createdAt.toISOString() })),
  }
}

function requireRequest(db: DbLike, id: number) {
  const request = db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).get()
  if (!request) throw notFound('Maintenance request')
  return request
}

/** A line on the timeline. With no actor, the line is the webhook's. */
function addLine(db: DbLike, requestId: number, actor: Actor | null, kind: 'note' | 'system', body: string) {
  db.insert(maintenanceNotes)
    .values({ requestId, kind, body, createdByUserId: actor?.id ?? null, createdByLabel: actor?.name ?? 'Zoho Forms', createdAt: new Date() })
    .run()
}

/**
 * Store a new request as Not Started, with its first timeline line. With no actor it came from Zoho, and an entry Zoho sends a
 * second time (the same email and Added Time) is not stored again: the request it already made is the answer.
 */
export function createMaintenanceRequest(db: Db, actor: Actor | null, values: NewMaintenanceRequest): { id: number; duplicate: boolean } {
  return db.transaction((tx) => {
    if (values.zohoAddedTime != null) {
      const existing = tx
        .select({ id: maintenanceRequests.id })
        .from(maintenanceRequests)
        .where(and(eq(maintenanceRequests.email, values.email), eq(maintenanceRequests.zohoAddedTime, values.zohoAddedTime)))
        .get()
      if (existing) return { id: existing.id, duplicate: true }
    }
    const { id } = tx.insert(maintenanceRequests).values({ ...values, receivedAt: new Date() }).returning({ id: maintenanceRequests.id }).get()
    addLine(tx, id, actor, 'system', actor ? `Entered by ${actor.name}` : 'Received from Zoho Forms')
    return { id, duplicate: false }
  })
}

export function enterMaintenanceRequest(db: Db, actor: Actor, input: MaintenanceCreateInput): MaintenanceDetail {
  const { id } = createMaintenanceRequest(db, actor, {
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    email: input.email ?? '',
    program: input.program ?? '',
    location: input.location,
    description: input.description,
    urgent: input.urgent,
    requestDate: null,
    noticedDate: input.noticedDate ?? null,
    zohoAddedTime: null,
  })
  return getMaintenanceRequest(db, id)
}

const nameOf = (db: DbLike, id: number) => {
  const employee = requireEmployee(db, id)
  return fullName(employee.firstName, employee.lastName)
}

/** Tells whoever is dispatched to the request. Acting on your own request tells you nothing; `notify` drops the actor. */
function notifyAssignee(db: DbLike, actor: Actor, request: Request, employeeId: number | null, kind: 'maintenance_dispatched' | 'maintenance_changed', title: string, body?: string) {
  notify(db, actor, { recipients: accountOf(db, employeeId), kind, sourceKey: `maintenance:${request.id}`, title, body, link: `/maintenance/${request.id}` })
}

/** Dispatching a request that is Not Started makes it Dispatched; clearing a Dispatched one puts it back to Not Started. */
export function dispatchMaintenanceRequest(db: Db, actor: Actor, id: number, employeeId: number | null): MaintenanceDetail {
  db.transaction((tx) => {
    const current = requireRequest(tx, id)
    if (employeeId === current.assignedEmployeeId) return
    if (employeeId !== null) requireActiveEmployees(tx, [employeeId], 'employeeId')
    const before = current.assignedEmployeeId === null ? null : nameOf(tx, current.assignedEmployeeId)
    const after = employeeId === null ? null : nameOf(tx, employeeId)
    let status = current.status
    let line: string
    if (after === null) {
      line = `Dispatch to ${before} cleared`
      if (status === 'dispatched') {
        status = 'not_started'
        line += `; back to ${maintenanceStatusLabel(status)}`
      }
    } else if (before === null) {
      line = `Dispatched to ${after}`
      if (status === 'not_started') status = 'dispatched'
    } else {
      line = `Dispatch changed: ${before} → ${after}`
    }
    tx.update(maintenanceRequests).set({ assignedEmployeeId: employeeId, status }).where(eq(maintenanceRequests.id, id)).run()
    addLine(tx, id, actor, 'system', line)
    const code = maintenanceCode(id)
    if (after !== null) notifyAssignee(tx, actor, current, employeeId, 'maintenance_dispatched', `${code} was dispatched to you by ${actor.name}`, current.location)
    if (before !== null) {
      const title = after === null ? `Your dispatch to ${code} was cleared by ${actor.name}` : `${code} was reassigned to ${after} by ${actor.name}`
      notifyAssignee(tx, actor, current, current.assignedEmployeeId, 'maintenance_changed', title)
    }
  })
  return getMaintenanceRequest(db, id)
}

/** Dispatched needs someone dispatched; Not Started clears whoever was. The other three keep the employee. */
export function changeMaintenanceStatus(db: Db, actor: Actor, id: number, status: MaintenanceStatus): MaintenanceDetail {
  db.transaction((tx) => {
    const current = requireRequest(tx, id)
    if (status === current.status) throw conflict('status_unchanged', `It is already ${maintenanceStatusLabel(status)}.`, { field: 'status' })
    if (status === 'dispatched' && current.assignedEmployeeId === null) throw invalid('Choose who it is dispatched to.', { field: 'status' })
    const clears = status === 'not_started' && current.assignedEmployeeId !== null
    let line = `Status: ${maintenanceStatusLabel(current.status)} → ${maintenanceStatusLabel(status)}`
    if (clears) line += `; dispatch to ${nameOf(tx, current.assignedEmployeeId!)} cleared`
    tx.update(maintenanceRequests)
      .set({ status, assignedEmployeeId: clears ? null : current.assignedEmployeeId })
      .where(eq(maintenanceRequests.id, id))
      .run()
    addLine(tx, id, actor, 'system', line)
    const title = `${maintenanceCode(id)} was set to ${maintenanceStatusLabel(status)} by ${actor.name}`
    notifyAssignee(tx, actor, current, current.assignedEmployeeId, 'maintenance_changed', title, clears ? 'Your dispatch to it was cleared.' : undefined)
  })
  return getMaintenanceRequest(db, id)
}

export function addMaintenanceNote(db: Db, actor: Actor, id: number, body: string): MaintenanceDetail {
  db.transaction((tx) => {
    const request = requireRequest(tx, id)
    addLine(tx, id, actor, 'note', body)
    // The note itself stays on the request: the assignee may not have Maintenance access.
    notifyAssignee(tx, actor, request, request.assignedEmployeeId, 'maintenance_changed', `${actor.name} added a note to ${maintenanceCode(id)}`)
  })
  return getMaintenanceRequest(db, id)
}

/** For junk and tests; a request that will not be done is Rejected instead. Its timeline goes with it. */
export function deleteMaintenanceRequest(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    requireRequest(tx, id)
    tx.delete(maintenanceRequests).where(eq(maintenanceRequests.id, id)).run()
    // The code only: Asset Admins read this log, and who asked for what is not theirs to see.
    writeAudit(tx, actor, { action: 'delete', entityType: 'maintenance_request', entityId: id, details: maintenanceCode(id) })
  })
}
