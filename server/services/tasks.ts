import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { TASK_FANOUT_MAX_BYTES, type TaskEventKind, type TaskFileSide, type TaskWeekday } from '../../shared/constants.ts'
import {
  APPROVAL_LOCKED_PROBLEM,
  canAssignTasks,
  canAt,
  canCancelTask,
  canEditTask,
  mayWithdrawTaskFile,
  needsAccess,
  SELF_APPROVAL_PROBLEM,
  taskApproveReason,
  taskClosedReason,
  taskEditReason,
  taskFileWithdrawProblem,
} from '../../shared/permissions.ts'
import { DUE_AFTER_SEND, type MyTaskListQuery, type TaskAttachmentWithdrawInput, type TaskCreateInput, type TaskListQuery, type TaskUpdateInput } from '../../shared/schemas.ts'
import { taskStatus } from '../../shared/tasks.ts'
import type { AccountRef, TaskAttachment, TaskDetail, TaskRow } from '../../shared/types.ts'
import type { Db, DbLike, Tx } from '../db/client.ts'
import { taskAttachments, taskEvents, tasks, users } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, forbidden, HttpError, invalid, notFound } from '../lib/errors.ts'
import { requireRichText } from '../lib/richtext.ts'
import { get, put } from '../lib/task-files.ts'
import type { Upload } from '../lib/uploads.ts'
import { forgetNotifications, notify, type NewNotification } from './notifications.ts'

type Task = typeof tasks.$inferSelect

const assignee = alias(users, 'assignee')
const assigner = alias(users, 'assigner')
const ref = (user: typeof users.$inferSelect): AccountRef => ({ id: user.id, name: user.name, email: user.email })

const selectTasks = (db: DbLike) =>
  db.select({ task: tasks, assignee, assigner }).from(tasks).innerJoin(assignee, eq(assignee.id, tasks.assigneeUserId)).innerJoin(assigner, eq(assigner.id, tasks.assignerUserId))

type Joined = { task: Task; assignee: typeof users.$inferSelect; assigner: typeof users.$inferSelect }

function toRow({ task, assignee, assigner }: Joined, now: Date): TaskRow {
  return {
    id: task.id,
    title: task.title,
    status: taskStatus(task, now),
    assignee: ref(assignee),
    assigner: ref(assigner),
    assignerSuperAdmin: task.assignerSuperAdmin,
    sendAt: task.sendAt.toISOString(),
    dueAt: task.dueAt.toISOString(),
    requiresApproval: task.requiresApproval,
    requiresFile: task.requiresFile,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  }
}

function toDetail(db: DbLike, joined: Joined, now: Date): TaskDetail {
  const { task } = joined
  const events = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).orderBy(asc(taskEvents.createdAt), asc(taskEvents.id)).all()
  return {
    ...toRow(joined, now),
    bodyHtml: task.bodyHtml,
    completionNote: task.completionNote,
    approvedAt: task.approvedAt?.toISOString() ?? null,
    cancelledAt: task.cancelledAt?.toISOString() ?? null,
    reminderDays: task.reminderDays,
    reminderTime: task.reminderTime,
    reminderZone: task.reminderZone,
    assignerReminders: task.assignerReminders,
    events: events.map((event) => ({ id: event.id, kind: event.kind, note: event.note, details: event.details, actor: event.actorLabel, createdAt: event.createdAt.toISOString() })),
    attachments: db.select().from(taskAttachments).where(eq(taskAttachments.taskId, task.id)).orderBy(asc(taskAttachments.id)).all().map(fileShape),
  }
}

const fileShape = (row: typeof taskAttachments.$inferSelect): TaskAttachment => ({
  id: row.id,
  side: row.side,
  filename: row.filename,
  contentType: row.contentType,
  size: row.size,
  uploadedBy: row.uploadedByLabel,
  uploadedById: row.uploadedByUserId,
  uploadedAt: row.uploadedAt.toISOString(),
  withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  withdrawnReason: row.withdrawnReason,
})

// ---- Reads ------------------------------------------------------------------------------

/** Employee Tasks: every account's tasks, newest first. Status is worked out, so it is filtered here rather than in SQL. */
export function listTasks(db: DbLike, query: TaskListQuery, now = new Date()): TaskRow[] {
  const where = and(query.assignee ? eq(tasks.assigneeUserId, query.assignee) : undefined, query.assigner ? eq(tasks.assignerUserId, query.assigner) : undefined)
  return selectTasks(db)
    .where(where)
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .all()
    .map((row) => toRow(row, now))
    .filter((row) => query.status === 'all' || row.status === query.status)
}

export function getTask(db: DbLike, id: number, now = new Date()): TaskDetail {
  const row = selectTasks(db).where(eq(tasks.id, id)).get()
  if (!row) throw notFound('Task')
  return toDetail(db, row, now)
}

/** My Space: the tasks sent to this account, soonest due first. Scheduled ones stay hidden until they are sent. */
export function listMyTasks(db: DbLike, userId: number, query: MyTaskListQuery, now = new Date()): TaskRow[] {
  return selectTasks(db)
    .where(and(eq(tasks.assigneeUserId, userId), lte(tasks.sendAt, now), query.cancelled ? undefined : isNull(tasks.cancelledAt)))
    .orderBy(asc(tasks.dueAt), asc(tasks.id))
    .all()
    .map((row) => toRow(row, now))
}

const mine = (userId: number, id: number, now: Date) => and(eq(tasks.id, id), eq(tasks.assigneeUserId, userId), lte(tasks.sendAt, now))

/** One of this account's sent tasks. Anyone else's, or one not sent yet, is a 404. */
export function getMyTask(db: DbLike, userId: number, id: number, now = new Date()): TaskDetail {
  const row = selectTasks(db).where(mine(userId, id, now)).get()
  if (!row) throw notFound('Task')
  return toDetail(db, row, now)
}

/** The same check, for a write: the task row, if it is this account's and sent. */
export function requireMyTask(db: DbLike, userId: number, id: number, now = new Date()): Task {
  const task = db.select().from(tasks).where(mine(userId, id, now)).get()
  if (!task) throw notFound('Task')
  return task
}

/** The active accounts a task can be sent to, for the assign form. */
export function listTaskAccounts(db: DbLike, actor: Actor): AccountRef[] {
  if (!canAssignTasks(actor)) throw forbidden(needsAccess('tasks', 'assign'))
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)).all()
}

// ---- Writes -----------------------------------------------------------------------------

function requireTask(db: DbLike, id: number) {
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!task) throw notFound('Task')
  return task
}

function addEvent(db: DbLike, taskId: number, actor: Actor, kind: TaskEventKind, now: Date, extra: { note?: string | null; details?: string } = {}) {
  db.insert(taskEvents)
    .values({ taskId, kind, note: extra.note ?? null, details: extra.details ?? '', actorUserId: actor.id, actorLabel: actor.name, createdAt: now })
    .run()
}

/** Write checked files onto a task, inside the transaction they came with. Returns what its history should say about them. */
function saveFiles(tx: DbLike, actor: Actor, taskId: number, side: TaskFileSide, uploads: Upload[], now: Date): string {
  for (const { bytes, sha256, ...upload } of uploads) {
    const row = tx
      .insert(taskAttachments)
      .values({ taskId, side, ...upload, size: bytes.length, sha256, uploadedByUserId: actor.id, uploadedByLabel: actor.name, uploadedAt: now })
      .returning()
      .get()
    put(tx, row.id, bytes)
  }
  return uploads.length ? `Added ${uploads.map((upload) => upload.filename).join(', ')}` : ''
}

const joinDetails = (...parts: string[]) => parts.filter(Boolean).join(' · ')

/** A task notification, deep-linked: the assignee's go to My Space, the assigner's to the workspace. */
function tell(db: DbLike, actor: { id: number } | null, task: Pick<Task, 'id' | 'assigneeUserId' | 'assignerUserId'>, to: 'assignee' | 'assigner', kind: NewNotification['kind'], title: string, body: string | null, now: Date) {
  notify(
    db,
    actor,
    {
      recipients: [to === 'assignee' ? task.assigneeUserId : task.assignerUserId],
      kind,
      sourceKey: `task:${task.id}`,
      title,
      body,
      link: to === 'assignee' ? `/me/tasks/${task.id}` : `/tasks/${task.id}`,
    },
    now,
  )
}

const nameOf = (db: DbLike, userId: number) => db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ?? 'Someone'

function requireOpen(task: Task, now: Date) {
  const status = taskStatus(task, now)
  const reason = taskClosedReason(status)
  if (reason) throw conflict(status === 'cancelled' ? 'task_cancelled' : 'task_completed', reason)
}

/** A task this account may edit now, or the reason it can't. Also run before a request's files are read. */
export function requireEditableTask(db: DbLike, actor: Actor, id: number, now = new Date()): Task {
  const task = requireTask(db, id)
  if (!canEditTask(actor, task)) throw forbidden(taskEditReason(task))
  requireOpen(task, now)
  return task
}

const PAST_SEND = 'Schedule it for a time still to come, or send it now.'

/** Fan-out: one task for each account picked, each with its own history. Sent now, the assignees are told now; scheduled, the clock tells them. */
export function createTasks(db: Db, actor: Actor, input: TaskCreateInput, uploads: Upload[] = [], now = new Date()): TaskRow[] {
  if (!canAssignTasks(actor)) throw forbidden(needsAccess('tasks', 'assign'))
  const body = requireRichText(input.body, 'body', { optional: true })
  const assigneeIds = [...new Set(input.assigneeIds)]
  const sendAt = input.sendAt ? new Date(input.sendAt) : now
  if (sendAt.getTime() < now.getTime()) throw invalid(PAST_SEND, { field: 'sendAt' })
  const sent = sendAt.getTime() <= now.getTime()
  if (input.requiresApproval && assigneeIds.includes(actor.id)) throw invalid(SELF_APPROVAL_PROBLEM, { field: 'requiresApproval' })
  const uploadBytes = uploads.reduce((total, upload) => total + upload.bytes.length, 0)
  if (uploadBytes * assigneeIds.length > TASK_FANOUT_MAX_BYTES) {
    throw invalid(`Each person gets their own copy of the files, and for ${assigneeIds.length} people that comes to more than ${TASK_FANOUT_MAX_BYTES / 1024 / 1024} MB. Attach smaller files, or assign it to fewer people at a time.`, { field: 'files' })
  }
  const ids = db.transaction((tx) => {
    const active = tx.select({ id: users.id }).from(users).where(and(inArray(users.id, assigneeIds), eq(users.isActive, true))).all()
    if (active.length !== assigneeIds.length) throw invalid('Tasks can be sent to active accounts only.', { field: 'assigneeIds' })
    return assigneeIds.map((assigneeUserId) => {
      const task = tx
        .insert(tasks)
        .values({
          assigneeUserId,
          assignerUserId: actor.id,
          assignerSuperAdmin: actor.superAdmin,
          title: input.title,
          bodyHtml: body.html,
          bodyText: body.text,
          sendAt,
          dueAt: new Date(input.dueAt),
          requiresApproval: input.requiresApproval,
          requiresFile: input.requiresFile,
          reminderDays: input.reminderDays,
          reminderTime: input.reminderTime,
          reminderZone: input.reminderZone,
          assignerReminders: input.assignerReminders,
          arrivedAt: sent ? now : null,
          createdAt: now,
        })
        .returning()
        .get()
      // Fan-out: each task gets its own copy of the files.
      addEvent(tx, task.id, actor, 'assigned', now, { details: joinDetails(sent ? '' : 'Scheduled', saveFiles(tx, actor, task.id, 'assigner', uploads, now)) })
      if (sent) tell(tx, actor, task, 'assignee', 'task_assigned', `New task: ${task.title}`, `From ${actor.name}`, now)
      return task.id
    })
  })
  return selectTasks(db)
    .where(inArray(tasks.id, ids))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .all()
    .map((row) => toRow(row, now))
}

const FIELD_LABEL: Record<keyof TaskUpdateInput, string> = {
  title: 'title',
  body: 'body',
  sendAt: 'send time',
  dueAt: 'due date',
  requiresApproval: 'approval',
  requiresFile: 'file requirement',
  reminderDays: 'reminder days',
  reminderTime: 'reminder time',
  reminderZone: 'time zone',
  assignerReminders: 'past-due notices',
}

/** Edits what changed. Once sent, the send time is fixed and the assignee is told; before, nobody is. A new due date starts the past-due notices over. */
export function updateTask(db: Db, actor: Actor, id: number, input: TaskUpdateInput, uploads: Upload[] = [], now = new Date()): TaskDetail {
  db.transaction((tx) => {
    const task = requireEditableTask(tx, actor, id, now)
    const next: Partial<typeof tasks.$inferInsert> = {}
    const changed: string[] = []
    const set = <K extends keyof typeof next>(key: K, value: (typeof next)[K], field: keyof TaskUpdateInput, same: boolean) => {
      if (same) return
      next[key] = value
      changed.push(FIELD_LABEL[field])
    }
    if (input.title !== undefined) set('title', input.title, 'title', input.title === task.title)
    if (input.body !== undefined) {
      const body = requireRichText(input.body, 'body', { optional: true })
      set('bodyHtml', body.html, 'body', body.html === task.bodyHtml)
      next.bodyText = body.text
    }
    if (input.sendAt !== undefined) {
      const sendAt = input.sendAt ? new Date(input.sendAt) : now
      if (sendAt.getTime() !== task.sendAt.getTime()) {
        if (task.arrivedAt) throw invalid('It has already been sent, so its send time cannot change.', { field: 'sendAt' })
        if (sendAt.getTime() < now.getTime()) throw invalid(PAST_SEND, { field: 'sendAt' })
        set('sendAt', sendAt, 'sendAt', false)
      }
    }
    if (input.dueAt !== undefined) {
      const dueAt = new Date(input.dueAt)
      if (dueAt.getTime() !== task.dueAt.getTime()) {
        set('dueAt', dueAt, 'dueAt', false)
        next.pastDueNotifiedAt = null
        next.lastRemindedOn = null
      }
    }
    if ((next.dueAt ?? task.dueAt).getTime() <= (next.sendAt ?? task.sendAt).getTime()) throw invalid(DUE_AFTER_SEND, { field: 'dueAt' })
    if (input.requiresApproval !== undefined && input.requiresApproval !== task.requiresApproval) {
      if (actor.id === task.assigneeUserId) throw forbidden(APPROVAL_LOCKED_PROBLEM)
      if (input.requiresApproval && task.assigneeUserId === task.assignerUserId) throw invalid(SELF_APPROVAL_PROBLEM, { field: 'requiresApproval' })
      set('requiresApproval', input.requiresApproval, 'requiresApproval', false)
    }
    if (input.requiresFile !== undefined) set('requiresFile', input.requiresFile, 'requiresFile', input.requiresFile === task.requiresFile)
    if (input.reminderDays !== undefined) set('reminderDays', input.reminderDays, 'reminderDays', input.reminderDays.join() === task.reminderDays.join())
    if (input.reminderTime !== undefined) set('reminderTime', input.reminderTime, 'reminderTime', input.reminderTime === task.reminderTime)
    if (input.reminderZone !== undefined) set('reminderZone', input.reminderZone, 'reminderZone', input.reminderZone === task.reminderZone)
    if (input.assignerReminders !== undefined) set('assignerReminders', input.assignerReminders, 'assignerReminders', input.assignerReminders === task.assignerReminders)
    if (uploads.length) changed.push('files')
    if (changed.length === 0) return
    // Moved to now, a scheduled task is sent with the edit, not on the clock's next tick.
    const sendsNow = !task.arrivedAt && (next.sendAt ?? task.sendAt).getTime() <= now.getTime()
    if (sendsNow) next.arrivedAt = now
    if (Object.keys(next).length) tx.update(tasks).set(next).where(eq(tasks.id, id)).run()
    addEvent(tx, id, actor, 'edited', now, { details: joinDetails(`Changed ${changed.join(', ')}`, sendsNow ? 'Sent' : '', saveFiles(tx, actor, id, 'assigner', uploads, now)) })
    const title = next.title ?? task.title
    if (sendsNow) tell(tx, actor, task, 'assignee', 'task_assigned', `New task: ${title}`, `From ${nameOf(tx, task.assignerUserId)}`, now)
    else if (task.arrivedAt) tell(tx, actor, task, 'assignee', 'task_updated', `Task updated: ${title}`, `${actor.name} changed the ${changed.join(', ')}`, now)
  })
  return getTask(db, id, now)
}

/** A soft delete: the task stays, as Cancelled, and leaves the assignee's list. An assignee who already has it is told. */
export function cancelTask(db: Db, actor: Actor, id: number, now = new Date()): TaskDetail {
  db.transaction((tx) => {
    const task = requireTask(tx, id)
    if (!canCancelTask(actor, task)) throw forbidden(taskEditReason(task))
    requireOpen(task, now)
    tx.update(tasks).set({ cancelledAt: now }).where(eq(tasks.id, id)).run()
    addEvent(tx, id, actor, 'cancelled', now)
    if (task.arrivedAt) tell(tx, actor, task, 'assignee', 'task_cancelled', `Task cancelled: ${task.title}`, `${actor.name} cancelled it.`, now)
  })
  return getTask(db, id, now)
}

/** Gone for good, with its history and its notifications. The route checks Full. */
export function deleteTask(db: Db, id: number) {
  db.transaction((tx) => {
    requireTask(tx, id)
    forgetNotifications(tx, `task:${id}`)
    tx.delete(tasks).where(eq(tasks.id, id)).run()
  })
}

/** The assignee marks their own sent task complete. One that needs approval waits for it; the assigner is told either way. */
export function completeTask(db: Db, actor: Actor, id: number, note: string | null | undefined, uploads: Upload[] = [], now = new Date()): TaskDetail {
  db.transaction((tx) => {
    const task = requireMyTask(tx, actor.id, id, now)
    requireOpen(task, now)
    if (task.requiresFile && !uploads.length && !liveFiles(tx, id, 'assignee')) throw invalid('This task needs a file with its completion. Attach one.', { field: 'files' })
    tx.update(tasks).set({ completedAt: now, completionNote: note || null }).where(eq(tasks.id, id)).run()
    addEvent(tx, id, actor, 'completed', now, { note: note || null, details: saveFiles(tx, actor, id, 'assignee', uploads, now) })
    if (task.requiresApproval) tell(tx, actor, task, 'assigner', 'task_approval_requested', `Awaiting approval: ${task.title}`, `${actor.name} completed it.`, now)
    else tell(tx, actor, task, 'assigner', 'task_completed', `Task completed: ${task.title}`, `${actor.name} completed it.`, now)
  })
  return getMyTask(db, actor.id, id, now)
}

const liveFiles = (db: DbLike, taskId: number, side: TaskFileSide) =>
  db.select({ id: taskAttachments.id }).from(taskAttachments).where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.side, side), isNull(taskAttachments.withdrawnAt))).all().length

/** One of a task's files, or 404: an ID from another task is not found here. */
function requireFile(db: DbLike, taskId: number, fileId: number) {
  const row = db.select().from(taskAttachments).where(and(eq(taskAttachments.id, fileId), eq(taskAttachments.taskId, taskId))).get()
  if (!row) throw notFound('File')
  return row
}

/** Where a task's file is reached from: Employee Tasks, which needs Read, or My Space, where the task must be the caller's and sent. */
export type TaskFileScope = 'workspace' | 'mine'

function requireSeen(db: DbLike, actor: Actor, scope: TaskFileScope, taskId: number, now: Date): Task {
  if (scope === 'mine') return requireMyTask(db, actor.id, taskId, now)
  if (!canAt(actor, 'tasks', 'read')) throw forbidden(needsAccess('tasks', 'read'))
  return requireTask(db, taskId)
}

/** A file's bytes, to be sent as a download, for anyone who can see the task. A withdrawn file has none to give. */
export function downloadTaskFile(db: DbLike, actor: Actor, scope: TaskFileScope, taskId: number, fileId: number, now = new Date()) {
  requireSeen(db, actor, scope, taskId, now)
  const row = requireFile(db, taskId, fileId)
  if (row.withdrawnAt) throw new HttpError(410, 'attachment_withdrawn', `${row.filename} was withdrawn and can no longer be downloaded.`)
  const bytes = get(db, row.id)
  if (!bytes) throw notFound('File')
  return { filename: row.filename, contentType: row.contentType, bytes }
}

/** Take back a file added by mistake: it stays on the list, with the reason, but can no longer be downloaded. */
export function withdrawTaskFile(db: Db, actor: Actor, scope: TaskFileScope, taskId: number, fileId: number, input: TaskAttachmentWithdrawInput, now = new Date()) {
  db.transaction((tx) => {
    const task = requireSeen(tx, actor, scope, taskId, now)
    const row = requireFile(tx, taskId, fileId)
    const file = { side: row.side, uploadedById: row.uploadedByUserId, withdrawnAt: row.withdrawnAt?.toISOString() ?? null }
    const problem = taskFileWithdrawProblem(actor, { ...task, status: taskStatus(task, now) }, file)
    if (problem) throw row.withdrawnAt || mayWithdrawTaskFile(actor, task, file) ? conflict('attachment_locked', problem) : forbidden(problem)
    tx.update(taskAttachments).set({ withdrawnAt: now, withdrawnReason: input.reason }).where(eq(taskAttachments.id, row.id)).run()
    addEvent(tx, taskId, actor, 'file_withdrawn', now, { note: input.reason, details: row.filename })
  })
}

function requireApprover(tx: DbLike, actor: Actor, id: number, now: Date) {
  const task = requireTask(tx, id)
  const reason = taskApproveReason(actor, task)
  if (reason) throw forbidden(reason)
  if (taskStatus(task, now) !== 'awaiting_approval') throw conflict('task_not_awaiting', 'This task is not awaiting approval.')
  return task
}

export function approveTask(db: Db, actor: Actor, id: number, now = new Date()): TaskDetail {
  db.transaction((tx) => {
    const task = requireApprover(tx, actor, id, now)
    tx.update(tasks).set({ approvedAt: now }).where(eq(tasks.id, id)).run()
    addEvent(tx, id, actor, 'approved', now)
    tell(tx, actor, task, 'assignee', 'task_approved', `Task approved: ${task.title}`, `${actor.name} approved it.`, now)
  })
  return getTask(db, id, now)
}

/** Back to Outstanding (or Past-Due), with a note that says why. */
export function sendBackTask(db: Db, actor: Actor, id: number, note: string, now = new Date()): TaskDetail {
  db.transaction((tx) => {
    const task = requireApprover(tx, actor, id, now)
    tx.update(tasks).set({ completedAt: null, completionNote: null }).where(eq(tasks.id, id)).run()
    addEvent(tx, id, actor, 'sent_back', now, { note })
    tell(tx, actor, task, 'assignee', 'task_sent_back', `Task sent back: ${task.title}`, `${actor.name} sent it back with a note.`, now)
  })
  return getTask(db, id, now)
}

// ---- The task clock ---------------------------------------------------------------------

const PARTS = new Map<string, Intl.DateTimeFormat>()

/** A moment as a wall clock in a time zone: its date, weekday and HH:MM. */
export function localTime(at: Date, zone: string): { date: string; weekday: TaskWeekday; time: string } {
  let format = PARTS.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    PARTS.set(zone, format)
  }
  const part = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]))
  return { date: `${part.year}-${part.month}-${part.day}`, weekday: part.weekday!.slice(0, 2).toUpperCase() as TaskWeekday, time: `${part.hour}:${part.minute}` }
}

/**
 * Run every minute. Sends what is due and marks it sent on the task, so a restart repeats nothing:
 * scheduled tasks arrive; a task newly past due tells its assigner (unless they chose None); and on each reminder day, at the
 * reminder time in the task's zone, a past-due task reminds its assignee (and its assigner, if they chose Every).
 * A reminder missed for a whole day while the server was down is skipped. Returns what it sent, for the tests.
 */
export function runTaskClock(db: Db, now = new Date()) {
  const sent = { arrived: 0, pastDue: 0, reminded: 0 }
  // Each task in a savepoint of its own: one that fails is logged and tried again next minute, and the rest still go out.
  const each = <T extends { id: number }>(tx: Tx, rows: T[], send: (tx: Tx, task: T) => void) => {
    for (const task of rows) {
      try {
        tx.transaction((sp) => send(sp, task))
      } catch (error) {
        console.error(`Task clock: task ${task.id} failed`, error)
      }
    }
  }
  db.transaction((tx) => {
    const unsent = tx
      .select({ id: tasks.id, title: tasks.title, assigneeUserId: tasks.assigneeUserId, assignerUserId: tasks.assignerUserId, cancelledAt: tasks.cancelledAt, completedAt: tasks.completedAt })
      .from(tasks)
      .where(and(isNull(tasks.arrivedAt), lte(tasks.sendAt, now)))
      .all()
    each(tx, unsent, (tx, task) => {
      tx.update(tasks).set({ arrivedAt: now }).where(eq(tasks.id, task.id)).run()
      if (task.cancelledAt || task.completedAt) return
      tell(tx, { id: task.assignerUserId }, task, 'assignee', 'task_assigned', `New task: ${task.title}`, `From ${nameOf(tx, task.assignerUserId)}`, now)
      sent.arrived++
    })

    const pastDue = tx
      .select({
        id: tasks.id,
        title: tasks.title,
        assigneeUserId: tasks.assigneeUserId,
        assignerUserId: tasks.assignerUserId,
        assignerReminders: tasks.assignerReminders,
        dueAt: tasks.dueAt,
        pastDueNotifiedAt: tasks.pastDueNotifiedAt,
        reminderDays: tasks.reminderDays,
        reminderTime: tasks.reminderTime,
        reminderZone: tasks.reminderZone,
        lastRemindedOn: tasks.lastRemindedOn,
      })
      .from(tasks)
      .where(and(isNull(tasks.cancelledAt), isNull(tasks.completedAt), lte(tasks.dueAt, now)))
      .all()
    each(tx, pastDue, (tx, task) => {
      const toAssigner = task.assignerUserId !== task.assigneeUserId && task.assignerReminders !== 'none'
      const firstNotice = !task.pastDueNotifiedAt
      if (firstNotice) {
        tx.update(tasks).set({ pastDueNotifiedAt: now }).where(eq(tasks.id, task.id)).run()
        if (toAssigner) {
          tell(tx, null, task, 'assigner', 'task_past_due', `Task past due: ${task.title}`, `Assigned to ${nameOf(tx, task.assigneeUserId)}`, now)
          sent.pastDue++
        }
      }
      const local = localTime(now, task.reminderZone)
      const due = localTime(task.dueAt, task.reminderZone)
      const remind =
        task.reminderDays.includes(local.weekday) &&
        local.time >= task.reminderTime &&
        `${local.date}T${task.reminderTime}` >= `${due.date}T${due.time}` &&
        task.lastRemindedOn !== local.date
      if (!remind) return
      tx.update(tasks).set({ lastRemindedOn: local.date }).where(eq(tasks.id, task.id)).run()
      tell(tx, null, task, 'assignee', 'task_past_due', `Task past due: ${task.title}`, 'This task is past due.', now)
      // The assigner was told a moment ago, in this same run: once is enough.
      if (toAssigner && task.assignerReminders === 'every' && !firstNotice) tell(tx, null, task, 'assigner', 'task_past_due', `Task past due: ${task.title}`, `Assigned to ${nameOf(tx, task.assigneeUserId)}`, now)
      sent.reminded++
    })
  })
  return sent
}
