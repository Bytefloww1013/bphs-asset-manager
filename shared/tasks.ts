import type { TaskStatus } from './constants.ts'

/** What a task's status is worked out from. Instants may be Dates or ISO text, as the server and the browser each hold them. */
export interface TaskTimes {
  sendAt: Date | string
  dueAt: Date | string
  requiresApproval: boolean
  completedAt: Date | string | null
  approvedAt: Date | string | null
  cancelledAt: Date | string | null
}

const time = (value: Date | string) => new Date(value).getTime()

/** A task's status is never stored, so it is always true to the clock. Each rule wins over the ones after it. */
export function taskStatus(task: TaskTimes, now: Date = new Date()): TaskStatus {
  if (task.cancelledAt) return 'cancelled'
  if (task.completedAt) return task.requiresApproval && !task.approvedAt ? 'awaiting_approval' : 'completed'
  if (time(task.sendAt) > now.getTime()) return 'scheduled'
  if (time(task.dueAt) <= now.getTime()) return 'past_due'
  return 'outstanding'
}

/** Whether a time zone name is one this runtime knows, as in America/Chicago. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}
