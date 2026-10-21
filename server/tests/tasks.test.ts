import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { Access } from '../../shared/constants.ts'
import { APPROVAL_LOCKED_PROBLEM, SELF_APPROVAL_PROBLEM, taskEditReason } from '../../shared/permissions.ts'
import { notifications, tasks } from '../db/schema.ts'
import { listMyTasks, runTaskClock } from '../services/tasks.ts'
import { setup } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const from = (ms: number) => new Date(Date.now() + ms).toISOString()
const ZONE = 'America/New_York'

/** Priya (Super Admin) as `boss`, and an account at each Tasks level, plus `amy` with no access at all. */
async function world() {
  const t = await setup()
  const account = async (name: string, access: Access = {}) => {
    const user = t.addUser(`${name}@bphs.local`, { access })
    return { ...user, cookie: (await t.signIn(user.email)).cookie }
  }
  return {
    t,
    boss: { ...t.superUser, cookie: await t.asSuper() },
    reader: await account('reader', { tasks: 'read' }),
    assigner: await account('assigner', { tasks: 'assign' }),
    editor: await account('editor', { tasks: 'edit' }),
    full: await account('full', { tasks: 'full' }),
    amy: await account('amy'),
  }
}

type W = Awaited<ReturnType<typeof world>>
type Who = { id: number; cookie: string }

async function assign(w: W, by: Who, to: Who | number[], over: Record<string, unknown> = {}) {
  const assigneeIds = Array.isArray(to) ? to : [to.id]
  return w.t.call('POST', '/api/tasks', { cookie: by.cookie, body: { assigneeIds, title: 'File the report', dueAt: from(DAY), reminderZone: ZONE, ...over } })
}

/** A task sent now, its id. */
async function sendTask(w: W, by: Who, to: Who, over: Record<string, unknown> = {}) {
  const res = await assign(w, by, to, over)
  expect(res.status).toBe(201)
  return res.data[0].id as number
}

const notes = (t: T, userId?: number, kind?: string) =>
  t.db
    .select()
    .from(notifications)
    .all()
    .filter((n) => (userId === undefined || n.userId === userId) && (kind === undefined || n.kind === kind))

/** Moves a sent task's times, as if it had been assigned earlier. */
const setTimes = (t: T, id: number, sendAt: Date, dueAt: Date) => t.db.update(tasks).set({ sendAt, dueAt, arrivedAt: sendAt }).where(eq(tasks.id, id)).run()
const row = (t: T, id: number) => t.db.select().from(tasks).where(eq(tasks.id, id)).get()!

describe('permissions', () => {
  it('lets Read list and open tasks but not assign one', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy)
    expect((await w.t.call('GET', '/api/tasks', { cookie: w.reader.cookie })).data).toHaveLength(1)
    expect((await w.t.call('GET', `/api/tasks/${id}`, { cookie: w.reader.cookie })).status).toBe(200)
    expect((await assign(w, w.reader, w.amy)).status).toBe(403)
  })

  it('lets Assign create, edit and cancel its own task but not someone else’s', async () => {
    const w = await world()
    const own = await sendTask(w, w.assigner, w.amy)
    expect((await w.t.call('PATCH', `/api/tasks/${own}`, { cookie: w.assigner.cookie, body: { title: 'Renamed' } })).data.title).toBe('Renamed')
    expect((await w.t.call('POST', `/api/tasks/${own}/cancel`, { cookie: w.assigner.cookie })).data.status).toBe('cancelled')
    const other = await sendTask(w, w.editor, w.amy)
    const edit = await w.t.call('PATCH', `/api/tasks/${other}`, { cookie: w.assigner.cookie, body: { title: 'Mine now' } })
    expect(edit.status).toBe(403)
    expect(edit.data.message).toBe(taskEditReason({ assigneeUserId: w.amy.id, assignerUserId: w.editor.id, assignerSuperAdmin: false }))
    expect((await w.t.call('POST', `/api/tasks/${other}/cancel`, { cookie: w.assigner.cookie })).status).toBe(403)
  })

  it('lets Edit change others’ tasks but not a Super Admin’s, and only Full delete', async () => {
    const w = await world()
    const theirs = await sendTask(w, w.assigner, w.amy)
    expect((await w.t.call('PATCH', `/api/tasks/${theirs}`, { cookie: w.editor.cookie, body: { title: 'Edited' } })).status).toBe(200)
    const bosses = await sendTask(w, w.boss, w.amy)
    const edit = await w.t.call('PATCH', `/api/tasks/${bosses}`, { cookie: w.editor.cookie, body: { title: 'Edited' } })
    expect(edit.status).toBe(403)
    expect(edit.data.message).toBe('A Super Admin assigned this task, so only Full access to Employee Tasks can change it.')
    expect((await w.t.call('DELETE', `/api/tasks/${bosses}`, { cookie: w.editor.cookie })).status).toBe(403)
    expect((await w.t.call('PATCH', `/api/tasks/${bosses}`, { cookie: w.full.cookie, body: { title: 'Edited' } })).status).toBe(200)
    expect((await w.t.call('DELETE', `/api/tasks/${bosses}`, { cookie: w.full.cookie })).status).toBe(204)
    expect((await w.t.call('GET', `/api/tasks/${bosses}`, { cookie: w.full.cookie })).status).toBe(404)
  })

  it('keeps an account without Tasks access out of the workspace but not out of its own tasks', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy)
    expect((await w.t.call('GET', '/api/tasks', { cookie: w.amy.cookie })).status).toBe(403)
    const mine = await w.t.call('GET', '/api/me/tasks', { cookie: w.amy.cookie })
    expect(mine.status).toBe(200)
    expect(mine.data.map((task: { id: number }) => task.id)).toEqual([id])
    expect((await w.t.call('GET', `/api/me/tasks/${id}`, { cookie: w.amy.cookie })).status).toBe(200)
  })

  it('answers another account’s task in My Space with a 404, even its assigner or a Super Admin completing it', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    for (const who of [w.reader, w.assigner, w.boss]) {
      expect((await w.t.call('GET', `/api/me/tasks/${id}`, { cookie: who.cookie })).status).toBe(404)
      expect((await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: who.cookie, body: {} })).status).toBe(404)
    }
  })

  it('lists the accounts to assign to for Assign only', async () => {
    const w = await world()
    expect((await w.t.call('GET', '/api/tasks/accounts', { cookie: w.reader.cookie })).status).toBe(403)
    const accounts = await w.t.call('GET', '/api/tasks/accounts', { cookie: w.assigner.cookie })
    expect(accounts.status).toBe(200)
    expect(accounts.data).toContainEqual({ id: w.amy.id, name: w.amy.name, email: w.amy.email })
  })

  it('never lets the assignee change whether their own task needs approval', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.editor, { requiresApproval: true })
    const edit = await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.editor.cookie, body: { requiresApproval: false } })
    expect(edit.status).toBe(403)
    expect(edit.data.message).toBe(APPROVAL_LOCKED_PROBLEM)
    expect(row(w.t, id).requiresApproval).toBe(true)
  })
})

describe('derived status', () => {
  it('works out each status and filters the list by it', async () => {
    const w = await world()
    const outstanding = await sendTask(w, w.boss, w.amy)
    const scheduled = await sendTask(w, w.boss, w.amy, { sendAt: from(HOUR), dueAt: from(DAY) })
    const pastDue = await sendTask(w, w.boss, w.amy)
    setTimes(w.t, pastDue, new Date(Date.now() - DAY), new Date(Date.now() - MINUTE))
    const awaiting = await sendTask(w, w.boss, w.amy, { requiresApproval: true })
    const completed = await sendTask(w, w.boss, w.amy)
    const cancelled = await sendTask(w, w.boss, w.amy)
    await w.t.call('POST', `/api/me/tasks/${awaiting}/complete`, { cookie: w.amy.cookie, body: {} })
    await w.t.call('POST', `/api/me/tasks/${completed}/complete`, { cookie: w.amy.cookie, body: {} })
    await w.t.call('POST', `/api/tasks/${cancelled}/cancel`, { cookie: w.boss.cookie })

    const expected = { outstanding, scheduled, past_due: pastDue, awaiting_approval: awaiting, completed, cancelled }
    for (const [status, id] of Object.entries(expected)) {
      const list = await w.t.call('GET', `/api/tasks?status=${status}`, { cookie: w.reader.cookie })
      expect(list.data.map((task: { id: number }) => task.id), status).toEqual([id])
      expect((await w.t.call('GET', `/api/tasks/${id}`, { cookie: w.reader.cookie })).data.status).toBe(status)
    }
    expect((await w.t.call('GET', '/api/tasks?status=all', { cookie: w.reader.cookie })).data).toHaveLength(6)
  })
})

describe('scheduled send', () => {
  it('keeps a scheduled task from its assignee, unannounced, until the clock sends it', async () => {
    const w = await world()
    const sendAt = from(HOUR)
    const id = await sendTask(w, w.boss, w.amy, { sendAt, dueAt: from(DAY) })
    expect((await w.t.call('GET', `/api/tasks/${id}`, { cookie: w.boss.cookie })).data.status).toBe('scheduled')
    expect((await w.t.call('GET', '/api/me/tasks', { cookie: w.amy.cookie })).data).toEqual([])
    expect((await w.t.call('GET', `/api/me/tasks/${id}`, { cookie: w.amy.cookie })).status).toBe(404)
    expect(notes(w.t)).toHaveLength(0)

    expect(runTaskClock(w.t.db, new Date(Date.parse(sendAt) - MINUTE)).arrived).toBe(0)
    expect(runTaskClock(w.t.db, new Date(sendAt)).arrived).toBe(1)
    expect(notes(w.t)).toMatchObject([{ userId: w.amy.id, kind: 'task_assigned', link: `/me/tasks/${id}` }])
    expect(runTaskClock(w.t.db, new Date(Date.parse(sendAt) + MINUTE)).arrived).toBe(0)
    expect(notes(w.t)).toHaveLength(1)
    expect(listMyTasks(w.t.db, w.amy.id, { cancelled: false }, new Date(sendAt))).toMatchObject([{ id, status: 'outstanding' }])
  })

  it('sends at the new time after a reschedule, not the old one, and tells nobody about the edit', async () => {
    const w = await world()
    const [first, second] = [from(HOUR), from(2 * HOUR)]
    const id = await sendTask(w, w.boss, w.amy, { sendAt: first, dueAt: from(DAY) })
    expect((await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.boss.cookie, body: { title: 'New title', sendAt: second } })).status).toBe(200)
    expect(notes(w.t), 'an edit before sending notifies nobody').toHaveLength(0)
    expect(runTaskClock(w.t.db, new Date(first)).arrived).toBe(0)
    expect(runTaskClock(w.t.db, new Date(second)).arrived).toBe(1)
  })

  it('sends a scheduled task with the edit that clears its send time', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy, { sendAt: from(HOUR), dueAt: from(DAY) })
    const edit = await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.boss.cookie, body: { sendAt: null } })
    expect(edit.status).toBe(200)
    expect(edit.data.status).toBe('outstanding')
    expect(edit.data.events.at(-1).details).toContain('Sent')
    expect(notes(w.t)).toMatchObject([{ userId: w.amy.id, kind: 'task_assigned', link: `/me/tasks/${id}` }])
    expect(runTaskClock(w.t.db, new Date(Date.now() + 2 * HOUR)).arrived).toBe(0)
    expect(notes(w.t)).toHaveLength(1)
  })

  it('refuses a send time in the past or once sent, and a due date before the send time', async () => {
    const w = await world()
    const past = await assign(w, w.boss, w.amy, { sendAt: from(-HOUR) })
    expect(past.status).toBe(422)
    expect(past.data.details.field).toBe('sendAt')
    const sent = await sendTask(w, w.boss, w.amy)
    expect((await w.t.call('PATCH', `/api/tasks/${sent}`, { cookie: w.boss.cookie, body: { sendAt: from(HOUR) } })).status).toBe(422)
    const id = await sendTask(w, w.boss, w.amy, { sendAt: from(2 * HOUR), dueAt: from(DAY) })
    const early = await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.boss.cookie, body: { dueAt: from(HOUR) } })
    expect(early.status).toBe(422)
    expect(early.data.details.field).toBe('dueAt')
  })
})

describe('fan-out', () => {
  it('makes one task for each account, each with its own history', async () => {
    const w = await world()
    const res = await assign(w, w.boss, [w.amy.id, w.reader.id, w.amy.id])
    expect(res.status).toBe(201)
    expect(res.data.map((task: { assignee: { id: number } }) => task.assignee.id).sort()).toEqual([w.amy.id, w.reader.id].sort())
    for (const task of res.data) {
      const detail = await w.t.call('GET', `/api/tasks/${task.id}`, { cookie: w.boss.cookie })
      expect(detail.data.events.map((event: { kind: string }) => event.kind)).toEqual(['assigned'])
    }
    expect(notes(w.t, undefined, 'task_assigned')).toHaveLength(2)
  })

  it('refuses the whole request if an account is inactive', async () => {
    const w = await world()
    const gone = w.t.addUser('gone@bphs.local', { isActive: false })
    expect((await assign(w, w.boss, [w.amy.id, gone.id])).status).toBe(422)
    expect(w.t.db.select().from(tasks).all()).toHaveLength(0)
    expect(notes(w.t)).toHaveLength(0)
  })
})

describe('approval gate', () => {
  it('completes a task that needs no approval and tells the assigner', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    const done = await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: { note: 'Filed' } })
    expect(done.data).toMatchObject({ status: 'completed', completionNote: 'Filed' })
    expect(notes(w.t, w.assigner.id)).toMatchObject([{ kind: 'task_completed', link: `/tasks/${id}` }])
  })

  it('holds a task that needs approval until its assigner approves it', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy, { requiresApproval: true })
    expect((await w.t.call('POST', `/api/tasks/${id}/approve`, { cookie: w.assigner.cookie })).status).toBe(409)
    const done = await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })
    expect(done.data.status).toBe('awaiting_approval')
    expect(notes(w.t, w.assigner.id)).toMatchObject([{ kind: 'task_approval_requested', link: `/tasks/${id}` }])
    const approved = await w.t.call('POST', `/api/tasks/${id}/approve`, { cookie: w.assigner.cookie })
    expect(approved.data.status).toBe('completed')
    expect(notes(w.t, w.amy.id, 'task_approved')).toMatchObject([{ link: `/me/tasks/${id}` }])
  })

  it('never lets the assignee approve their own task, even with Full or as Super Admin', async () => {
    const w = await world()
    for (const who of [w.full, w.boss]) {
      const id = await sendTask(w, w.editor, who, { requiresApproval: true })
      await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: who.cookie, body: {} })
      const approve = await w.t.call('POST', `/api/tasks/${id}/approve`, { cookie: who.cookie })
      expect(approve.status).toBe(403)
      expect(approve.data.message).toBe('You cannot approve or send back your own task.')
      expect((await w.t.call('POST', `/api/tasks/${id}/send-back`, { cookie: who.cookie, body: { note: 'No' } })).status).toBe(403)
    }
  })

  it('sends a task back to Outstanding with a note', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy, { requiresApproval: true })
    await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })
    expect((await w.t.call('POST', `/api/tasks/${id}/send-back`, { cookie: w.assigner.cookie, body: { note: '  ' } })).status).toBe(422)
    const back = await w.t.call('POST', `/api/tasks/${id}/send-back`, { cookie: w.assigner.cookie, body: { note: 'Missing page 2' } })
    expect(back.data.status).toBe('outstanding')
    expect(back.data.events.at(-1)).toMatchObject({ kind: 'sent_back', note: 'Missing page 2' })
    expect(notes(w.t, w.amy.id, 'task_sent_back')).toMatchObject([{ link: `/me/tasks/${id}` }])
  })

  it('refuses to complete or edit a cancelled task', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    await w.t.call('POST', `/api/tasks/${id}/cancel`, { cookie: w.assigner.cookie })
    expect((await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })).status).toBe(409)
    expect((await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.assigner.cookie, body: { title: 'Again' } })).status).toBe(409)
  })

  it('refuses to complete a task twice or before it is sent, and to cancel a completed one', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    expect((await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })).status).toBe(200)
    expect((await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })).status).toBe(409)
    expect((await w.t.call('POST', `/api/tasks/${id}/cancel`, { cookie: w.assigner.cookie })).status).toBe(409)
    const scheduled = await sendTask(w, w.assigner, w.amy, { sendAt: from(HOUR), dueAt: from(DAY) })
    expect((await w.t.call('POST', `/api/me/tasks/${scheduled}/complete`, { cookie: w.amy.cookie, body: {} })).status).toBe(404)
  })

  it('refuses Requires approval on a task its assigner sends themself', async () => {
    const w = await world()
    const create = await assign(w, w.assigner, [w.amy.id, w.assigner.id], { requiresApproval: true })
    expect(create.status).toBe(422)
    expect(create.data).toMatchObject({ message: SELF_APPROVAL_PROBLEM, details: { field: 'requiresApproval' } })
    expect(w.t.db.select().from(tasks).all()).toHaveLength(0)
    const own = await sendTask(w, w.assigner, w.assigner)
    expect((await w.t.call('PATCH', `/api/tasks/${own}`, { cookie: w.assigner.cookie, body: { requiresApproval: true } })).data.message).toBe(APPROVAL_LOCKED_PROBLEM)
    const edit = await w.t.call('PATCH', `/api/tasks/${own}`, { cookie: w.editor.cookie, body: { requiresApproval: true } })
    expect(edit.status).toBe(422)
    expect(edit.data.details.field).toBe('requiresApproval')
  })
})

describe('notifications', () => {
  it('tells the assignee about an edit after the task arrives', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.assigner.cookie, body: { title: 'File it today' } })
    expect(notes(w.t, w.amy.id, 'task_updated')).toMatchObject([{ link: `/me/tasks/${id}`, sourceKey: `task:${id}` }])
  })

  it('never tells you about your own actions', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.assigner)
    await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.assigner.cookie, body: { title: 'Note to self' } })
    await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.assigner.cookie, body: {} })
    expect(notes(w.t)).toHaveLength(0)
  })

  it('takes a deleted task’s notifications with it', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    const keep = await sendTask(w, w.assigner, w.amy)
    await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })
    expect(notes(w.t)).toHaveLength(3)
    expect((await w.t.call('DELETE', `/api/tasks/${id}`, { cookie: w.boss.cookie })).status).toBe(204)
    expect(notes(w.t)).toMatchObject([{ sourceKey: `task:${keep}` }])
  })
})

describe('cancel', () => {
  it('tells an assignee who has the task, which leaves My Space unless asked for', async () => {
    const w = await world()
    const id = await sendTask(w, w.assigner, w.amy)
    expect((await w.t.call('POST', `/api/tasks/${id}/cancel`, { cookie: w.assigner.cookie })).status).toBe(200)
    expect(notes(w.t, w.amy.id, 'task_cancelled')).toMatchObject([{ link: `/me/tasks/${id}` }])
    expect((await w.t.call('GET', '/api/me/tasks', { cookie: w.amy.cookie })).data).toEqual([])
    expect((await w.t.call('GET', '/api/me/tasks?cancelled=true', { cookie: w.amy.cookie })).data.map((task: { id: number }) => task.id)).toEqual([id])
  })

  it('never sends a scheduled task once cancelled, and tells nobody', async () => {
    const w = await world()
    const sendAt = from(HOUR)
    const id = await sendTask(w, w.assigner, w.amy, { sendAt, dueAt: from(DAY) })
    expect((await w.t.call('POST', `/api/tasks/${id}/cancel`, { cookie: w.assigner.cookie })).status).toBe(200)
    expect(runTaskClock(w.t.db, new Date(Date.parse(sendAt) + MINUTE)).arrived).toBe(0)
    expect(notes(w.t)).toHaveLength(0)
  })
})

describe('reminders', () => {
  // Sent Thu 1 Oct 2026, due Mon 5 Oct at 10:00 in New York (EDT, UTC-4). Reminders on weekdays at 09:00 there, 13:00 UTC.
  const SEND = new Date('2026-10-01T13:00:00Z')
  const DUE = new Date('2026-10-05T14:00:00Z')
  const clock = (t: T, at: string) => runTaskClock(t.db, new Date(at))

  async function pastDue(assignerReminders: string) {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy, { reminderTime: '09:00', assignerReminders })
    setTimes(w.t, id, SEND, DUE)
    const past = (userId: number) => notes(w.t, userId, 'task_past_due')
    return { w, id, past }
  }

  it('reminds the assignee once on each reminder day, at the reminder time', async () => {
    const { w, id, past } = await pastDue('none')
    expect(clock(w.t, '2026-10-05T15:00:00Z')).toEqual({ arrived: 0, pastDue: 0, reminded: 0 })
    expect(clock(w.t, '2026-10-06T12:59:00Z').reminded).toBe(0)
    expect(clock(w.t, '2026-10-06T13:00:00Z').reminded).toBe(1)
    expect(clock(w.t, '2026-10-06T20:00:00Z').reminded).toBe(0)
    expect(clock(w.t, '2026-10-10T14:00:00Z').reminded).toBe(0)
    expect(clock(w.t, '2026-10-12T13:30:00Z').reminded).toBe(1)
    expect(past(w.amy.id)).toHaveLength(2)
    expect(past(w.amy.id)[0]).toMatchObject({ link: `/me/tasks/${id}` })
    expect(past(w.boss.id)).toHaveLength(0)
  })

  it('reminds on the due day when the reminder time comes after the due time', async () => {
    const { w, id, past } = await pastDue('none')
    setTimes(w.t, id, SEND, new Date('2026-10-05T12:00:00Z'))
    expect(clock(w.t, '2026-10-05T13:00:00Z').reminded).toBe(1)
    expect(past(w.amy.id)).toHaveLength(1)
  })

  it.each([
    { mode: 'first', told: 1, about: 'the first past-due notice only' },
    { mode: 'every', told: 3, about: 'each reminder too' },
  ])('tells an assigner on $mode about $about', async ({ mode, told }) => {
    const { w, id, past } = await pastDue(mode)
    expect(clock(w.t, '2026-10-05T15:00:00Z').pastDue).toBe(1)
    clock(w.t, '2026-10-06T13:00:00Z')
    clock(w.t, '2026-10-07T13:00:00Z')
    expect(past(w.amy.id)).toHaveLength(2)
    expect(past(w.boss.id)).toHaveLength(told)
    expect(past(w.boss.id)[0]).toMatchObject({ link: `/tasks/${id}` })
  })

  it('tells an assigner on Every once when the first notice and a reminder come in the same run', async () => {
    const { w, id, past } = await pastDue('every')
    setTimes(w.t, id, SEND, new Date('2026-10-06T13:00:00Z'))
    expect(clock(w.t, '2026-10-06T13:00:00Z')).toEqual({ arrived: 0, pastDue: 1, reminded: 1 })
    expect(past(w.boss.id)).toHaveLength(1)
    clock(w.t, '2026-10-07T13:00:00Z')
    expect(past(w.boss.id)).toHaveLength(2)
  })

  it('keeps the reminder at the local time across a clock change', async () => {
    const w = await world()
    // London leaves summer time on Sun 25 Oct 2026: 09:00 there is 08:00 UTC before it and 09:00 UTC after.
    const id = await sendTask(w, w.boss, w.amy, { reminderTime: '09:00', reminderZone: 'Europe/London' })
    setTimes(w.t, id, new Date('2026-10-20T09:00:00Z'), new Date('2026-10-22T12:00:00Z'))
    expect(clock(w.t, '2026-10-22T13:00:00Z').reminded).toBe(0)
    expect(clock(w.t, '2026-10-23T07:59:00Z').reminded).toBe(0)
    expect(clock(w.t, '2026-10-23T08:00:00Z').reminded).toBe(1)
    expect(clock(w.t, '2026-10-26T08:30:00Z').reminded).toBe(0)
    expect(clock(w.t, '2026-10-26T09:00:00Z').reminded).toBe(1)
  })

  it('logs a task that fails and still reminds about the rest', async () => {
    const { w, id, past } = await pastDue('none')
    const broken = await sendTask(w, w.boss, w.amy)
    setTimes(w.t, broken, SEND, DUE)
    w.t.db.update(tasks).set({ reminderZone: 'Nowhere/Atlantis' }).where(eq(tasks.id, broken)).run()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(clock(w.t, '2026-10-06T13:00:00Z').reminded).toBe(1)
      expect(log).toHaveBeenCalledWith(`Task clock: task ${broken} failed`, expect.any(RangeError))
    } finally {
      log.mockRestore()
    }
    expect(past(w.amy.id)).toMatchObject([{ link: `/me/tasks/${id}` }])
    // Its savepoint rolled back, so it is tried again next time.
    expect(row(w.t, broken).pastDueNotifiedAt).toBeNull()
  })

  it('sends nothing for a completed or cancelled task', async () => {
    const { w, id, past } = await pastDue('every')
    const cancelled = await sendTask(w, w.boss, w.amy, { assignerReminders: 'every' })
    setTimes(w.t, cancelled, SEND, DUE)
    await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })
    await w.t.call('POST', `/api/tasks/${cancelled}/cancel`, { cookie: w.boss.cookie })
    expect(clock(w.t, '2026-10-06T13:00:00Z')).toEqual({ arrived: 0, pastDue: 0, reminded: 0 })
    expect(past(w.amy.id)).toHaveLength(0)
    expect(past(w.boss.id)).toHaveLength(0)
  })

  it('starts the notices over when the due date changes', async () => {
    const { w, id, past } = await pastDue('first')
    clock(w.t, '2026-10-06T13:00:00Z')
    expect(row(w.t, id)).toMatchObject({ pastDueNotifiedAt: new Date('2026-10-06T13:00:00Z'), lastRemindedOn: '2026-10-06' })
    expect((await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.boss.cookie, body: { dueAt: from(DAY) } })).status).toBe(200)
    expect(row(w.t, id)).toMatchObject({ pastDueNotifiedAt: null, lastRemindedOn: null })
    setTimes(w.t, id, SEND, new Date('2026-10-06T12:00:00Z'))
    expect(clock(w.t, '2026-10-06T14:00:00Z')).toEqual({ arrived: 0, pastDue: 1, reminded: 1 })
    expect(past(w.boss.id)).toHaveLength(2)
    expect(past(w.amy.id)).toHaveLength(2)
  })
})

describe('sanitising', () => {
  it('strips scripts and handlers from the body, on create and edit, and stores empty paragraphs as nothing', async () => {
    const w = await world()
    const html = async (id: number) => (await w.t.call('GET', `/api/tasks/${id}`, { cookie: w.boss.cookie })).data.bodyHtml as string
    const id = await sendTask(w, w.boss, w.amy, { body: '<p onclick="steal()">Hello</p><script>alert(1)</script>' })
    expect(await html(id)).toContain('Hello')
    expect(await html(id)).not.toMatch(/script|onclick|alert/)
    expect(await html(await sendTask(w, w.boss, w.amy, { body: '<p></p><p> </p>' }))).toBe('')
    const edit = await w.t.call('PATCH', `/api/tasks/${id}`, { cookie: w.boss.cookie, body: { body: '<p>Hi</p><img src="x" onerror="steal()">' } })
    expect(edit.data.bodyHtml).toContain('Hi')
    expect(edit.data.bodyHtml).not.toMatch(/onerror|steal/)
  })
})

describe('attachments', () => {
  const pdf = (name = 'brief.pdf', size = 100) => new File([Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size)])], name, { type: 'application/pdf' })
  /** A multipart request, the way the page sends files: the JSON as `data`, the files as `files`, from this origin. */
  const send = (w: W, method: string, url: string, by: Who, data: unknown, list: File[]) => {
    const form = new FormData()
    form.set('data', JSON.stringify(data))
    for (const file of list) form.append('files', file)
    return w.t.app.request(url, { method, headers: { cookie: by.cookie, origin: 'http://localhost' }, body: form })
  }
  const detail = async (w: W, id: number) => (await w.t.call('GET', `/api/tasks/${id}`, { cookie: w.boss.cookie })).data
  const withdraw = (w: W, by: Who, url: string) => w.t.call('POST', `${url}/withdraw`, { cookie: by.cookie, body: { reason: 'Wrong file' } })

  it('gives each fanned-out task its own copy, which anyone who can see the task can download', async () => {
    const w = await world()
    const res = await send(w, 'POST', '/api/tasks', w.boss, { assigneeIds: [w.amy.id, w.reader.id], title: 'Read this', dueAt: from(DAY), reminderZone: ZONE }, [pdf()])
    expect(res.status).toBe(201)
    // Amy's task first.
    const made = (await res.json()) as { id: number; assignee: { id: number } }[]
    const ids: [number, number] = [made.find((task) => task.assignee.id === w.amy.id)!.id, made.find((task) => task.assignee.id !== w.amy.id)!.id]
    const files = await Promise.all(ids.map(async (id) => (await detail(w, id)).attachments))
    expect(files.map((list) => list.map((f: { filename: string; side: string }) => [f.filename, f.side]))).toEqual([[['brief.pdf', 'assigner']], [['brief.pdf', 'assigner']]])
    expect(files[0][0].id).not.toBe(files[1][0].id)
    expect((await detail(w, ids[0])).events[0].details).toBe('Added brief.pdf')

    const [amyTask] = ids
    const fileId = files[0][0].id
    const reader = await w.t.app.request(`/api/tasks/${amyTask}/attachments/${fileId}`, { headers: { cookie: w.reader.cookie } })
    expect(reader.status).toBe(200)
    expect(reader.headers.get('content-disposition')).toContain('brief.pdf')
    expect((await w.t.app.request(`/api/me/tasks/${amyTask}/attachments/${fileId}`, { headers: { cookie: w.amy.cookie } })).status).toBe(200)
    // Not hers, and no Employee Tasks access: neither way in.
    expect((await w.t.app.request(`/api/me/tasks/${ids[1]}/attachments/${files[1][0].id}`, { headers: { cookie: w.amy.cookie } })).status).toBe(404)
    expect((await w.t.app.request(`/api/tasks/${amyTask}/attachments/${fileId}`, { headers: { cookie: w.amy.cookie } })).status).toBe(403)
    // An ID from another task is not found here.
    expect((await w.t.app.request(`/api/tasks/${amyTask}/attachments/${files[1][0].id}`, { headers: { cookie: w.reader.cookie } })).status).toBe(404)
  })

  it('adds files through an edit, past the usual body limit, which tells the assignee', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy)
    // The same size outside Tasks keeps the usual limit.
    expect((await send(w, 'PATCH', '/api/grievances/1', w.boss, {}, [pdf('big.pdf', 5 * 1024 * 1024)])).status).toBe(413)
    const res = await send(w, 'PATCH', `/api/tasks/${id}`, w.boss, {}, [pdf('extra.pdf', 5 * 1024 * 1024)])
    expect(res.status).toBe(200)
    const task = await detail(w, id)
    expect(task.attachments.map((f: { filename: string }) => f.filename)).toEqual(['extra.pdf'])
    expect(task.events.at(-1).details).toBe('Changed files · Added extra.pdf')
    expect(notes(w.t, w.amy.id, 'task_updated')).toHaveLength(1)
  })

  it('refuses a file of the wrong type, and files that would come to too much across a large fan-out', async () => {
    const w = await world()
    const exe = await send(w, 'POST', '/api/tasks', w.boss, { assigneeIds: [w.amy.id], title: 'X', dueAt: from(DAY), reminderZone: ZONE }, [new File(['MZ'], 'run.exe')])
    expect(exe.status).toBe(422)
    const many = Array.from({ length: 21 }, (_, i) => w.t.addUser(`many${i}@bphs.local`).id)
    const res = await send(w, 'POST', '/api/tasks', w.boss, { assigneeIds: many, title: 'Big', dueAt: from(DAY), reminderZone: ZONE }, [pdf('big.pdf', 10 * 1024 * 1024 - 100)])
    expect(res.status).toBe(422)
    expect(((await res.json()) as { details: { field: string } }).details.field).toBe('files')
    expect(w.t.db.select().from(tasks).all()).toHaveLength(0)
  })

  it('checks who may write before it reads the files', async () => {
    const w = await world()
    // Refused as a reader, however broken the form.
    expect((await send(w, 'POST', '/api/tasks', w.reader, { title: '' }, [pdf()])).status).toBe(403)
    const theirs = await sendTask(w, w.editor, w.amy)
    expect((await send(w, 'PATCH', `/api/tasks/${theirs}`, w.assigner, {}, [pdf()])).status).toBe(403)
    expect((await send(w, 'POST', `/api/me/tasks/${theirs}/complete`, w.reader, {}, [pdf()])).status).toBe(404)
    expect(w.t.sqlite.prepare('select count(*) as n from task_attachments').get()).toEqual({ n: 0 })
  })

  it('holds Mark complete for a file when the task needs one, and keeps the files through a send back', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy, { requiresFile: true, requiresApproval: true })
    const bare = await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })
    expect(bare.status).toBe(422)
    expect(bare.data.details.field).toBe('files')

    expect((await send(w, 'POST', `/api/me/tasks/${id}/complete`, w.amy, { note: 'Done' }, [pdf('proof.pdf')])).status).toBe(200)
    expect((await detail(w, id)).attachments.map((f: { side: string; uploadedById: number }) => [f.side, f.uploadedById])).toEqual([['assignee', w.amy.id]])
    expect((await w.t.call('POST', `/api/tasks/${id}/send-back`, { cookie: w.boss.cookie, body: { note: 'Sign it' } })).status).toBe(200)
    expect((await detail(w, id)).attachments).toHaveLength(1)
    // The file from before the send back still counts.
    expect((await w.t.call('POST', `/api/me/tasks/${id}/complete`, { cookie: w.amy.cookie, body: {} })).status).toBe(200)
  })

  it('withdraws a file under the rules: who added it or can change the task, while it still matters', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy, { requiresApproval: true })
    await send(w, 'PATCH', `/api/tasks/${id}`, w.boss, {}, [pdf('brief.pdf')])
    await send(w, 'POST', `/api/me/tasks/${id}/complete`, w.amy, {}, [pdf('proof.pdf')])
    const [brief, proof] = (await detail(w, id)).attachments as [{ id: number }, { id: number }]
    const briefUrl = `/api/tasks/${id}/attachments/${brief.id}`
    const proofUrl = `/api/me/tasks/${id}/attachments/${proof.id}`

    // Awaiting approval: the completion file is fixed, the assigner's is not; a reader may withdraw neither.
    expect((await withdraw(w, w.amy, proofUrl)).status).toBe(409)
    expect((await withdraw(w, w.reader, briefUrl)).status).toBe(403)
    const done = await withdraw(w, w.boss, briefUrl)
    expect(done.status).toBe(200)
    expect(done.data.attachments[0]).toMatchObject({ withdrawnReason: 'Wrong file' })
    expect(done.data.events.at(-1)).toMatchObject({ kind: 'file_withdrawn', note: 'Wrong file', details: 'brief.pdf' })
    expect((await w.t.app.request(briefUrl, { headers: { cookie: w.boss.cookie } })).status).toBe(410)
    expect((await withdraw(w, w.boss, briefUrl)).status).toBe(409)

    // Sent back, the assignee can take hers back.
    await w.t.call('POST', `/api/tasks/${id}/send-back`, { cookie: w.boss.cookie, body: { note: 'Wrong one' } })
    expect((await withdraw(w, w.amy, proofUrl)).status).toBe(200)
  })

  it('lets an assignee withdraw only their own files, from their own tasks, in My Space', async () => {
    const w = await world()
    const id = await sendTask(w, w.boss, w.amy)
    await send(w, 'PATCH', `/api/tasks/${id}`, w.boss, {}, [pdf('brief.pdf')])
    const [brief] = (await detail(w, id)).attachments as [{ id: number }]
    const url = `/api/me/tasks/${id}/attachments/${brief.id}`
    expect((await withdraw(w, w.amy, url)).status).toBe(403)
    expect((await withdraw(w, w.reader, url)).status).toBe(404)
  })

  it('deletes the files with the task', async () => {
    const w = await world()
    const res = await send(w, 'POST', '/api/tasks', w.boss, { assigneeIds: [w.amy.id], title: 'X', dueAt: from(DAY), reminderZone: ZONE }, [pdf()])
    const [{ id }] = (await res.json()) as [{ id: number }]
    expect((await w.t.call('DELETE', `/api/tasks/${id}`, { cookie: w.boss.cookie })).status).toBe(204)
    expect(w.t.sqlite.prepare('select count(*) as n from task_attachments').get()).toEqual({ n: 0 })
    expect(w.t.sqlite.prepare('select count(*) as n from task_attachment_data').get()).toEqual({ n: 0 })
  })
})
