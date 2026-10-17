import type { AssetStatus, AuditAction, ConditionKind, DigitalAssetStatus, GrievanceAuditAction, GrievanceEntryKind, GrievancePersonRole, GrievanceStatus, MaintenanceStatus, ReviewCapStatus, ReviewEntryKind, ReviewStatus } from './constants.ts'
import type { Grantee } from './permissions.ts'

// ---- Auth ---------------------------------------------------------------
export interface SessionUser extends Grantee {
  id: number
  name: string
  email: string
  mustChangePassword: boolean
  /** Employee record this user is linked to; used to prefill "Assessed by". */
  employeeId: number | null
  firstAccount: boolean
}

// ---- Reference data -----------------------------------------------------
export interface EmployeeRef {
  id: number
  code: string
  name: string
  department: string | null
}

export interface ProgramRef {
  id: number
  /** The Program ID. */
  code: string
  name: string
}

export interface AssetTypeRef {
  id: number
  name: string
}

export interface ConditionRatingRef {
  id: number
  name: string
  /** 1 to 100, best first. Drives the order, the colour and the default; shown only on the Lists screen. */
  score: number
}

export interface Lookups {
  assetTypes: AssetTypeRef[]
  conditionRatings: ConditionRatingRef[]
  employees: EmployeeRef[]
  /** Active programs only. */
  programs: ProgramRef[]
  digitalAssetTypes: AssetTypeRef[]
}

// ---- Assets -------------------------------------------------------------
export type AssetState = 'assigned' | 'in_storage' | 'retired'

export interface ConditionSummary {
  ratingId: number
  rating: string
  notes: string | null
  recordedAt: string
}

export interface AssetRow {
  id: number
  tag: string
  typeId: number
  type: string
  serial: string | null
  status: AssetStatus
  state: AssetState
  /** The employee holding it. An assigned asset has this or `program`, never both. */
  holder: EmployeeRef | null
  /** The program holding it. */
  program: ProgramRef | null
  assignmentId: number | null
  condition: ConditionSummary | null
  issuedAt: string | null
  daysOut: number | null
  lastReturnedAt: string | null
  createdAt: string
  /** True once the asset has ever been assigned. */
  hasHistory: boolean
}

export interface ConditionEntry {
  id: number
  kind: ConditionKind
  rating: string
  notes: string | null
  assessedBy: string | null
  recordedBy: string
  recordedAt: string
  assignmentId: number | null
}

export interface HistoryRow {
  id: number
  /** Who held it: an employee or a program, one of the two. */
  employee: EmployeeRef | null
  program: ProgramRef | null
  issuedAt: string
  returnedAt: string | null
  issueRating: string | null
  returnRating: string | null
  issuedBy: string
  returnedBy: string | null
  daysHeld: number
}

export interface AssetDetail {
  asset: AssetRow
  history: HistoryRow[]
  conditions: ConditionEntry[]
}

export interface AssetBulkResult {
  created: number
  errors: { row: number; message: string }[]
}

// ---- Digital assets -------------------------------------------------------
/** Active: issued to someone. Not issued: free to issue. Inactive: set aside by hand, and not issuable until reactivated. */
export type DigitalAssetState = 'active' | 'not_issued' | 'inactive'

export interface DigitalAssetRow {
  id: number
  /** The Asset ID, DA-00001: generated, never typed and never reused. */
  code: string
  typeId: number
  type: string
  /** The License/Account. */
  account: string
  status: DigitalAssetStatus
  state: DigitalAssetState
  employee: EmployeeRef | null
  assignmentId: number | null
  issuedAt: string | null
  createdAt: string
  /** True once it has ever been issued. */
  hasHistory: boolean
}

export interface DigitalHistoryRow {
  id: number
  employee: EmployeeRef
  issuedAt: string
  returnedAt: string | null
  issuedBy: string
  returnedBy: string | null
}

export interface DigitalAssetDetail {
  asset: DigitalAssetRow
  history: DigitalHistoryRow[]
}

// ---- Assignments ----------------------------------------------------------
export interface AssignmentRow {
  id: number
  assetId: number
  assetTag: string
  assetType: string
  /** Who holds it: an employee or a program, one of the two. */
  employee: EmployeeRef | null
  program: ProgramRef | null
  issuedAt: string
  issueRating: string | null
  daysOut: number
  issuedBy: string
}

export interface ReturnBulkResult {
  returned: number[]
  failed: { id: number; message: string }[]
}

// ---- Employees ------------------------------------------------------------
export interface EmployeeRow {
  id: number
  code: string
  firstName: string
  lastName: string
  name: string
  department: string | null
  jobTitle: string | null
  state: 'active' | 'archived'
  assetsHeld: number
  /** Digital assets issued to them now. Like a physical asset, each one keeps them from being archived. */
  digitalHeld: number
  /** Grievances they own that are not Closed or Voided. Each one keeps them from being archived until it has another owner. */
  openGrievancesOwned: number
  hasHistory: boolean
  /** Why this employee cannot be deleted, as a sentence, or null when they can be. */
  deleteBlocked: string | null
  createdAt: string
}

export type ImportResult = 'new' | 'duplicate' | 'error'

/** One row of an import as the server judged it. `values` is keyed by the field keys of the record type's importer. */
export interface ImportRow {
  /** The row's number in the file, counting the header as row 1. */
  row: number
  values: Record<string, string>
  result: ImportResult
  message: string
}

export interface ImportPreview {
  rows: ImportRow[]
  summary: { read: number; create: number; duplicates: number; errors: number }
  /** Set once the import has been committed. */
  created?: number
}

// ---- Programs -------------------------------------------------------------
export interface ProgramRow {
  id: number
  code: string
  name: string
  address: string | null
  isActive: boolean
  assetsHeld: number
  hasHistory: boolean
  /** Why this program cannot be deleted, as a sentence, or null when it can be. */
  deleteBlocked: string | null
  createdAt: string
}

// ---- Lists ------------------------------------------------------------------
export interface AssetTypeRow {
  id: number
  name: string
  isActive: boolean
  assetCount: number
}

/** A digital asset type, with how many digital assets use it. */
export type DigitalAssetTypeRow = AssetTypeRow

/** A grievance category, with how many grievances are filed under it. */
export interface GrievanceCategoryRow {
  id: number
  name: string
  isActive: boolean
  grievanceCount: number
}

/** Someone named on a grievance. They stay named after they are archived. */
export interface GrievancePerson {
  id: number
  code: string
  name: string
  archived: boolean
}

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

/** One grievance in full. */
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
export interface GrievanceEntry {
  id: number
  /** Its number within the grievance: 1 is E01. */
  seq: number
  kind: GrievanceEntryKind
  /** When it happened, as given by whoever recorded it. */
  occurredAt: string
  /** When it was written down. */
  recordedAt: string
  title: string
  shortDescription: string
  /** Sanitised by the server; empty when the entry has no more to say than its short description. */
  bodyHtml: string
  /** The name of whoever recorded it, as it was at the time. */
  documentedBy: string
  /** On a correction, the number of the entry it corrects; otherwise null. */
  corrects: number | null
  /** The numbers of the corrections made to this entry, oldest first. */
  correctedBy: number[]
}

/** A file on a grievance. Its bytes are fetched on their own. */
export interface GrievanceAttachment {
  id: number
  filename: string
  contentType: string
  size: number
  /** SHA-256 of the bytes as stored, in hex, so a copy can be shown to be the same file. */
  sha256: string
  /** The entry it came with; null for a file added with the grievance itself. */
  entrySeq: number | null
  uploadedBy: string
  uploadedAt: string
  /** Set when a Super Admin took it back as added by mistake: it can no longer be downloaded. */
  withdrawnAt: string | null
  withdrawnReason: string | null
}

// ---- Administrative Reviews ---------------------------------------------
/** Someone named on a review. They stay named after they are archived. */
export type ReviewPerson = GrievancePerson

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

/** One entry on a review's history, in the shape a grievance's takes. Nothing here can be changed once it is written. */
export type ReviewEntry = Omit<GrievanceEntry, 'kind'> & {
  kind: ReviewEntryKind
  /** The number of the CAP the entry is about, or null when it is about the review itself. */
  cap: number | null
}

/** A file on a review: a grievance file's fields, with the CAP it belongs to. `entrySeq` is the automatic entry that recorded it. */
export interface ReviewAttachment extends GrievanceAttachment {
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
export interface ReviewActionItem extends Pick<ReviewCap, 'id' | 'seq' | 'title' | 'shortDescription' | 'responsible' | 'dueDate' | 'status' | 'completedAt'> {
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

export interface ConditionRatingRow {
  id: number
  name: string
  score: number
  isActive: boolean
  snapshotCount: number
}

// ---- Audit ------------------------------------------------------------------
export interface AuditEntry {
  id: number
  occurredAt: string
  actor: string
  action: AuditAction
  entityType: string
  entityId: number | null
  details: string
}

export interface AuditPage {
  total: number
  entries: AuditEntry[]
}

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

// ---- Users ------------------------------------------------------------------
export type UserState = 'active' | 'locked' | 'deactivated'

export interface UserRow extends Grantee {
  id: number
  name: string
  email: string
  employeeId: number | null
  mustChangePassword: boolean
  failedLogins: number
  lockedUntil: string | null
  lastLoginAt: string | null
  state: UserState
}

export interface UserWithPassword {
  user: UserRow
  /** Shown once. Never stored in clear text. */
  oneTimePassword: string
}

// ---- Dashboard --------------------------------------------------------------
export interface DashboardData {
  totals: { total: number; assigned: number; inStorage: number; retired: number }
  byType: { typeId: number; type: string; total: number; free: number }[]
  overdueCount: number
  longestOut: { assignmentId: number; assetTag: string; assetType: string; employee: EmployeeRef | null; program: ProgramRef | null; daysOut: number }[]
  topHolders: { employee: EmployeeRef; count: number }[]
  poorCondition: { assetId: number; assetTag: string; assetType: string; rating: string; holder: string | null }[]
  recent: AuditEntry[]
}

// ---- Errors -------------------------------------------------------------------
export interface ApiErrorBody {
  error: string
  message: string
  details?: unknown
}

// ---- Maintenance --------------------------------------------------------------
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
