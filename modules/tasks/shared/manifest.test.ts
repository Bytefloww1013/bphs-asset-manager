import { describe, expect, it } from 'vitest'
import tasks from './manifest.ts'

describe('the tasks manifest', () => {
  it('offers Assign, and keeps no records about employees', () => {
    const [resource] = tasks.resources
    expect(resource.levels).toEqual(['none', 'read', 'assign', 'edit', 'full'])
    expect(resource.aboutAccounts).toBe(true)
  })

  // Tasks are sent to accounts, so none of its kinds is about the linked employee.
  it('declares the task notification kinds, none of them for the linked employee', () => {
    expect(Object.keys(tasks.notificationKinds)).toEqual([
      'task_assigned',
      'task_updated',
      'task_completed',
      'task_approval_requested',
      'task_approved',
      'task_sent_back',
      'task_past_due',
      'task_cancelled',
    ])
    expect('employeeNotificationKinds' in tasks).toBe(false)
  })
})
