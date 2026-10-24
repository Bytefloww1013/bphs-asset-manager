import { canAt, type Grantee } from '#shared/permissions.ts'

/**
 * Whether this account may edit a grievance, change its status or hand it to another owner: anyone with Edit in Grievances,
 * or the account linked to the employee named as its owner, if that account can at least read Grievances.
 */
export function canManageGrievance(
  user: (Grantee & { employeeId: number | null }) | undefined | null,
  ownerEmployeeId: number | null,
): boolean {
  if (!user || !canAt(user, 'grievances', 'read')) return false
  return canAt(user, 'grievances', 'edit') || (user.employeeId !== null && user.employeeId === ownerEmployeeId)
}

/** What someone who may not change a grievance is told, on the page and by the server. */
export const grievanceManageReason = (ownerName: string) =>
  `Only the owner (${ownerName}) or someone with Edit access to Grievances can do this.`
