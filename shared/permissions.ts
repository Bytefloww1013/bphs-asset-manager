import type { Role, Workspace } from './constants.ts'

export type Permission =
  | 'record.write' // add/change assets, employees, assignments, lists
  | 'record.delete' // hard-delete a record that has no history
  | 'employee.archive'
  | 'users.manage'
  | 'grievance.void' // void a grievance, withdraw an attachment

const MATRIX: Record<Role, readonly Permission[]> = {
  asset_admin: ['record.write'],
  grievance_admin: ['record.write'],
  admin: ['record.write'],
  super_admin: ['record.write', 'record.delete', 'employee.archive', 'users.manage', 'grievance.void'],
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return role ? MATRIX[role].includes(permission) : false
}

/** The workspaces each role works in. A role sees nothing of a workspace it is not in; Employees belongs to both. */
const WORKSPACE_ACCESS: Record<Role, readonly Workspace[]> = {
  asset_admin: ['assets'],
  grievance_admin: ['grievances'],
  admin: ['assets', 'grievances'],
  super_admin: ['assets', 'grievances', 'maintenance'],
}

export const workspacesOf = (role: Role): readonly Workspace[] => WORKSPACE_ACCESS[role]

export function canUseWorkspace(role: Role | undefined | null, workspace: Workspace): boolean {
  return role ? WORKSPACE_ACCESS[role].includes(workspace) : false
}

/** The roles that work in a workspace, for the server to filter accounts by. */
export const rolesIn = (workspace: Workspace) => (Object.keys(WORKSPACE_ACCESS) as Role[]).filter((role) => canUseWorkspace(role, workspace))

export const SUPER_ADMIN_ONLY = 'Only a Super Admin can do this.'

/**
 * Whether this account may edit a grievance, change its status or hand it to another owner: a Super Admin, or the account
 * linked to the employee named as its owner, if that account works in Grievances. An owner with no such account leaves it to Super Admins.
 */
export function canManageGrievance(user: { role: Role; employeeId: number | null } | undefined | null, ownerEmployeeId: number | null): boolean {
  if (!user || !canUseWorkspace(user.role, 'grievances')) return false
  return user.role === 'super_admin' || (user.employeeId !== null && user.employeeId === ownerEmployeeId)
}

/** What someone who may not change a grievance is told, on the page and by the server. */
export const grievanceManageReason = (ownerName: string) => `Only the owner (${ownerName}) or a Super Admin can do this.`
