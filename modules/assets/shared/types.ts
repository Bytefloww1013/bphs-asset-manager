import type { AuditEntry } from '#foundation/audit/shared/index.ts'
import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import type { ProgramRef } from '#foundation/programs/shared/index.ts'
import type { AssetStatus, ConditionKind } from './constants.ts'

// ---- Reference data -----------------------------------------------------
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
  /** Active brands only: "Unknown" and other archived brands are never offered. */
  assetBrands: AssetTypeRef[]
  conditionRatings: ConditionRatingRef[]
  employees: EmployeeRef[]
  /** Active programs only. */
  programs: ProgramRef[]
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
  brandId: number
  brand: string
  /** False when the brand is archived, like "Unknown": an edit has to pick an active one. */
  brandActive: boolean
  model: string | null
  /** The device's Microsoft Entra object ID, a lowercase UUID. */
  entraObjectId: string | null
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

// ---- Assignments ----------------------------------------------------------
export interface AssignmentRow {
  id: number
  assetId: number
  assetTag: string
  assetType: string
  assetBrand: string
  assetModel: string | null
  assetEntraObjectId: string | null
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

// ---- Lists ------------------------------------------------------------------------
/** A list of names that assets are filed under, with how many use each and whether it is still offered. */
export interface NamedListRow {
  id: number
  name: string
  isActive: boolean
  assetCount: number
}

/** An asset type, with how many physical assets use it. */
export type AssetTypeRow = NamedListRow

/** An asset brand, with how many physical assets use it. */
export type AssetBrandRow = AssetTypeRow

export interface ConditionRatingRow {
  id: number
  name: string
  score: number
  isActive: boolean
  snapshotCount: number
}

// ---- Dashboard --------------------------------------------------------------
export interface DashboardData {
  totals: { total: number; assigned: number; inStorage: number; retired: number }
  byType: { typeId: number; type: string; total: number; free: number }[]
  overdueCount: number
  longestOut: {
    assignmentId: number
    assetTag: string
    assetType: string
    assetBrand: string
    assetModel: string | null
    employee: EmployeeRef | null
    program: ProgramRef | null
    daysOut: number
  }[]
  topHolders: { employee: EmployeeRef; count: number }[]
  poorCondition: {
    assetId: number
    assetTag: string
    assetType: string
    assetBrand: string
    assetModel: string | null
    rating: string
    holder: string | null
  }[]
  recent: AuditEntry[]
}
