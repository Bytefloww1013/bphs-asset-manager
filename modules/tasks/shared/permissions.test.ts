import { describe, expect, it } from 'vitest'
import { canAt } from '#shared/permissions.ts'
import {
  canApproveTask,
  canAssignTasks,
  canCancelTask,
  canDeleteTask,
  canEditTask,
  canViewEmployeeTasks,
} from './permissions.ts'

describe('tasks', () => {
  const ASSIGNER = 1
  const ASSIGNEE = 2
  const OTHER = 3
  const account = (id: number, level?: 'read' | 'assign' | 'edit' | 'full', superAdmin = false) => ({
    id,
    access: level ? { tasks: level } : {},
    superAdmin,
    employeeId: null,
  })
  const byAssigner = { assignerUserId: ASSIGNER, assigneeUserId: ASSIGNEE, assignerSuperAdmin: false }
  const bySuperAdmin = { ...byAssigner, assignerSuperAdmin: true }

  it('offers Assign only in Tasks, and counts it between Read and Edit', () => {
    expect(canAt(account(OTHER, 'assign'), 'tasks', 'read')).toBe(true)
    expect(canAt(account(OTHER, 'assign'), 'tasks', 'edit')).toBe(false)
    expect(canAt(account(OTHER, 'edit'), 'tasks', 'assign')).toBe(true)
  })

  it('shows Employee Tasks from Read, and lets Assign and above assign', () => {
    expect(
      [undefined, 'read', 'assign', 'edit', 'full'].map((level) =>
        canViewEmployeeTasks(account(OTHER, level as 'read')),
      ),
    ).toEqual([false, true, true, true, true])
    expect(
      [undefined, 'read', 'assign', 'edit', 'full'].map((level) => canAssignTasks(account(OTHER, level as 'read'))),
    ).toEqual([false, false, true, true, true])
    expect(canAssignTasks(account(OTHER, undefined, true))).toBe(true)
  })

  // [who, the task, edit/cancel, delete, approve]
  const matrix: [string, ReturnType<typeof account>, typeof byAssigner, boolean, boolean, boolean][] = [
    ['Read, anyone', account(OTHER, 'read'), byAssigner, false, false, false],
    ['Assign, its assigner', account(ASSIGNER, 'assign'), byAssigner, true, false, true],
    ['Assign, not its assigner', account(OTHER, 'assign'), byAssigner, false, false, false],
    ['Edit, anyone', account(OTHER, 'edit'), byAssigner, true, false, true],
    ["Edit, a Super Admin's task", account(OTHER, 'edit'), bySuperAdmin, false, false, true],
    ['Full, anyone', account(OTHER, 'full'), byAssigner, true, true, true],
    ["Full, a Super Admin's task", account(OTHER, 'full'), bySuperAdmin, true, true, true],
    ["Super Admin, a Super Admin's task", account(OTHER, undefined, true), bySuperAdmin, true, true, true],
    ['None, its assigner, once their access is gone', account(ASSIGNER), byAssigner, false, false, false],
    ['the assignee at Full', account(ASSIGNEE, 'full'), byAssigner, true, true, false],
    ['the assignee as Super Admin', account(ASSIGNEE, undefined, true), byAssigner, true, true, false],
  ]
  it.each(matrix)('%s', (_name, user, task, edit, remove, approve) => {
    expect(canEditTask(user, task)).toBe(edit)
    expect(canCancelTask(user, task)).toBe(edit)
    expect(canDeleteTask(user)).toBe(remove)
    expect(canApproveTask(user, task)).toBe(approve)
  })

  it('refuses everything when nobody is signed in', () => {
    expect(canEditTask(null, byAssigner)).toBe(false)
    expect(canApproveTask(undefined, byAssigner)).toBe(false)
    expect(canViewEmployeeTasks(null)).toBe(false)
  })
})
