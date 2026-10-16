import { describe, expect, it } from 'vitest'
import type { Access } from './constants.ts'
import { canAt, canManageGrievance, describeAccess, levelOf, workspacesOf } from './permissions.ts'

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
    expect(workspacesOf(user({}, 7, true))).toEqual(['assets', 'grievances', 'maintenance', 'reviews'])
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
  it('lets the owner manage their own with Read, and nobody else at Read', () => {
    expect(canManageGrievance(user({ grievances: 'read' }, 7), 7)).toBe(true)
    expect(canManageGrievance(user({ grievances: 'read' }, 7), 8)).toBe(false)
  })

  it('lets Edit, Full and a Super Admin manage any grievance', () => {
    expect(canManageGrievance(user({ grievances: 'edit' }), 8)).toBe(true)
    expect(canManageGrievance(user({ grievances: 'full' }), null)).toBe(true)
    expect(canManageGrievance(user({}, null, true), 8)).toBe(true)
  })

  it('refuses an owner with no access to Grievances', () => {
    expect(canManageGrievance(user({ assets: 'full' }, 7), 7)).toBe(false)
  })

  it('never matches an account with no linked employee to a grievance with no owner', () => {
    expect(canManageGrievance(user({ grievances: 'read' }), null)).toBe(false)
  })

  it('refuses when nobody is signed in', () => {
    expect(canManageGrievance(null, 7)).toBe(false)
    expect(canManageGrievance(undefined, 7)).toBe(false)
  })
})
