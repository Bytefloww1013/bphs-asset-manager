import type { AssetStatus, AuditAction, ConditionKind, DigitalAssetStatus, GrievanceEntryKind, GrievanceStatus, Role } from './constants.ts'

// ---- Auth ---------------------------------------------------------------
export interface SessionUser {
  id: number
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
  /** Employee record this user is linked to; used to prefill "Assessed by". */
  employeeId: number | null
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

// ---- Users ------------------------------------------------------------------
export type UserState = 'active' | 'locked' | 'deactivated'

export interface UserRow {
  id: number
  name: string
  email: string
  role: Role
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
