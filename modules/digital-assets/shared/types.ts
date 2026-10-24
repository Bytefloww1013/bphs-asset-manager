import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import type { AssetTypeRef, Lookups, NamedListRow } from '#modules/assets/shared/index.ts'
import type { DigitalAssetStatus } from './constants.ts'

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

// ---- Lists ------------------------------------------------------------------
/** A digital asset type, with how many digital assets use it. */
export type DigitalAssetTypeRow = NamedListRow

/** `/api/lookups` with the active digital asset types this module adds to it (the `lookups` hook). */
export interface DigitalLookups extends Lookups {
  digitalAssetTypes: AssetTypeRef[]
}
