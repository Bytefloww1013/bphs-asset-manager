import type { Grantee } from '../../shared/permissions.ts'

/** Who is doing something. Their email is what the audit log records: it is unique, and the part before the @ is not. */
export interface Actor extends Grantee {
  id: number
  email: string
  name: string
  employeeId: number | null
}
