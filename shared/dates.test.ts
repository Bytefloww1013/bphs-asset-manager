import { describe, expect, it } from 'vitest'
import { formatUsDate } from './dates.ts'

describe('formatUsDate', () => {
  it("reads Zoho's day-first dates, and its Added Time on a 12-hour clock", () => {
    expect(formatUsDate('05-10-2026')).toBe('10/05/2026')
    expect(formatUsDate('15-Oct-2026')).toBe('10/15/2026')
    expect(formatUsDate('15-10-2026 12:40:00')).toBe('10/15/2026 12:40 PM')
    expect(formatUsDate('15-10-2026 00:05:00')).toBe('10/15/2026 12:05 AM')
    expect(formatUsDate('15-10-2026 09:30:00')).toBe('10/15/2026 9:30 AM')
  })

  it('reads a date entered here', () => {
    expect(formatUsDate('2026-10-05')).toBe('10/05/2026')
  })

  it('shows anything else as written', () => {
    expect(formatUsDate(null)).toBeNull()
    expect(formatUsDate('31-02-2026')).toBe('31-02-2026')
    expect(formatUsDate('15-10-2026 25:00:00')).toBe('15-10-2026 25:00:00')
    expect(formatUsDate('01-Foo-2026')).toBe('01-Foo-2026')
    expect(formatUsDate('last Tuesday')).toBe('last Tuesday')
  })
})
