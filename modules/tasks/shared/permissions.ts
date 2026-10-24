import { canAt, type Grantee } from '#shared/permissions.ts'
import type { TaskFileSide, TaskStatus } from './constants.ts'

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
