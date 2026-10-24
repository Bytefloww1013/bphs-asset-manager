import { describe, expect, it } from 'vitest'
import type { Grantee } from '#shared/permissions.ts'
import reviews from './manifest.ts'

describe('the reviews manifest', () => {
  // Reviews never notify, and keep a log of their own: nothing about a review reaches the Audit Log.
  it('is confidential, declares no notification kinds and writes nothing to the Audit Log', () => {
    expect(reviews.confidential).toBe(true)
    expect('notificationKinds' in reviews).toBe(false)
    expect('employeeNotificationKinds' in reviews).toBe(false)
    expect('auditEntityTypes' in reviews).toBe(false)
  })

  it('keeps its place on the access form, after Maintenance', () => {
    expect(reviews.resources.map(({ key, order, workspace }) => ({ key, order, workspace }))).toEqual([
      { key: 'reviews', order: 40, workspace: true },
    ])
  })

  it('makes Reviews unavailable to an account that is nobody (R9)', () => {
    const [resource] = reviews.resources
    for (const employeeId of [null, 7, undefined])
      for (const firstAccount of [true, false, undefined]) {
        const user: Grantee = { access: {}, superAdmin: true, employeeId, firstAccount }
        expect(resource?.available?.(user)).toBe(!(employeeId === null && !firstAccount))
      }
  })
})
