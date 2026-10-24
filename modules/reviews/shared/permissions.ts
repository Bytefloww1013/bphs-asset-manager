import { canAt, type Grantee } from '#shared/permissions.ts'

/**
 * Whether this account may edit a review and add to its history: anyone with Edit in Administrative Reviews, or the account
 * linked to the employee named as its reviewer, if that account can at least read Administrative Reviews.
 */
export function canManageReview(
  user: (Grantee & { employeeId: number | null }) | undefined | null,
  reviewerEmployeeId: number,
): boolean {
  if (!user || !canAt(user, 'reviews', 'read')) return false
  return canAt(user, 'reviews', 'edit') || (user.employeeId !== null && user.employeeId === reviewerEmployeeId)
}

/** What someone who may not change a review is told, on the page and by the server. */
export const reviewManageReason = (reviewerName: string) =>
  `Only the reviewer (${reviewerName}) or someone with Edit access to Administrative Reviews can do this.`
