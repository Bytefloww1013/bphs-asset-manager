import type { AuditEntry } from '#foundation/audit/shared/index.ts'
import type { RecordAttachment, RecordEntry, RecordPerson } from '#shared/types.ts'
import type { GrievanceAuditAction, GrievanceEntryKind, GrievancePersonRole, GrievanceStatus } from './constants.ts'

/** A grievance category, with how many grievances are filed under it. */
export interface GrievanceCategoryRow {
  id: number
  name: string
  isActive: boolean
  grievanceCount: number
}

/** Someone named on a grievance. They stay named after they are archived. */
export type GrievancePerson = RecordPerson

/** Someone named on an earlier version of a grievance, as they were called then. */
export interface GrievanceVersionPerson {
  role: GrievancePersonRole
  code: string
  name: string
}

/** A grievance as it stood before an edit replaced it. */
export interface GrievanceVersion {
  /** 1 for the grievance as first recorded. */
  version: number
  title: string
  shortDescription: string
  bodyHtml: string
  dateMade: string
  category: string
  employees: { code: string; name: string }[]
  management: { code: string; name: string }[]
  /** Who replaced this version, when, and the reason they gave. */
  changedBy: string
  changedAt: string
  reason: string
}

/** A grievance as the list shows it. The body is not here, only the start of its text. */
export interface GrievanceRow {
  id: number
  code: string
  title: string
  shortDescription: string
  /** The start of the body as plain text, ending in an ellipsis when there is more. */
  preview: string
  dateMade: string
  status: GrievanceStatus
  category: { id: number; name: string }
  owner: GrievancePerson
  employees: GrievancePerson[]
  management: GrievancePerson[]
  lastActivityAt: string
}

export interface GrievanceList {
  rows: GrievanceRow[]
  /** How many grievances match the other filters in each status, and in all of them, whichever status was asked for. */
  counts: Record<GrievanceStatus | 'all', number>
  /** Everyone who owns a grievance, whatever the filters, in name order: what the owner filter offers. */
  owners: GrievancePerson[]
}

/** One grievance in full. */
export interface GrievanceDetail {
  id: number
  /** GR-2026-0001 */
  code: string
  title: string
  shortDescription: string
  /** Sanitised by the server; the only form of the body a page may display. */
  bodyHtml: string
  /** `YYYY-MM-DD` */
  dateMade: string
  status: GrievanceStatus
  category: { id: number; name: string }
  owner: GrievancePerson
  /** Whether an account that can sign in is linked to the owner. Without one, only a Super Admin can change the grievance. */
  ownerHasAccount: boolean
  employees: GrievancePerson[]
  management: GrievancePerson[]
  version: number
  /** The account that entered it, by name, or null once that account is gone. */
  recordedBy: string | null
  createdAt: string
  lastActivityAt: string
}

/** One entry on a grievance's timeline. Nothing here can be changed once it is written. */
export interface GrievanceEntry extends RecordEntry {
  kind: GrievanceEntryKind
}

/** A file on a grievance. Its bytes are fetched on their own. */
export type GrievanceAttachment = RecordAttachment

export interface GrievanceAuditEntry extends Omit<AuditEntry, 'action'> {
  action: GrievanceAuditAction
  /** The grievance the entry describes, by its ID, and the timeline entry when it is about one. Null for a category. */
  code: string | null
  seq: number | null
}

export interface GrievanceAuditPage {
  total: number
  entries: GrievanceAuditEntry[]
}
