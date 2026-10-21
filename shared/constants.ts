/** The app is separate workspaces behind one sign-in. A person is in one at a time, never looking at a mix. */
export const WORKSPACES = ['assets', 'grievances', 'maintenance', 'reviews', 'tasks'] as const
export type Workspace = (typeof WORKSPACES)[number]
export const WORKSPACE_LABEL: Record<Workspace, string> = {
  assets: 'Assets',
  grievances: 'Grievances',
  maintenance: 'Maintenance',
  reviews: 'Administrative Reviews',
  tasks: 'Employee Tasks',
}

/** What an account is given access to: every workspace, and Employees, which serves all of them. */
export const SECTIONS = [...WORKSPACES, 'employees'] as const
export type Section = (typeof SECTIONS)[number]
export const SECTION_LABEL: Record<Section, string> = { ...WORKSPACE_LABEL, employees: 'Employees' }

/** Each level includes the ones before it. Full is what a Super Admin can do, within that section. */
export const ACCESS_LEVELS = ['none', 'read', 'assign', 'edit', 'full'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]
export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  none: 'None',
  read: 'Read Only',
  assign: 'Assign',
  edit: 'Edit',
  full: 'Full',
}
/** The four levels every section has. Assign sits between Read and Edit, and only Tasks offers it. */
export const SHARED_LEVELS = ['none', 'read', 'edit', 'full'] as const satisfies readonly AccessLevel[]
export const levelsFor = (section: Section): readonly AccessLevel[] =>
  section === 'tasks' ? ACCESS_LEVELS : SHARED_LEVELS
/** An account's level in each section. A section that is not named is None, so a section added later starts closed. */
export type Access = Partial<Record<Section, Exclude<AccessLevel, 'none'>>>

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'issue', 'return', 'import', 'lock', 'sign_in'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
/** An action as the Audit Log shows it: "sign in" for sign_in. */
export const auditActionLabel = (action: AuditAction) => action.replaceAll('_', ' ')

/** What the Grievance Audit Log records. It is a log of its own: nothing here is written to the Audit Log, and nothing there is written here. */
export const GRIEVANCE_AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'status',
  'owner',
  'void',
  'entry',
  'attach',
  'withdraw',
  'download',
  'export',
] as const
export type GrievanceAuditAction = (typeof GRIEVANCE_AUDIT_ACTIONS)[number]

export const CONDITION_KINDS = ['intake', 'issue', 'return'] as const
export type ConditionKind = (typeof CONDITION_KINDS)[number]

export const ASSET_STATUSES = ['in_service', 'retired'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/** A digital asset is in service or set aside by hand. Whether it is issued is read from its assignments. */
export const DIGITAL_ASSET_STATUSES = ['in_service', 'inactive'] as const
export type DigitalAssetStatus = (typeof DIGITAL_ASSET_STATUSES)[number]

/** A condition rating's score runs from 1 to 100; 100 is as good as new. */
export const RATING_SCORE_MIN = 1
export const RATING_SCORE_MAX = 100
/** Ratings scoring below this need attention: they are red, and their assets are on the dashboard's condition watch. */
export const RATING_ATTENTION_BELOW = 50
/** The rating offered by default is the one whose score is closest to this ("Good" on the starting scale). */
export const RATING_DEFAULT_SCORE = 80

export type RatingBand = 'new' | 'good' | 'worn' | 'attention'

/** The band a score falls in. The bands are fixed so that red always means "on the condition watch". */
export function ratingBand(score: number): RatingBand {
  if (score >= 90) return 'new'
  if (score >= 70) return 'good'
  if (score >= RATING_ATTENTION_BELOW) return 'worn'
  return 'attention'
}

/** The rating to start a form on: the one closest to RATING_DEFAULT_SCORE, the better of two that are equally close. */
export function defaultRating<T extends { score: number }>(ratings: readonly T[]): T | undefined {
  const distance = (rating: T) => Math.abs(rating.score - RATING_DEFAULT_SCORE)
  return ratings.reduce<T | undefined>(
    (best, rating) =>
      !best || distance(rating) < distance(best) || (distance(rating) === distance(best) && rating.score > best.score)
        ? rating
        : best,
    undefined,
  )
}

/** Wrong passwords in a row before an account locks. */
export const LOCK_THRESHOLD = 5
/** Minutes an account stays locked. */
export const LOCK_MINUTES = 15
/** Idle days before a session signed in with "Keep me signed in" ends. */
export const REMEMBER_DAYS = 30
/** Assets out longer than this are flagged as overdue in the UI. */
export const OVERDUE_DAYS = 365

export const GRIEVANCE_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'voided'] as const
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number]
const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  voided: 'Voided',
}
export const grievanceStatusLabel = (status: GrievanceStatus) => GRIEVANCE_STATUS_LABELS[status]
/** How much of a grievance's text the list carries. The text in full is on the grievance's own page. */
export const GRIEVANCE_PREVIEW_LENGTH = 300

/** How a person is named on a grievance: as an employee involved, or as management involved. */
export const GRIEVANCE_PERSON_ROLES = ['employee', 'management'] as const
export type GrievancePersonRole = (typeof GRIEVANCE_PERSON_ROLES)[number]

/** What a timeline entry is. `system` entries are written by the app itself, never by a form. */
export const GRIEVANCE_ENTRY_KINDS = ['action', 'event', 'correction', 'system'] as const
export type GrievanceEntryKind = (typeof GRIEVANCE_ENTRY_KINDS)[number]
const GRIEVANCE_ENTRY_KIND_LABELS: Record<GrievanceEntryKind, string> = {
  action: 'Action',
  event: 'Event',
  correction: 'Correction',
  system: 'Automatic',
}
export const grievanceEntryKindLabel = (kind: GrievanceEntryKind) => GRIEVANCE_ENTRY_KIND_LABELS[kind]
/** An entry's number within its grievance, as in E01. */
export const grievanceEntryCode = (seq: number) => `E${String(seq).padStart(2, '0')}`

/** Files on a grievance (G10): at most this large each, and at most this many in one request. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENTS_PER_REQUEST = 10
/** The files that can be attached, by extension, and the type each is served as. The server checks the content as well. */
export const ATTACHMENT_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  eml: 'message/rfc822',
} as const
export type AttachmentExtension = keyof typeof ATTACHMENT_TYPES
/** A file name's extension, lower-cased; empty when it has none. */
export const fileExtension = (name: string) =>
  name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''

/** A grievance's ID: the year it was entered and its number within that year, as in GR-2026-0001. */
export const grievanceCode = (year: number, seq: number) => `GR-${year}-${String(seq).padStart(4, '0')}`

/** The Review Audit Log's actions. Review code writes there and never to the Audit Log or the Grievance Audit Log. */
export const REVIEW_AUDIT_ACTIONS = [
  'create',
  'update',
  'status',
  'void',
  'entry',
  'attach',
  'withdraw',
  'download',
  'export',
] as const
export type ReviewAuditAction = (typeof REVIEW_AUDIT_ACTIONS)[number]

export const REVIEW_STATUSES = ['open', 'in_progress', 'completed', 'voided'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  voided: 'Voided',
}
export const reviewStatusLabel = (status: ReviewStatus) => REVIEW_STATUS_LABELS[status]

/** What keeps an employee from being archived on the review side: "the reviewer on 1 open review and responsible for 2 open CAPs". */
export function openReviewWork(reviewing: number, caps: number) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  return [
    reviewing && `the reviewer on ${count(reviewing, 'open review')}`,
    caps && `responsible for ${count(caps, 'open CAP')}`,
  ]
    .filter(Boolean)
    .join(' and ')
}

/** Where a Corrective Action Plan stands. */
export const REVIEW_CAP_STATUSES = ['not_started', 'in_progress', 'completed', 'cancelled'] as const
export type ReviewCapStatus = (typeof REVIEW_CAP_STATUSES)[number]
const REVIEW_CAP_STATUS_LABELS: Record<ReviewCapStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
export const reviewCapStatusLabel = (status: ReviewCapStatus) => REVIEW_CAP_STATUS_LABELS[status]

/** What an entry on a review's history is. `system` entries are written by the app itself, never by a form. */
export const REVIEW_ENTRY_KINDS = ['update', 'correction', 'system'] as const
export type ReviewEntryKind = (typeof REVIEW_ENTRY_KINDS)[number]
const REVIEW_ENTRY_KIND_LABELS: Record<ReviewEntryKind, string> = {
  update: 'Update',
  correction: 'Correction',
  system: 'Automatic',
}
export const reviewEntryKindLabel = (kind: ReviewEntryKind) => REVIEW_ENTRY_KIND_LABELS[kind]

/** A review's ID: the year it was entered and its number within that year, as in AR-2026-0001. */
export const reviewCode = (year: number, seq: number) => `AR-${year}-${String(seq).padStart(4, '0')}`
/** A CAP's number within its review, as in CAP01. */
export const reviewCapCode = (seq: number) => `CAP${String(seq).padStart(2, '0')}`
/** A CAP's number from its address, CAP01 or a bare 1, or null when the text names no CAP. */
export const reviewCapSeq = (text: string) => {
  const match = /^(?:cap)?0*([1-9]\d*)$/i.exec(text.trim())
  return match ? Number(match[1]) : null
}
/** A review's entries are numbered as a grievance's are: E01, E02. */
export const reviewEntryCode = grievanceEntryCode

/** A maintenance request is Not Started until someone is dispatched to it. */
export const MAINTENANCE_STATUSES = ['not_started', 'dispatched', 'on_hold', 'rejected', 'finished'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]
/** The statuses on the Open tab: everything still to be done. */
export const MAINTENANCE_OPEN: readonly MaintenanceStatus[] = ['not_started', 'dispatched', 'on_hold']
const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  not_started: 'Not Started',
  dispatched: 'Dispatched',
  on_hold: 'On Hold',
  rejected: 'Rejected',
  finished: 'Finished',
}
export const maintenanceStatusLabel = (status: MaintenanceStatus) => MAINTENANCE_STATUS_LABELS[status]
/** A maintenance request's ID, from its row id, as in MR-0042. */
export const maintenanceCode = (id: number) => `MR-${String(id).padStart(4, '0')}`
/** The longest note on a request's timeline. */
export const MAINTENANCE_NOTE_MAX = 5000
/** The longest description a request keeps: far more than the form produces. */
export const MAINTENANCE_DESCRIPTION_MAX = 50_000

/**
 * What a notification can be about. Nothing is ever sent about Grievances or Administrative Reviews: a notification would leak
 * that a case exists.
 */
export const NOTIFICATION_KIND_LABEL = {
  asset_issued: 'Asset issued',
  digital_issued: 'Digital asset issued',
  asset_returned_poor: 'Poor-condition return',
  maintenance_dispatched: 'Maintenance dispatched',
  maintenance_changed: 'Maintenance update',
  asset_overdue: 'Overdue asset',
  account_password_reset: 'Password reset',
  account_access_changed: 'Access change',
  account_unlocked: 'Account unlocked',
  account_employee_linked: 'Linked employee change',
  notice: 'Notice',
  task_assigned: 'Task assigned',
  task_updated: 'Task updated',
  task_completed: 'Task completed',
  task_approval_requested: 'Task awaiting approval',
  task_approved: 'Task approved',
  task_sent_back: 'Task sent back',
  task_past_due: 'Task past due',
  task_cancelled: 'Task cancelled',
} as const
export type NotificationKind = keyof typeof NOTIFICATION_KIND_LABEL

/** The Inbox's views. */
export const NOTIFICATION_VIEWS = ['unread', 'all', 'archived'] as const
export type NotificationView = (typeof NOTIFICATION_VIEWS)[number]

/** A notice is plain text with line breaks: short enough to read in the bell's popover. */
export const NOTICE_TITLE_MAX = 120
export const NOTICE_BODY_MAX = 2000

/** A link that stays in the app: one leading slash, never two and never a backslash, which browsers read as another host. */
export const isInAppPath = (value: string) => /^\/(?![/\\])/.test(value)

// ---- Tasks ------------------------------------------------------------------------------

/** A task's status is never stored: `taskStatus()` in shared/tasks.ts works it out from the task's timestamps. */
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
