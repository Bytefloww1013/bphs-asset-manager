import { describe, expect, it } from 'vitest'
import grievances from './manifest.ts'

describe('the grievances manifest', () => {
  // Grievances never notify, and keep a log of their own: nothing about a grievance reaches the Audit Log.
  it('is confidential, declares no notification kinds and writes nothing to the Audit Log', () => {
    expect(grievances.confidential).toBe(true)
    expect('notificationKinds' in grievances).toBe(false)
    expect('employeeNotificationKinds' in grievances).toBe(false)
    expect('auditEntityTypes' in grievances).toBe(false)
  })

  it('keeps its place on the access form, after Assets', () => {
    expect(grievances.resources.map(({ key, order, workspace }) => ({ key, order, workspace }))).toEqual([
      { key: 'grievances', order: 20, workspace: true },
    ])
  })
})
