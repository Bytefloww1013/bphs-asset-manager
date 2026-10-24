export interface ProgramRef {
  id: number
  /** The Program ID. */
  code: string
  name: string
}

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
