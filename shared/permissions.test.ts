import { describe, expect, it } from 'vitest'
import type { Access } from './constants.ts'
import { canApproveTask, canAssignTasks, canAt, canCancelTask, canDeleteTask, canEditTask, canManageGrievance, canManageReview, canViewEmployeeTasks, describeAccess, levelOf, workspacesOf } from './permissions.ts'

const user = (access: Access, employeeId: number | null = null, superAdmin = false) => ({ access, superAdmin, employeeId })

describe('access levels', () => {
  it('gives a Super Admin Full everywhere, whatever is stored', () => {
    expect(levelOf(user({}, null, true), 'maintenance')).toBe('full')
    expect(canAt(user({ assets: 'read' }, null, true), 'assets', 'full')).toBe(true)
  })

  it('treats a section that is not named as None', () => {
    expect(levelOf(user({ assets: 'edit' }), 'grievances')).toBe('none')
    expect(canAt(user({ assets: 'edit' }), 'grievances', 'read')).toBe(false)
    expect(levelOf(null, 'assets')).toBe('none')
  })

  it('includes the levels below', () => {
    const editor = user({ assets: 'edit' })
    expect(canAt(editor, 'assets', 'read')).toBe(true)
    expect(canAt(editor, 'assets', 'edit')).toBe(true)
    expect(canAt(editor, 'assets', 'full')).toBe(false)
  })

  it('lists the workspaces an account can read, never Employees', () => {
    expect(workspacesOf(user({ grievances: 'read', employees: 'full' }))).toEqual(['grievances'])
    expect(workspacesOf(user({}, 7, true))).toEqual(['assets', 'grievances', 'maintenance', 'reviews', 'tasks'])
  })

  it('shows Reviews to no account that is not linked to an employee, but the first', () => {
    expect(levelOf(user({ reviews: 'full' }, null, true), 'reviews')).toBe('none')
    expect(levelOf(user({ assets: 'full' }, null), 'assets')).toBe('full')
    expect(levelOf({ ...user({}, null, true), firstAccount: true }, 'reviews')).toBe('full')
    expect(levelOf(user({ reviews: 'read' }, 7), 'reviews')).toBe('read')
    // While access is being set there is nobody to judge yet, only the levels.
    expect(levelOf({ access: { reviews: 'read' }, superAdmin: false }, 'reviews')).toBe('read')
  })

  it('describes access in words', () => {
    expect(describeAccess(user({ employees: 'edit', assets: 'read' }))).toBe('Assets: Read Only · Employees: Edit')
    expect(describeAccess(user({ assets: 'read' }, null, true))).toBe('Super Admin')
    expect(describeAccess(user({}))).toBe('No access')
  })
})

describe('managing a grievance', () => {
  it.each([
    ['the owner at Read', user({ grievances: 'read' }, 7), 7, true],
    ['someone else at Read', user({ grievances: 'read' }, 7), 8, false],
    ['Edit, any grievance', user({ grievances: 'edit' }), 8, true],
    ['Full, a grievance with no owner', user({ grievances: 'full' }), null, true],
    ['a Super Admin, any grievance', user({}, null, true), 8, true],
    ['the owner with no access to Grievances', user({ assets: 'full' }, 7), 7, false],
    // An account with no linked employee never matches a grievance with no owner.
    ['no linked employee, no owner', user({ grievances: 'read' }), null, false],
    ['nobody signed in (null)', null, 7, false],
    ['nobody signed in (undefined)', undefined, 7, false],
  ] as const)('%s', (_name, who, ownerId, can) => {
    expect(canManageGrievance(who, ownerId)).toBe(can)
  })
})

describe('managing a review', () => {
  it.each([
    ['the reviewer at Read', user({ reviews: 'read' }, 7), 7, true],
    ['someone else at Read', user({ reviews: 'read' }, 7), 8, false],
    ['Edit with a linked employee, any review', user({ reviews: 'edit' }, 9), 8, true],
    ['Full with a linked employee, any review', user({ reviews: 'full' }, 9), 8, true],
    ['a Super Admin with a linked employee, any review', user({}, 9, true), 8, true],
    ['Edit with no linked employee', user({ reviews: 'edit' }), 8, false],
    ['a Super Admin with no linked employee', user({}, null, true), 8, false],
    ['the reviewer with no access to Reviews', user({ assets: 'full' }, 7), 7, false],
    ['nobody signed in', null, 7, false],
  ] as const)('%s', (_name, who, reviewerId, can) => {
    expect(canManageReview(who, reviewerId)).toBe(can)
  })
})

describe('tasks', () => {
  const ASSIGNER = 1
  const ASSIGNEE = 2
  const OTHER = 3
  const account = (id: number, level?: 'read' | 'assign' | 'edit' | 'full', superAdmin = false) => ({ id, access: level ? { tasks: level } : {}, superAdmin, employeeId: null })
  const byAssigner = { assignerUserId: ASSIGNER, assigneeUserId: ASSIGNEE, assignerSuperAdmin: false }
  const bySuperAdmin = { ...byAssigner, assignerSuperAdmin: true }

  it('offers Assign only in Tasks, and counts it between Read and Edit', () => {
    expect(canAt(account(OTHER, 'assign'), 'tasks', 'read')).toBe(true)
    expect(canAt(account(OTHER, 'assign'), 'tasks', 'edit')).toBe(false)
    expect(canAt(account(OTHER, 'edit'), 'tasks', 'assign')).toBe(true)
  })

  it('shows Employee Tasks from Read, and lets Assign and above assign', () => {
    expect([undefined, 'read', 'assign', 'edit', 'full'].map((level) => canViewEmployeeTasks(account(OTHER, level as 'read')))).toEqual([false, true, true, true, true])
    expect([undefined, 'read', 'assign', 'edit', 'full'].map((level) => canAssignTasks(account(OTHER, level as 'read')))).toEqual([false, false, true, true, true])
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
