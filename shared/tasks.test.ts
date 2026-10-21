import { describe, expect, it } from 'vitest'
import { isTimeZone, taskStatus, type TaskTimes } from './tasks.ts'

const now = new Date('2026-10-20T12:00:00Z')
const task = (patch: Partial<TaskTimes> = {}): TaskTimes => ({
  sendAt: '2026-10-19T12:00:00Z',
  dueAt: '2026-10-21T12:00:00Z',
  requiresApproval: false,
  completedAt: null,
  approvedAt: null,
  cancelledAt: null,
  ...patch,
})

describe('taskStatus', () => {
  it('is Outstanding once sent and before it is due', () => expect(taskStatus(task(), now)).toBe('outstanding'))
  it('is Scheduled before its send time', () => expect(taskStatus(task({ sendAt: '2026-10-20T12:00:01Z' }), now)).toBe('scheduled'))
  it('is Past-Due from its due time', () => expect(taskStatus(task({ dueAt: now }), now)).toBe('past_due'))
  it('is Completed when done and no approval is needed', () => expect(taskStatus(task({ completedAt: now, dueAt: '2026-10-01T00:00:00Z' }), now)).toBe('completed'))
  it('waits for approval when it needs it, and is Completed once approved', () => {
    expect(taskStatus(task({ requiresApproval: true, completedAt: now }), now)).toBe('awaiting_approval')
    expect(taskStatus(task({ requiresApproval: true, completedAt: now, approvedAt: now }), now)).toBe('completed')
  })
  it('is Cancelled whatever else is true', () => expect(taskStatus(task({ cancelledAt: now, completedAt: now }), now)).toBe('cancelled'))
})

describe('isTimeZone', () => {
  it('knows real zones and refuses made-up ones', () => {
    expect(isTimeZone('America/Chicago')).toBe(true)
    expect(isTimeZone('Mars/Olympus')).toBe(false)
  })
})
