import type { Role } from './constants.ts'

export type Permission =
  | 'record.write' // add/change assets, employees, assignments, lists
  | 'record.delete' // hard-delete a record that has no history
  | 'employee.archive'
  | 'users.manage'
  | 'grievance.void' // void a grievance, withdraw an attachment

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: ['record.write'],
  super_admin: ['record.write', 'record.delete', 'employee.archive', 'users.manage', 'grievance.void'],
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return role ? MATRIX[role].includes(permission) : false
}

export const SUPER_ADMIN_ONLY = 'Only a Super Admin can do this.'

/**
 * Whether this account may edit a grievance, change its status or hand it to another owner: a Super Admin, or the account
 * linked to the employee named as its owner. An owner with no linked account leaves it to Super Admins.
 */
export function canManageGrievance(user: { role: Role; employeeId: number | null } | undefined | null, ownerEmployeeId: number | null): boolean {
  if (!user) return false
  return user.role === 'super_admin' || (user.employeeId !== null && user.employeeId === ownerEmployeeId)
}
