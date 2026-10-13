import { describe, expect, it } from 'vitest'
import { can, canManageGrievance } from './permissions.ts'

describe('grievance permissions', () => {
  it('lets only a Super Admin void', () => {
    expect(can('super_admin', 'grievance.void')).toBe(true)
    expect(can('admin', 'grievance.void')).toBe(false)
    expect(can(null, 'grievance.void')).toBe(false)
  })

  it('lets a Super Admin manage any grievance, whoever owns it', () => {
    expect(canManageGrievance({ role: 'super_admin', employeeId: null }, 7)).toBe(true)
    expect(canManageGrievance({ role: 'super_admin', employeeId: 3 }, null)).toBe(true)
  })

  it('lets an Admin manage only a grievance owned by the employee their account is linked to', () => {
    expect(canManageGrievance({ role: 'admin', employeeId: 7 }, 7)).toBe(true)
    expect(canManageGrievance({ role: 'admin', employeeId: 7 }, 8)).toBe(false)
  })

  it('never matches an account with no linked employee to a grievance with no owner', () => {
    expect(canManageGrievance({ role: 'admin', employeeId: null }, 7)).toBe(false)
    expect(canManageGrievance({ role: 'admin', employeeId: null }, null)).toBe(false)
  })

  it('refuses when nobody is signed in', () => {
    expect(canManageGrievance(null, 7)).toBe(false)
    expect(canManageGrievance(undefined, 7)).toBe(false)
  })
})
