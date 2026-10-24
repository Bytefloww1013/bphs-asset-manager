import type { AuditEntry } from '#foundation/audit/shared/index.ts'
import type { RecordAttachment, RecordEntry, RecordPerson } from '#shared/types.ts'
import type { ReviewAuditAction, ReviewCapStatus, ReviewEntryKind, ReviewStatus } from './constants.ts'

/** Someone named on a review. They stay named after they are archived. */
export type ReviewPerson = RecordPerson

export interface ReviewDetail {
  id: number
  /** AR-2026-0001 */
  code: string
  title: string
  summary: string
  /** Plain text, several lines. */
  findings: string
  /** Sanitised by the server; the only form of the Review body a page may display. Empty when none was written. */
  bodyHtml: string
  /** `YYYY-MM-DD` */
  reviewDate: string
  status: ReviewStatus
  employee: ReviewPerson
  reviewer: ReviewPerson
  version: number
  /** The account that entered it, by name, or null once that account is gone. */
  recordedBy: string | null
  createdAt: string
  lastActivityAt: string
  completedAt: string | null
}

/** One entry on a review's history, in the shape every record's entry takes. Nothing here can be changed once it is written. */
export type ReviewEntry = Omit<RecordEntry, 'kind'> & {
  kind: ReviewEntryKind
  /** The number of the CAP the entry is about, or null when it is about the review itself. */
  cap: number | null
}

/** A file on a review: a record file's fields, with the CAP it belongs to. `entrySeq` is the automatic entry that recorded it. */
export interface ReviewAttachment extends RecordAttachment {
  entrySeq: number
  /** The number of the CAP it belongs to, or null for a file on the review itself. */
  cap: number | null
}

/** A Corrective Action Plan on a review, as it is now. What it said before each change is on the review's history. */
export interface ReviewCap {
  id: number
  /** Shown as CAP01. */
  seq: number
  title: string
  shortDescription: string
  /** The Details, sanitised by the server. Empty when none were written. */
  bodyHtml: string
  responsible: ReviewPerson
  /** `YYYY-MM-DD`, or null when none was set. */
  dueDate: string | null
  status: ReviewCapStatus
  version: number
  /** The account that added it, by name, or null once that account is gone. */
  addedBy: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  /** Who marked it Completed, by name as it was then. */
  completedBy: string | null
}

/** A CAP as the Action items list shows it, with the review it is on. */
export interface ReviewActionItem extends Pick<
  ReviewCap,
  'id' | 'seq' | 'title' | 'shortDescription' | 'responsible' | 'dueDate' | 'status' | 'completedAt'
> {
  review: { code: string; title: string }
}

/** A review as the list shows it. */
export interface ReviewRow {
  id: number
  code: string
  title: string
  summary: string
  reviewDate: string
  status: ReviewStatus
  employee: ReviewPerson
  reviewer: ReviewPerson
  /** Completed CAPs, out of every CAP that was not cancelled. */
  caps: { done: number; total: number }
  /** The earliest due date of a CAP still to be done, or null. */
  nextDue: string | null
  lastActivityAt: string
}

export interface ReviewList {
  rows: ReviewRow[]
  /** How many reviews match the other filters in each status, and in all of them, whichever status was asked for. */
  counts: Record<ReviewStatus | 'all', number>
  /** Everyone who reviewed, and everyone reviewed, on a review the account can see, in name order: what the filters offer. */
  reviewers: ReviewPerson[]
  employees: ReviewPerson[]
}

export interface ReviewAuditEntry extends Omit<AuditEntry, 'action'> {
  action: ReviewAuditAction
  /** The review the entry describes, by its ID, and the CAP when it is about one or a file on one. Null for an export of Action items. */
  code: string | null
  cap: number | null
}

export interface ReviewAuditPage {
  total: number
  entries: ReviewAuditEntry[]
}
