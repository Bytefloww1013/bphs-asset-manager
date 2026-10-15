export const ROLES = ['admin', 'super_admin'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
}

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
/** The files a grievance takes, by extension, and the type each is served as. The server checks the content as well. */
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
