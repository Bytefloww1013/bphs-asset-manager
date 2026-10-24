import { entryCode } from '#shared/constants.ts'

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
/** A review's entries are numbered as every record's are: E01, E02. */
export const reviewEntryCode = entryCode
