export interface EmployeeRef {
  id: number
  code: string
  name: string
  department: string | null
}

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
  /** Open or In progress reviews they conduct, and CAPs still to be done that they are responsible for, on reviews this account may see. Each keeps them from being archived. */
  openReviewsReviewing: number
  openCapsResponsible: number
  hasHistory: boolean
  /** Why this employee cannot be deleted, as a sentence, or null when they can be. */
  deleteBlocked: string | null
  createdAt: string
}
