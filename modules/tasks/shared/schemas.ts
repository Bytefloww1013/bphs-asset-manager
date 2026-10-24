import { z } from 'zod'
import { BODY_HTML_MAX, id, optionalText, requiredText } from '#shared/schemas.ts'
import {
  TASK_ASSIGNER_REMINDERS,
  TASK_NOTE_MAX,
  TASK_REMINDER_PRESETS,
  TASK_REMINDER_TIME,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  TASK_WEEKDAYS,
} from './constants.ts'
import { isTimeZone } from './tasks.ts'

// ---- Tasks ------------------------------------------------------------------------
const instant = (what: string) => z.iso.datetime({ offset: true, error: `Enter ${what}` })
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time, as in 09:00')
/** Each day once, Monday first, whatever order the browser sent them in. */
const weekdays = z
  .array(z.enum(TASK_WEEKDAYS))
  .max(7)
  .transform((days) => TASK_WEEKDAYS.filter((day) => days.includes(day)))

/** What a task says and when, with no defaults: an edit sends only what it changes. */
const taskFields = {
  title: requiredText(TASK_TITLE_MAX, 'Title'),
  /** HTML from the editor, or nothing. The server sanitises it and never stores what it was sent. */
  body: z.string().max(BODY_HTML_MAX, 'This is too long'),
  /** When it reaches the assignee. Null sends it now. */
  sendAt: instant('when to send it').nullable(),
  dueAt: instant('when it is due'),
  requiresApproval: z.boolean(),
  requiresFile: z.boolean(),
  reminderDays: weekdays,
  reminderTime: timeOfDay,
  /** The assigner's browser's time zone: reminders go out at the time picked, there. */
  reminderZone: z.string().max(64).refine(isTimeZone, 'Unknown time zone'),
  assignerReminders: z.enum(TASK_ASSIGNER_REMINDERS),
}

export const DUE_AFTER_SEND = 'It must be due after it is sent'

/** Due after it is sent: after its send time, or, sent now (or not changed in an edit), after now. */
const dueAfterSend = (task: { sendAt?: string | null; dueAt?: string }, ctx: z.RefinementCtx) => {
  if (!task.dueAt || Date.parse(task.dueAt) > (task.sendAt ? Date.parse(task.sendAt) : Date.now())) return
  ctx.addIssue({
    code: 'custom',
    message: task.sendAt ? DUE_AFTER_SEND : 'It must be due in the future',
    path: ['dueAt'],
  })
}

/** One task for each account picked (fan-out). */
export const taskCreateSchema = z
  .object({
    assigneeIds: z.array(id).min(1, 'Pick at least one account').max(500),
    ...taskFields,
    body: taskFields.body.default(''),
    sendAt: taskFields.sendAt.default(null),
    requiresApproval: taskFields.requiresApproval.default(false),
    requiresFile: taskFields.requiresFile.default(false),
    reminderDays: weekdays.default([...TASK_REMINDER_PRESETS.weekdays]),
    reminderTime: timeOfDay.default(TASK_REMINDER_TIME),
    assignerReminders: taskFields.assignerReminders.default('none'),
  })
  .superRefine(dueAfterSend)
export type TaskCreateInput = z.infer<typeof taskCreateSchema>

/** The assignee cannot change: cancel the task and assign it again. The send time can change only before it is sent. */
export const taskUpdateSchema = z.object(taskFields).partial().superRefine(dueAfterSend)
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>

export const taskCompleteSchema = z.object({ note: optionalText(TASK_NOTE_MAX, 'Note') })
export type TaskCompleteInput = z.infer<typeof taskCompleteSchema>

export const taskAttachmentWithdrawSchema = z.object({ reason: requiredText(TASK_NOTE_MAX, 'Reason') })
export type TaskAttachmentWithdrawInput = z.infer<typeof taskAttachmentWithdrawSchema>

export const taskSendBackSchema = z.object({ note: requiredText(TASK_NOTE_MAX, 'Note') })
export type TaskSendBackInput = z.infer<typeof taskSendBackSchema>

export const taskListQuerySchema = z.object({
  status: z.enum([...TASK_STATUSES, 'all']).default('all'),
  assignee: z.coerce.number().int().positive().optional(),
  assigner: z.coerce.number().int().positive().optional(),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>

/** My Space leaves cancelled tasks out unless asked. */
export const myTaskListQuerySchema = z.object({ cancelled: z.stringbool().default(false) })
export type MyTaskListQuery = z.infer<typeof myTaskListQuerySchema>
