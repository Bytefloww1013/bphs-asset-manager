import type { TaskAssignerReminders, TaskEventKind, TaskFileSide, TaskStatus, TaskWeekday } from './constants.ts'

// ---- Tasks --------------------------------------------------------------
/** An account, as a task names it. */
export interface AccountRef {
  id: number
  name: string
  email: string
}

export interface TaskRow {
  id: number
  title: string
  status: TaskStatus
  assignee: AccountRef
  assigner: AccountRef
  /** Whether a Super Admin assigned it: then only Full can change it. */
  assignerSuperAdmin: boolean
  /** When it reaches (or reached) the assignee. */
  sendAt: string
  dueAt: string
  requiresApproval: boolean
  /** Whether Mark complete needs one of the assignee's files on the task. */
  requiresFile: boolean
  completedAt: string | null
  createdAt: string
}

export interface TaskEventRow {
  id: number
  kind: TaskEventKind
  note: string | null
  details: string
  actor: string
  createdAt: string
}

export interface TaskDetail extends TaskRow {
  /** Sanitised HTML. */
  bodyHtml: string
  completionNote: string | null
  approvedAt: string | null
  cancelledAt: string | null
  reminderDays: TaskWeekday[]
  reminderTime: string
  reminderZone: string
  assignerReminders: TaskAssignerReminders
  events: TaskEventRow[]
  /** Withdrawn ones too, in the order they were added. */
  attachments: TaskAttachment[]
}

/** A file on a task. Its bytes are fetched on their own. */
export interface TaskAttachment {
  id: number
  side: TaskFileSide
  filename: string
  contentType: string
  size: number
  uploadedBy: string
  /** Null once that account is deleted. */
  uploadedById: number | null
  uploadedAt: string
  /** Set once taken back as added by mistake: it can no longer be downloaded. */
  withdrawnAt: string | null
  withdrawnReason: string | null
}
