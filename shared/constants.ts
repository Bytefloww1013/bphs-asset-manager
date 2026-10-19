/** The app is separate workspaces behind one sign-in. A person is in one at a time, never looking at a mix. */
export const WORKSPACES = ['assets', 'grievances', 'maintenance', 'reviews'] as const
export type Workspace = (typeof WORKSPACES)[number]
export const WORKSPACE_LABEL: Record<Workspace, string> = { assets: 'Assets', grievances: 'Grievances', maintenance: 'Maintenance', reviews: 'Administrative Reviews' }

/** What an account is given access to: every workspace, and Employees, which serves all of them. */
export const SECTIONS = [...WORKSPACES, 'employees'] as const
export type Section = (typeof SECTIONS)[number]
export const SECTION_LABEL: Record<Section, string> = { ...WORKSPACE_LABEL, employees: 'Employees' }

/** Each level includes the ones before it. Full is what a Super Admin can do, within that section. */
export const ACCESS_LEVELS = ['none', 'read', 'edit', 'full'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]
export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = { none: 'None', read: 'Read Only', edit: 'Edit', full: 'Full' }
/** An account's level in each section. A section that is not named is None, so a section added later starts closed. */
export type Access = Partial<Record<Section, Exclude<AccessLevel, 'none'>>>

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'issue', 'return', 'import', 'lock', 'sign_in'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
/** An action as the Audit Log shows it: "sign in" for sign_in. */
export const auditActionLabel = (action: AuditAction) => action.replaceAll('_', ' ')

/** What the Grievance Audit Log records. It is a log of its own: nothing here is written to the Audit Log, and nothing there is written here. */
export const GRIEVANCE_AUDIT_ACTIONS = ['create', 'update', 'delete', 'status', 'owner', 'void', 'entry', 'attach', 'withdraw', 'download', 'export'] as const
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
    (best, rating) => (!best || distance(rating) < distance(best) || (distance(rating) === distance(best) && rating.score > best.score) ? rating : best),
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
const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', voided: 'Voided' }
export const grievanceStatusLabel = (status: GrievanceStatus) => GRIEVANCE_STATUS_LABELS[status]
/** How much of a grievance's text the list carries. The text in full is on the grievance's own page. */
export const GRIEVANCE_PREVIEW_LENGTH = 300

/** How a person is named on a grievance: as an employee involved, or as management involved. */
export const GRIEVANCE_PERSON_ROLES = ['employee', 'management'] as const
export type GrievancePersonRole = (typeof GRIEVANCE_PERSON_ROLES)[number]

/** What a timeline entry is. `system` entries are written by the app itself, never by a form. */
export const GRIEVANCE_ENTRY_KINDS = ['action', 'event', 'correction', 'system'] as const
export type GrievanceEntryKind = (typeof GRIEVANCE_ENTRY_KINDS)[number]
const GRIEVANCE_ENTRY_KIND_LABELS: Record<GrievanceEntryKind, string> = { action: 'Action', event: 'Event', correction: 'Correction', system: 'Automatic' }
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
export const fileExtension = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

/** A grievance's ID: the year it was entered and its number within that year, as in GR-2026-0001. */
export const grievanceCode = (year: number, seq: number) => `GR-${year}-${String(seq).padStart(4, '0')}`

/** The Review Audit Log's actions. Review code writes there and never to the Audit Log or the Grievance Audit Log. */
export const REVIEW_AUDIT_ACTIONS = ['create', 'update', 'status', 'void', 'entry', 'attach', 'withdraw', 'download', 'export'] as const
export type ReviewAuditAction = (typeof REVIEW_AUDIT_ACTIONS)[number]

export const REVIEW_STATUSES = ['open', 'in_progress', 'completed', 'voided'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { open: 'Open', in_progress: 'In progress', completed: 'Completed', voided: 'Voided' }
export const reviewStatusLabel = (status: ReviewStatus) => REVIEW_STATUS_LABELS[status]

/** What keeps an employee from being archived on the review side: "the reviewer on 1 open review and responsible for 2 open CAPs". */
export function openReviewWork(reviewing: number, caps: number) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  return [reviewing && `the reviewer on ${count(reviewing, 'open review')}`, caps && `responsible for ${count(caps, 'open CAP')}`].filter(Boolean).join(' and ')
}

/** Where a Corrective Action Plan stands. */
export const REVIEW_CAP_STATUSES = ['not_started', 'in_progress', 'completed', 'cancelled'] as const
export type ReviewCapStatus = (typeof REVIEW_CAP_STATUSES)[number]
const REVIEW_CAP_STATUS_LABELS: Record<ReviewCapStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }
export const reviewCapStatusLabel = (status: ReviewCapStatus) => REVIEW_CAP_STATUS_LABELS[status]

/** What an entry on a review's history is. `system` entries are written by the app itself, never by a form. */
export const REVIEW_ENTRY_KINDS = ['update', 'correction', 'system'] as const
export type ReviewEntryKind = (typeof REVIEW_ENTRY_KINDS)[number]
const REVIEW_ENTRY_KIND_LABELS: Record<ReviewEntryKind, string> = { update: 'Update', correction: 'Correction', system: 'Automatic' }
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
 * that a case exists. Account and security events and notices are `unmutable`.
 */
export const NOTIFICATION_KINDS = {
  asset_issued: { label: 'Assets issued to you', unmutable: false },
  digital_issued: { label: 'Digital assets issued to you', unmutable: false },
  asset_returned_poor: { label: 'Assets returned in poor condition', unmutable: false },
  maintenance_dispatched: { label: 'Maintenance requests dispatched to you', unmutable: false },
  maintenance_changed: { label: 'Changes to your maintenance requests', unmutable: false },
  asset_overdue: { label: 'Overdue assets', unmutable: false },
  account_password_reset: { label: 'Password resets', unmutable: true },
  account_access_changed: { label: 'Access changes', unmutable: true },
  account_unlocked: { label: 'Account unlocks', unmutable: true },
  account_employee_linked: { label: 'Linked employee changes', unmutable: true },
  notice: { label: 'Notices', unmutable: true },
} as const satisfies Record<string, { label: string; unmutable: boolean }>
export type NotificationKind = keyof typeof NOTIFICATION_KINDS
export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as [NotificationKind, ...NotificationKind[]]

export const MUTE_DURATIONS = ['24h', '7d', '1m', 'forever'] as const
export type MuteDuration = (typeof MUTE_DURATIONS)[number]
export const MUTE_DURATION_LABEL: Record<MuteDuration, string> = { '24h': '24 hours', '7d': '7 days', '1m': '1 month', forever: 'Until I change it' }

/** When a mute started at `now` ends; null for one that lasts until the person changes it. A month from Jan 31 ends on the last day of February. */
export function muteEnds(duration: MuteDuration, now: Date): Date | null {
  if (duration === 'forever') return null
  const end = new Date(now)
  if (duration === '24h') end.setUTCDate(end.getUTCDate() + 1)
  if (duration === '7d') end.setUTCDate(end.getUTCDate() + 7)
  if (duration === '1m') {
    end.setUTCMonth(end.getUTCMonth() + 1)
    if (end.getUTCDate() !== now.getUTCDate()) end.setUTCDate(0)
  }
  return end
}

/** A link that stays in the app: one leading slash, never two and never a backslash, which browsers read as another host. */
export const isInAppPath = (value: string) => /^\/(?![/\\])/.test(value)
