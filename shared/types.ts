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

// ---- Import -------------------------------------------------------------------
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

// ---- Records ----------------------------------------------------------------
// What the kernel's record pages (a grievance's, a review's) show of any record. Each module names its own entry kinds.

/** Someone named on a record. They stay named after they are archived. */
export interface RecordPerson {
  id: number
  code: string
  name: string
  archived: boolean
}

/** One entry on a record's timeline. Nothing here can be changed once it is written. */
export interface RecordEntry {
  id: number
  /** Its number within the record: 1 is E01. */
  seq: number
  kind: string
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

/** A file on a record. Its bytes are fetched on their own. */
export interface RecordAttachment {
  id: number
  filename: string
  contentType: string
  size: number
  /** SHA-256 of the bytes as stored, in hex, so a copy can be shown to be the same file. */
  sha256: string
  /** The entry it came with; null for a file added with the record itself. */
  entrySeq: number | null
  uploadedBy: string
  uploadedAt: string
  /** Set when a Super Admin took it back as added by mistake: it can no longer be downloaded. */
  withdrawnAt: string | null
  withdrawnReason: string | null
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

// ---- Errors -------------------------------------------------------------------
export interface ApiErrorBody {
  error: string
  message: string
  details?: unknown
}
