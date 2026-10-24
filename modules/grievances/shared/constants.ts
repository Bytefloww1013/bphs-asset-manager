import { entryCode } from '#shared/constants.ts'

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
export const grievanceEntryCode = entryCode

/** A grievance's ID: the year it was entered and its number within that year, as in GR-2026-0001. */
export const grievanceCode = (year: number, seq: number) => `GR-${year}-${String(seq).padStart(4, '0')}`
