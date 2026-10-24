import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import type { MaintenanceStatus } from './constants.ts'

/** A maintenance request as the list shows it. What came from Zoho is plain text, kept as Zoho sent it. */
export interface MaintenanceRow {
  id: number
  /** MR-0042 */
  code: string
  firstName: string
  lastName: string | null
  /** First and last name together. */
  requestedBy: string
  /** Empty when none was given. */
  email: string
  program: string
  location: string
  description: string
  /** "No", "Yes", or the text typed for Zoho's "Other"; null when none was given. */
  urgent: string | null
  status: MaintenanceStatus
  assignee: EmployeeRef | null
  receivedAt: string
  /** When the timeline last had a line added. */
  lastActivityAt: string
}

export interface MaintenanceDetail extends MaintenanceRow {
  /** The form's Date and Date Noticed, as Zoho wrote them; `YYYY-MM-DD` for a request entered by hand. */
  requestDate: string | null
  noticedDate: string | null
  /** Zoho's Added Time, as Zoho wrote it; null for a request entered by hand. */
  zohoAddedTime: string | null
  /** The timeline, oldest first. */
  notes: MaintenanceNote[]
}

/** A line on a request's timeline: a note someone wrote, or one the app wrote when the request changed. */
export interface MaintenanceNote {
  id: number
  kind: 'note' | 'system'
  body: string
  /** The writer's name as it was at the time, or "Zoho Forms". */
  createdBy: string
  createdAt: string
}
