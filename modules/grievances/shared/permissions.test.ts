import { describe, expect, it } from 'vitest'
import type { Access } from '#shared/constants.ts'
import { canManageGrievance } from './permissions.ts'

const user = (access: Access, employeeId: number | null = null, superAdmin = false) => ({
  access,
  superAdmin,
  employeeId,
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
