import { describe, expect, it } from 'vitest'
import {
  SECTION_HINT,
  SECTION_LABEL,
  SECTIONS,
  WORKSPACE_LABEL,
  WORKSPACES,
  levelHelp,
  levelsFor,
} from './constants.ts'
import { auditEntityTypes, manifests, notificationKinds } from './registry.ts'
import { expectToday } from './testing.ts'

describe('the shared registry', () => {
  it('lists foundation modules first and every dependency before the module that needs it', () => {
    const ids = manifests().map((manifest) => manifest.id)
    const tiers = manifests().map((manifest) => manifest.tier)
    const firstFeature = tiers.indexOf('feature')
    expect(firstFeature === -1 ? [] : tiers.slice(firstFeature)).not.toContain('foundation')
    manifests().forEach((manifest, i) => {
      for (const dep of manifest.dependsOn) expect(ids.indexOf(dep), `${manifest.id} → ${dep}`).toBeLessThan(i)
    })
  })

  // The kernel reads the sections from here (shared/constants.ts): they must stay today's, in today's order.
  it('has today’s sections as its permission resources', () => {
    expectToday(SECTIONS, ['assets', 'grievances', 'maintenance', 'reviews', 'tasks', 'employees'])
    expectToday(WORKSPACES, ['assets', 'grievances', 'maintenance', 'reviews', 'tasks'])
    expect(SECTION_LABEL).toMatchObject({ ...WORKSPACE_LABEL, employees: 'Employees' })
    expectToday(Object.keys(SECTION_LABEL), [...SECTIONS])
    expect(WORKSPACE_LABEL).toMatchObject({
      assets: 'Assets',
      grievances: 'Grievances',
      maintenance: 'Maintenance',
      reviews: 'Administrative Reviews',
      tasks: 'Employee Tasks',
    })
    for (const section of SECTIONS)
      expect(levelsFor(section)).toEqual(
        section === 'tasks' ? ['none', 'read', 'assign', 'edit', 'full'] : ['none', 'read', 'edit', 'full'],
      )
  })

  // The Users page's "i" buttons and the Profile page read these.
  it('explains every level each section offers', () => {
    for (const section of SECTIONS)
      for (const level of levelsFor(section)) expect(levelHelp(section, level), `${section} ${level}`).not.toBe('')
    expect(levelHelp('tasks', 'assign')).toBe('Also assign tasks, and edit or cancel the tasks this account assigned.')
    expect(SECTIONS.filter((section) => SECTION_HINT[section])).toEqual(['employees'])
  })

  // The Inbox and the bell label each notification with these: today's kinds and labels, wherever they are declared now.
  it('has today’s notification kinds and audit entity types', () => {
    expect(notificationKinds()).toEqual({
      asset_issued: 'Asset issued',
      digital_issued: 'Digital asset issued',
      asset_returned_poor: 'Poor-condition return',
      maintenance_dispatched: 'Maintenance dispatched',
      maintenance_changed: 'Maintenance update',
      asset_overdue: 'Overdue asset',
      account_password_reset: 'Password reset',
      account_access_changed: 'Access change',
      account_unlocked: 'Account unlocked',
      account_employee_linked: 'Linked employee change',
      notice: 'Notice',
      task_assigned: 'Task assigned',
      task_updated: 'Task updated',
      task_completed: 'Task completed',
      task_approval_requested: 'Task awaiting approval',
      task_approved: 'Task approved',
      task_sent_back: 'Task sent back',
      task_past_due: 'Task past due',
      task_cancelled: 'Task cancelled',
    })
    // In dependency order: employees and programs before assignments, which needs both, then audit and notifications.
    expectToday(auditEntityTypes(), [
      'employee',
      'program',
      'user',
      'notice',
      'asset',
      'assettype',
      'assetbrand',
      'conditionrating',
      'assignment',
      'digitalasset',
      'digitalassettype',
      'maintenance_request',
    ])
  })
})
