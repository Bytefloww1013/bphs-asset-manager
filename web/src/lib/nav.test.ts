import { describe, expect, it } from 'vitest'
import type { Grantee } from '@shared/permissions.ts'
import { expectToday } from '@shared/testing.ts'
import { RAIL_ITEM_HEIGHT, areas, areasFor, fitRail, jumpIndex, navFor, navPaths } from './nav.ts'

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
    expectToday(names(priya), [
      'Home',
      'Assets',
      'Maintenance',
      'Employee Tasks',
      'Administrative Reviews',
      'Grievances',
    ])
    expectToday(names(marcus), ['Home', 'Assets', 'Employee Tasks', 'Administrative Reviews', 'Grievances'])
    expect(names(dana)).toEqual(['Home', 'Employee Tasks', 'Grievances'])
    expect(names(ops)).toEqual(['Home', 'Assets'])
  })

  it('leaves out Administrative Reviews for an account that is nobody', () => {
    expect(names(nobody)).toEqual(['Home'])
  })

  it('marks only Grievances and Administrative Reviews confidential', () => {
    expect(
      areas()
        .filter((area) => area.confidential)
        .map((area) => area.id),
    ).toEqual(['reviews', 'grievances'])
  })
})

describe('navFor', () => {
  it('puts a count on Home’s Inbox only', () => {
    for (const area of areas()) {
      const counted = entries(priya, area.id, 7).filter((item) => item.count !== undefined)
      expect(counted.map((item) => item.label)).toEqual(area.id === 'me' ? ['Inbox'] : [])
    }
  })

  it('never puts a count or a reason on a confidential area', () => {
    for (const user of [priya, marcus, dana]) {
      for (const area of ['grievances', 'reviews'] as const) {
        expect(entries(user, area, 7).every((item) => item.count === undefined && !item.soon)).toBe(true)
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

  it('leaves out Users for all but a Super Admin, and Assign task below Assign (issue #27)', () => {
    const users = (user: Grantee) => entries(user, 'assets').some((item) => item.to === '/users')
    const assign = (user: Grantee) => entries(user, 'tasks').some((item) => item.to === '/tasks/new')
    expect(users(priya)).toBe(true)
    expect(users(ops)).toBe(false)
    expect(assign(dana)).toBe(true)
    expect(assign({ ...dana, access: { tasks: 'read' } })).toBe(false)
  })

  it('shows Employees only with access to Employees', () => {
    const noEmployees: Grantee = { access: { grievances: 'read' }, superAdmin: false, employeeId: 5 }
    expect(entries(noEmployees, 'grievances').some((item) => item.to === '/grievances/employees')).toBe(false)
    expect(entries(dana, 'grievances').some((item) => item.to === '/grievances/employees')).toBe(true)
  })

  it('lists each area’s pages in today’s groups and order', () => {
    const panels = (user: Grantee) =>
      areasFor(user).map(
        (area) =>
          `${area.label}: ${navFor(area.id, user)
            .map((group) => `${group.heading ?? '-'} (${group.items.map((item) => item.label).join(', ')})`)
            .join(' / ')}`,
      )
    expectToday(panels(priya), [
      'Home: - (My Dashboard, Inbox) / - (My tasks, Profile, Notices)',
      'Assets: Work (Overview, Assignments, Available) / Records (Physical Assets, Digital Assets, Employees, Programs) / Administration (Lists, Import/Export, Audit log, Users)',
      'Maintenance: - (Requests)',
      'Tasks: - (All tasks, Assign task)',
      'Reviews: - (Reviews, Action items, Employees) / Administration (Audit log)',
      'Grievances: - (Grievances, Employees) / Administration (Categories, Audit log)',
    ])
    expectToday(panels(marcus), [
      'Home: - (My Dashboard, Inbox) / - (My tasks, Profile)',
      'Assets: Work (Overview, Assignments, Available) / Records (Physical Assets, Digital Assets, Employees, Programs) / Administration (Lists, Import/Export, Audit log)',
      'Tasks: - (All tasks, Assign task)',
      'Reviews: - (Reviews, Action items, Employees) / Administration (Audit log)',
      'Grievances: - (Grievances, Employees) / Administration (Categories, Audit log)',
    ])
    expect(panels({ access: { tasks: 'read' }, superAdmin: false, employeeId: 6 })).toEqual([
      'Home: - (My Dashboard, Inbox) / - (My tasks, Profile)',
      'Tasks: - (All tasks)',
    ])
  })

  it('links only to the sidebar pages a pin can hold', () => {
    expectToday(
      [...navPaths()].sort(),
      [
        '/me/inbox',
        '/me/tasks',
        '/me/profile',
        '/me/notices',
        '/',
        '/assignments',
        '/available',
        '/assets',
        '/digital-assets',
        '/employees',
        '/programs',
        '/lists',
        '/import-export',
        '/audit',
        '/users',
        '/grievances',
        '/grievances/employees',
        '/grievances/categories',
        '/grievances/audit',
        '/maintenance',
        '/reviews',
        '/reviews/actions',
        '/reviews/employees',
        '/reviews/audit',
        '/tasks',
        '/tasks/new',
      ].sort(),
    )
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
