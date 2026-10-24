/** A task's status is never stored: `taskStatus()` in `./tasks.ts` works it out from the task's timestamps. */
export const TASK_STATUSES = [
  'scheduled',
  'outstanding',
  'past_due',
  'awaiting_approval',
  'completed',
  'cancelled',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  scheduled: 'Scheduled',
  outstanding: 'Outstanding',
  past_due: 'Past-Due',
  awaiting_approval: 'Awaiting approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
export const taskStatusLabel = (status: TaskStatus) => TASK_STATUS_LABELS[status]
/** The statuses on My Space's Open filter: what the assignee still has to do, or is waiting on. */
export const TASK_OPEN: readonly TaskStatus[] = ['outstanding', 'past_due', 'awaiting_approval']

export const TASK_TITLE_MAX = 200
/** The longest completion or send-back note. */
export const TASK_NOTE_MAX = 2000
/**
 * The most a task's files may come to, once copied to each assignee: each task keeps its own copy (assignees x total bytes).
 * shortcut: each assignee stores its own copy of the files; share the bytes between tasks if this cap gets in the way.
 */
export const TASK_FANOUT_MAX_BYTES = 200 * 1024 * 1024

/** Reminder days, as iCalendar's BYDAY names them, Monday first. */
export const TASK_WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type TaskWeekday = (typeof TASK_WEEKDAYS)[number]
export const TASK_WEEKDAY_LABEL: Record<TaskWeekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
}
export const TASK_REMINDER_PRESETS = {
  none: [],
  weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
  every_day: [...TASK_WEEKDAYS],
} as const satisfies Record<string, readonly TaskWeekday[]>
export const TASK_REMINDER_PRESET_LABEL: Record<keyof typeof TASK_REMINDER_PRESETS, string> = {
  none: 'None',
  weekdays: 'Weekdays',
  every_day: 'Every day',
}
/** Reminders go out at this time of day unless the assigner picks another, in the assigner's time zone. */
export const TASK_REMINDER_TIME = '09:00'

/** What the assigner hears while a task is past due: nothing, the first notice only, or every reminder the assignee gets. */
export const TASK_ASSIGNER_REMINDERS = ['none', 'first', 'every'] as const
export type TaskAssignerReminders = (typeof TASK_ASSIGNER_REMINDERS)[number]
export const TASK_ASSIGNER_REMINDERS_LABEL: Record<TaskAssignerReminders, string> = {
  none: 'None',
  first: 'First notice only',
  every: 'Every reminder',
}

/** Who added a task's file: the assigner, with the task, or the assignee, with a completion. */
export type TaskFileSide = 'assigner' | 'assignee'

/** What a task's history records. */
export const TASK_EVENT_KINDS = [
  'assigned',
  'edited',
  'completed',
  'sent_back',
  'approved',
  'cancelled',
  'file_withdrawn',
] as const
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number]
const TASK_EVENT_LABELS: Record<TaskEventKind, string> = {
  assigned: 'Assigned',
  edited: 'Edited',
  completed: 'Completed',
  sent_back: 'Sent back',
  approved: 'Approved',
  cancelled: 'Cancelled',
  file_withdrawn: 'File withdrawn',
}
export const taskEventLabel = (kind: TaskEventKind) => TASK_EVENT_LABELS[kind]
