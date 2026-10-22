import { describe, expect, it } from 'vitest'
import type { Grantee } from '@shared/permissions.ts'
import { AREAS, NAV_PATHS, RAIL_ITEM_HEIGHT, areasFor, fitRail, jumpIndex, navFor } from './nav.ts'

// The seeded accounts' access (server/seed.ts).
const priya: Grantee = { access: {}, superAdmin: true, employeeId: 1 }
const marcus: Grantee = {
  access: { assets: 'edit', grievances: 'edit', reviews: 'edit', employees: 'edit', tasks: 'edit' },
  superAdmin: false,
  employeeId: 2,
}
const dana: Grantee = {
  access: { grievances: 'edit', employees: 'edit', tasks: 'assign' },
  superAdmin: false,
  employeeId: 3,
}
const ops: Grantee = { access: { assets: 'edit', employees: 'edit' }, superAdmin: false, employeeId: 4 }
const nobody: Grantee = { access: { reviews: 'edit' }, superAdmin: false, employeeId: null }

const names = (user: Grantee) => areasFor(user).map((area) => area.name)
const entries = (user: Grantee, area: Parameters<typeof navFor>[0], unread?: number) =>
  navFor(area, user, unread).flatMap((group) => group.items)

describe('areasFor', () => {
  it('lists Home, then each readable workspace, in rail order', () => {
    expect(names(priya)).toEqual([
      'Home',
      'Assets',
      'Maintenance',
      'Employee Tasks',
      'Administrative Reviews',
      'Grievances',
    ])
    expect(names(marcus)).toEqual(['Home', 'Assets', 'Employee Tasks', 'Administrative Reviews', 'Grievances'])
    expect(names(dana)).toEqual(['Home', 'Employee Tasks', 'Grievances'])
    expect(names(ops)).toEqual(['Home', 'Assets'])
  })

  it('leaves out Administrative Reviews for an account that is nobody', () => {
    expect(names(nobody)).toEqual(['Home'])
  })

  it('marks only Grievances and Administrative Reviews confidential', () => {
    expect(AREAS.filter((area) => area.confidential).map((area) => area.id)).toEqual(['reviews', 'grievances'])
  })
})

describe('navFor', () => {
  it('puts a count on Home’s Inbox only', () => {
    for (const area of AREAS) {
      const counted = entries(priya, area.id, 7).filter((item) => item.count !== undefined)
      expect(counted.map((item) => item.label)).toEqual(area.id === 'me' ? ['Inbox'] : [])
    }
  })

  it('never puts a count or lock on a confidential area', () => {
    for (const user of [priya, marcus, dana]) {
      for (const area of ['grievances', 'reviews'] as const) {
        expect(entries(user, area, 7).every((item) => item.count === undefined && !item.lock && !item.soon)).toBe(true)
      }
    }
  })

  it('names Home’s pages as in the plan, with My Dashboard coming later', () => {
    expect(entries(priya, 'me').map((item) => item.label)).toEqual([
      'My Dashboard',
      'Inbox',
      'My tasks',
      'Profile',
      'Notices',
    ])
    expect(entries(marcus, 'me').map((item) => item.label)).toEqual(['My Dashboard', 'Inbox', 'My tasks', 'Profile'])
    const dashboard = entries(priya, 'me')[0]!
    expect(dashboard.to).toBeUndefined()
    expect(dashboard.soon).toBe('Coming later')
  })

  it('locks Users for all but a Super Admin, and Assign task below Assign', () => {
    const users = (user: Grantee) => entries(user, 'assets').find((item) => item.to === '/users')?.lock
    const assign = (user: Grantee) => entries(user, 'tasks').find((item) => item.to === '/tasks/new')?.lock
    expect(users(priya)).toBeUndefined()
    expect(users(ops)).toBe('Super Admin only')
    expect(assign(dana)).toBeUndefined()
    expect(assign({ ...dana, access: { tasks: 'read' } })).toBe('Needs Assign access')
  })

  it('shows Employees only with access to Employees', () => {
    const noEmployees: Grantee = { access: { grievances: 'read' }, superAdmin: false, employeeId: 5 }
    expect(entries(noEmployees, 'grievances').some((item) => item.to === '/grievances/employees')).toBe(false)
    expect(entries(dana, 'grievances').some((item) => item.to === '/grievances/employees')).toBe(true)
  })

  it('links only to known sidebar pages', () => {
    const links = AREAS.flatMap((area) => entries(priya, area.id).flatMap((item) => (item.to ? [item.to] : [])))
    expect(links.filter((to) => !NAV_PATHS.includes(to))).toEqual([])
  })
})

describe('fitRail', () => {
  it('shows everything when there is room', () => {
    expect(fitRail(6, 6 * RAIL_ITEM_HEIGHT, 5)).toEqual({ shown: [0, 1, 2, 3, 4, 5], overflow: [] })
  })

  it('keeps a slot for More and the active area in view', () => {
    const height = 4 * RAIL_ITEM_HEIGHT
    expect(fitRail(6, height, 0)).toEqual({ shown: [0, 1, 2], overflow: [3, 4, 5] })
    expect(fitRail(6, height, 5)).toEqual({ shown: [0, 1, 5], overflow: [2, 3, 4] })
    expect(fitRail(6, height, 1)).toEqual({ shown: [0, 1, 2], overflow: [3, 4, 5] })
  })

  it('always shows at least one area', () => {
    expect(fitRail(6, 10, 4)).toEqual({ shown: [4], overflow: [0, 1, 2, 3, 5] })
  })
})

describe('jumpIndex', () => {
  it('holds no page that cannot be opened, and no count', () => {
    const index = jumpIndex(ops)
    expect(index.some((entry) => entry.to === '/users')).toBe(false)
    expect(index.some((entry) => entry.label === 'My Dashboard')).toBe(false)
    expect(index.every((entry) => !('count' in entry))).toBe(true)
  })

  it('covers only the areas the account can read', () => {
    expect([...new Set(jumpIndex(dana).map((entry) => entry.area))]).toEqual(['me', 'tasks', 'grievances'])
    expect(jumpIndex(priya).some((entry) => entry.to === '/grievances/categories')).toBe(true)
  })
})
