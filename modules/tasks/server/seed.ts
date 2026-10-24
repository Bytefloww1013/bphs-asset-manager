import type { Db } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { plainToRichText } from '#kernel/lib/richtext.ts'
import { TASK_REMINDER_PRESETS, TASK_REMINDER_TIME, type TaskEventKind } from '../shared/constants.ts'
import { taskEvents, tasks } from './schema.ts'
import { localTime } from './service.ts'

// Demo tasks for `bun run db:seed`, one or more in every status, written as the services write them but at chosen times in the past.

const DAY = 86_400_000
const ZONE = 'America/New_York'

interface DemoTask {
  title: string
  body: string
  from: Actor
  to: Actor
  /** Days ago (negative: ahead) it was assigned, sent and due. */
  assigned: number
  sent: number
  due: number
  approval?: boolean
  completed?: { days: number; note?: string }
  approved?: number
  cancelled?: number
}

/** Rosa gets several, one of them Outstanding, as the browser smoke test signs in as her. */
export function seedTasks(
  db: Db,
  now: number,
  { priya, marcus, dana, rosa }: { priya: Actor; marcus: Actor; dana: Actor; rosa: Actor },
): number {
  const at = (days: number, hour = 10) => {
    const date = new Date(now - days * DAY)
    date.setHours(hour, 0, 0, 0)
    return date
  }
  const demo: DemoTask[] = [
    // Scheduled
    {
      title: 'Review the Q4 budget variance report',
      body: 'Flag any line more than 10% over budget before the finance committee meets.',
      from: priya,
      to: marcus,
      assigned: 1,
      sent: -3,
      due: -10,
    },
    // Outstanding
    {
      title: 'Update the intake packet with the new consent form',
      body: 'Swap in the revised consent form and recycle the old printed copies.',
      from: dana,
      to: rosa,
      assigned: 2,
      sent: 2,
      due: -5,
    },
    {
      title: 'Complete the annual HIPAA privacy training',
      body: 'The course is in the learning portal. Upload your certificate when you finish.',
      from: priya,
      to: rosa,
      assigned: 6,
      sent: 6,
      due: -14,
      approval: true,
    },
    // Past-Due
    {
      title: 'Submit October mileage reimbursement',
      body: 'Use the mileage form and attach your trip log.',
      from: marcus,
      to: rosa,
      assigned: 12,
      sent: 12,
      due: 2,
    },
    {
      title: 'Renew the fire extinguisher inspection',
      body: 'Book the vendor for Harbour House and Maple Court; tags expire this month.',
      from: priya,
      to: dana,
      assigned: 20,
      sent: 20,
      due: 4,
    },
    // Awaiting approval
    {
      title: 'Reconcile the petty cash log for Maple Court',
      body: 'Match receipts to the log and note any shortfall.',
      from: dana,
      to: marcus,
      assigned: 9,
      sent: 9,
      due: -2,
      approval: true,
      completed: { days: 1, note: 'Balanced to the dollar; receipts are in the binder.' },
    },
    // Completed, without approval
    {
      title: 'Return the visitor sign-in binder to the front desk',
      body: 'It was borrowed for the audit walk-through.',
      from: marcus,
      to: rosa,
      assigned: 15,
      sent: 15,
      due: 8,
      completed: { days: 10 },
    },
    // Completed and approved
    {
      title: 'Compare quotes for the new copier lease',
      body: 'Get at least three quotes and summarise the monthly cost of each.',
      from: priya,
      to: marcus,
      assigned: 25,
      sent: 25,
      due: 12,
      approval: true,
      completed: { days: 14, note: 'Three quotes attached to the shared drive.' },
      approved: 13,
    },
    // Cancelled
    {
      title: 'Order replacement badge lanyards',
      body: 'Fifty, in the agency blue.',
      from: dana,
      to: rosa,
      assigned: 7,
      sent: 7,
      due: -3,
      cancelled: 3,
    },
  ]

  return db.transaction((tx) => {
    for (const t of demo) {
      const body = plainToRichText(t.body)
      const sendAt = at(t.sent, 9)
      const dueAt = at(t.due, 17)
      const pastDue = !t.completed && !t.cancelled && dueAt.getTime() <= now
      const task = tx
        .insert(tasks)
        .values({
          assigneeUserId: t.to.id,
          assignerUserId: t.from.id,
          assignerSuperAdmin: t.from.superAdmin,
          title: t.title,
          bodyHtml: body.html,
          bodyText: body.text,
          sendAt,
          dueAt,
          requiresApproval: t.approval ?? false,
          completedAt: t.completed ? at(t.completed.days, 15) : null,
          completionNote: t.completed?.note ?? null,
          approvedAt: t.approved !== undefined ? at(t.approved, 11) : null,
          cancelledAt: t.cancelled !== undefined ? at(t.cancelled, 14) : null,
          reminderDays: [...TASK_REMINDER_PRESETS.weekdays],
          reminderTime: TASK_REMINDER_TIME,
          reminderZone: ZONE,
          assignerReminders: 'first',
          arrivedAt: sendAt.getTime() <= now ? sendAt : null,
          // Already told, so the clock's first tick sends no burst of past-due notices; the daily reminder resumes tomorrow.
          pastDueNotifiedAt: pastDue ? new Date(dueAt.getTime() + 3_600_000) : null,
          lastRemindedOn: pastDue ? localTime(new Date(now), ZONE).date : null,
          createdAt: at(t.assigned, 9),
        })
        .returning()
        .get()
      const event = (
        kind: TaskEventKind,
        actor: Actor,
        createdAt: Date,
        extra: { note?: string; details?: string } = {},
      ) =>
        tx
          .insert(taskEvents)
          .values({
            taskId: task.id,
            kind,
            note: extra.note ?? null,
            details: extra.details ?? '',
            actorUserId: actor.id,
            actorLabel: actor.name,
            createdAt,
          })
          .run()
      event('assigned', t.from, task.createdAt, { details: task.arrivedAt ? '' : 'Scheduled' })
      if (task.completedAt) event('completed', t.to, task.completedAt, { note: t.completed?.note })
      if (task.approvedAt) event('approved', t.from, task.approvedAt)
      if (task.cancelledAt) event('cancelled', t.from, task.cancelledAt)
    }
    return demo.length
  })
}
