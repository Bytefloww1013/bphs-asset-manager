import { ACCESS_LEVEL_LABEL, ACCESS_LEVELS, SECTION_LABEL, SECTIONS, WORKSPACES, type Access, type AccessLevel, type Section, type Workspace } from './constants.ts'

/** What decides what an account may do: a level in each section, or Super Admin, which is Full in every section there is or will be. */
export interface Grantee {
  access: Access
  superAdmin: boolean
  /** Who the account is, which Reviews needs. Left out where only the saved levels are judged, as while access is being set. */
  employeeId?: number | null
  /** The account made on first run, the one account that need not be linked to an employee. */
  firstAccount?: boolean
}

export function levelOf(user: Grantee | undefined | null, section: Section): AccessLevel {
  if (!user) return 'none'
  // A review is hidden from the employee it is about, so an account that is nobody cannot be shown any (R9).
  if (section === 'reviews' && user.employeeId === null && !user.firstAccount) return 'none'
  return user.superAdmin ? 'full' : (user.access[section] ?? 'none')
}

export function canAt(user: Grantee | undefined | null, section: Section, level: AccessLevel): boolean {
  return ACCESS_LEVELS.indexOf(levelOf(user, section)) >= ACCESS_LEVELS.indexOf(level)
}

/** The workspaces an account works in: those it can at least read. A person sees nothing of any other. */
export const workspacesOf = (user: Grantee): Workspace[] => WORKSPACES.filter((workspace) => canAt(user, workspace, 'read'))

export const canUseWorkspace = (user: Grantee | undefined | null, workspace: Workspace) => canAt(user, workspace, 'read')

/** Who may send notices. One rule, so widening it later is this line and its test. */
export const canSendNotices = (user: Grantee | undefined | null) => user?.superAdmin === true

/** What someone without enough access is told, on the page and by the server. */
export const needsAccess = (section: Section, level: AccessLevel) =>
  level === 'read' ? `Your account does not have access to ${SECTION_LABEL[section]}.` : `You need ${ACCESS_LEVEL_LABEL[level]} access to ${SECTION_LABEL[section]} for this.`

/** An account's access in words: "Super Admin", or "Assets: Edit · Employees: Read Only". */
export function describeAccess(user: Grantee): string {
  if (user.superAdmin) return 'Super Admin'
  const granted = SECTIONS.filter((section) => user.access[section]).map((section) => `${SECTION_LABEL[section]}: ${ACCESS_LEVEL_LABEL[user.access[section]!]}`)
  return granted.join(' · ') || 'No access'
}

/**
 * Whether this account may edit a grievance, change its status or hand it to another owner: anyone with Edit in Grievances,
 * or the account linked to the employee named as its owner, if that account can at least read Grievances.
 */
export function canManageGrievance(user: (Grantee & { employeeId: number | null }) | undefined | null, ownerEmployeeId: number | null): boolean {
  if (!user || !canAt(user, 'grievances', 'read')) return false
  return canAt(user, 'grievances', 'edit') || (user.employeeId !== null && user.employeeId === ownerEmployeeId)
}

/** What someone who may not change a grievance is told, on the page and by the server. */
export const grievanceManageReason = (ownerName: string) => `Only the owner (${ownerName}) or someone with Edit access to Grievances can do this.`

/**
 * Whether this account may edit a review and add to its history: anyone with Edit in Administrative Reviews, or the account
 * linked to the employee named as its reviewer, if that account can at least read Administrative Reviews.
 */
export function canManageReview(user: (Grantee & { employeeId: number | null }) | undefined | null, reviewerEmployeeId: number): boolean {
  if (!user || !canAt(user, 'reviews', 'read')) return false
  return canAt(user, 'reviews', 'edit') || (user.employeeId !== null && user.employeeId === reviewerEmployeeId)
}

/** What someone who may not change a review is told, on the page and by the server. */
export const reviewManageReason = (reviewerName: string) => `Only the reviewer (${reviewerName}) or someone with Edit access to Administrative Reviews can do this.`
