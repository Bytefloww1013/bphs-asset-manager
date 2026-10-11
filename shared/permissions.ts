import type { Role } from './constants.ts'

export type Permission =
  | 'record.write' // add/change assets, employees, assignments, lists
  | 'record.delete' // hard-delete a record that has no history
  | 'employee.archive'
  | 'users.manage'

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: ['record.write'],
  super_admin: ['record.write', 'record.delete', 'employee.archive', 'users.manage'],
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return role ? MATRIX[role].includes(permission) : false
}

export const SUPER_ADMIN_ONLY = 'Only a Super Admin can do this.'
