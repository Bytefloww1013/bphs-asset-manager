import { describe, expect, it } from 'vitest'
import type { Access } from './constants.ts'
import { canAt, describeAccess, levelOf, workspacesOf } from './permissions.ts'
import { expectToday } from './testing.ts'

const user = (access: Access, employeeId: number | null = null, superAdmin = false) => ({
  access,
  superAdmin,
  employeeId,
})

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
    expectToday(workspacesOf(user({}, 7, true)), ['assets', 'grievances', 'maintenance', 'reviews', 'tasks'])
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
