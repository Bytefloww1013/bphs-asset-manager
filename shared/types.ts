import type { AssetStatus, AuditAction, ConditionKind, DigitalAssetStatus, Role } from './constants.ts'

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

export interface ImportColumn {
  name: string
  required: boolean
  /** 1-based column position in the file, or null when the header is missing. */
  found: number | null
}

export interface ImportRow {
  row: number
  code: string
  firstName: string
  lastName: string
  department: string
  jobTitle: string
  result: 'new' | 'duplicate' | 'error'
  message: string
}

export interface ImportPreview {
  columns: ImportColumn[]
  rows: ImportRow[]
  summary: { read: number; create: number; duplicates: number; errors: number }
  /** Set when the header row is unusable (e.g. a required column is missing). */
  headerError: string | null
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
