import { describe, expect, it } from 'vitest'
import type { Access } from '#shared/constants.ts'
import { canManageReview } from './permissions.ts'

const user = (access: Access, employeeId: number | null = null, superAdmin = false) => ({
  access,
  superAdmin,
  employeeId,
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
