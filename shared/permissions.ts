import {
  ACCESS_LEVEL_LABEL,
  ACCESS_LEVELS,
  SECTION_LABEL,
  SECTIONS,
  WORKSPACES,
  type Access,
  type AccessLevel,
  type Section,
  type TaskFileSide,
  type TaskStatus,
  type Workspace,
} from './constants.ts'

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
export const workspacesOf = (user: Grantee): Workspace[] =>
  WORKSPACES.filter((workspace) => canAt(user, workspace, 'read'))

export const canUseWorkspace = (user: Grantee | undefined | null, workspace: Workspace) =>
  canAt(user, workspace, 'read')

/** Who may send notices. One rule, so widening it later is this line and its test. */
export const canSendNotices = (user: Grantee | undefined | null) => user?.superAdmin === true

/** What someone without enough access is told, on the page and by the server. */
export const needsAccess = (section: Section, level: AccessLevel) =>
  level === 'read'
    ? `Your account does not have access to ${SECTION_LABEL[section]}.`
    : `You need ${ACCESS_LEVEL_LABEL[level]} access to ${SECTION_LABEL[section]} for this.`

/** An account's access in words: "Super Admin", or "Assets: Edit · Employees: Read Only". */
export function describeAccess(user: Grantee): string {
  if (user.superAdmin) return 'Super Admin'
  const granted = SECTIONS.filter((section) => user.access[section]).map(
    (section) => `${SECTION_LABEL[section]}: ${ACCESS_LEVEL_LABEL[user.access[section]!]}`,
  )
  return granted.join(' · ') || 'No access'
}

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

// ---- Tasks ------------------------------------------------------------------------------
// Levels in Tasks: Read sees every task; Assign also assigns, and edits or cancels its own; Edit edits or cancels anyone's except
// a Super Admin's; Full also deletes, and edits a Super Admin's. Every account sees and completes the tasks sent to it in My Space.

/** Who a task belongs to, as the rules below need it. `assignerSuperAdmin` is whether a Super Admin assigned it, kept on the task. */
export interface TaskOwnership {
  assigneeUserId: number
  assignerUserId: number
  assignerSuperAdmin: boolean
}

type Account = (Grantee & { id: number }) | undefined | null

export const canViewEmployeeTasks = (user: Grantee | undefined | null) => canAt(user, 'tasks', 'read')

export const canAssignTasks = (user: Grantee | undefined | null) => canAt(user, 'tasks', 'assign')

/** Edit-own at Assign, edit-others at Edit, but a task a Super Admin assigned needs Full. */
export function canEditTask(user: Account, task: TaskOwnership): boolean {
  if (!user) return false
  if (canAt(user, 'tasks', 'full')) return true
  if (task.assignerSuperAdmin) return false
  return canAt(user, 'tasks', 'edit') || (canAt(user, 'tasks', 'assign') && task.assignerUserId === user.id)
}

/** Cancelling is editing's rule. */
export const canCancelTask = canEditTask

export const canDeleteTask = (user: Grantee | undefined | null) => canAt(user, 'tasks', 'full')

/** The assigner, Edit, Full or a Super Admin, whoever assigned it, but never the assignee (four-eyes), and only while they can read Employee Tasks. */
export function canApproveTask(user: Account, task: TaskOwnership): boolean {
  if (!user || user.id === task.assigneeUserId || !canAt(user, 'tasks', 'read')) return false
  return task.assignerUserId === user.id || canAt(user, 'tasks', 'edit')
}

/** What someone who may not change a task is told, on the page and by the server. */
export const taskEditReason = (task: TaskOwnership) =>
  task.assignerSuperAdmin
    ? 'A Super Admin assigned this task, so only Full access to Employee Tasks can change it.'
    : 'Only its assigner, or someone with Edit access to Employee Tasks, can change this task.'

/** Why a task in this status can no longer be changed, or null while it is open. */
export function taskClosedReason(status: TaskStatus): string | null {
  if (status === 'cancelled') return 'This task is cancelled, so it can no longer be changed.'
  if (status === 'completed') return 'This task is completed, so it can no longer be changed.'
  if (status === 'awaiting_approval') return 'This task is awaiting approval. Send it back to change it.'
  return null
}

/** Why this account can't approve or send back this task, or null if it can. */
export function taskApproveReason(user: Account, task: TaskOwnership): string | null {
  if (canApproveTask(user, task)) return null
  return user?.id === task.assigneeUserId
    ? 'You cannot approve or send back your own task.'
    : 'Only its assigner, or someone with Edit access to Employee Tasks, can approve it.'
}

/** The assignee is never its approver, so a task its assigner sends to themselves cannot need approval. */
export const SELF_APPROVAL_PROBLEM =
  'You cannot approve your own task, so a task you send yourself cannot need approval.'

/** Whether its assignee is the one changing whether it needs approval: never allowed, or they could skip it. */
export const APPROVAL_LOCKED_PROBLEM = 'You cannot change whether your own task needs approval.'

/** Whoever added the file, or anyone who may edit the task. */
export const mayWithdrawTaskFile = (user: Account, task: TaskOwnership, file: { uploadedById: number | null }) =>
  !!user && (file.uploadedById === user.id || canEditTask(user, task))

/**
 * Why this account can't withdraw this file now, or null if it can. Whoever added it, or anyone who may edit the task, while
 * the file still matters: an assigner's until the task is Completed or Cancelled, an assignee's until it is marked complete.
 */
export function taskFileWithdrawProblem(
  user: Account,
  task: TaskOwnership & { status: TaskStatus },
  file: { side: TaskFileSide; uploadedById: number | null; withdrawnAt: string | null },
): string | null {
  if (file.withdrawnAt) return 'This file has already been withdrawn.'
  if (!mayWithdrawTaskFile(user, task, file))
    return 'Only whoever added it, or someone who can change this task, can withdraw this file.'
  if (
    file.side === 'assignee'
      ? task.status !== 'outstanding' && task.status !== 'past_due'
      : task.status === 'completed' || task.status === 'cancelled'
  )
    return file.side === 'assignee'
      ? 'A completion file can be withdrawn only while the task is open again.'
      : 'Files on a completed or cancelled task stay as they are.'
  return null
}
