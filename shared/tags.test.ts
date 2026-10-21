import { describe, expect, it } from 'vitest'
import { nextTag } from './tags.ts'

const at = (tag: string, day = 1) => ({ tag, createdAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z` })

describe('nextTag', () => {
  it('starts an empty register at BPHS-0001, and ignores tags that do not end in a number', () => {
    expect(nextTag([])).toBe('BPHS-0001')
    expect(nextTag([at('SPARE'), at('LOANER-A')])).toBe('BPHS-0001')
  })

  it('counts on from the largest number, keeping the width', () => {
    expect(nextTag([at('BPHS-0007'), at('BPHS-0116'), at('BPHS-0042')])).toBe('BPHS-0117')
    expect(nextTag([at('BPHS-9999')])).toBe('BPHS-10000')
    expect(nextTag([at('1001'), at('1002')])).toBe('1003')
  })

  it('follows the prefix most tags share, not the largest number of any prefix', () => {
    const register = [
      ...Array.from({ length: 116 }, (_, i) => at(`BPHS-${String(i + 1).padStart(4, '0')}`)),
      at('OTHER-USER-4499', 20),
    ]
    expect(nextTag(register)).toBe('BPHS-0117')
  })

  it('between prefixes used equally often, follows the one used most recently', () => {
    expect(nextTag([at('OLD-0009', 1), at('NEW-0003', 2)])).toBe('NEW-0004')
    expect(nextTag([at('NEW-0003', 2), at('OLD-0009', 1)])).toBe('NEW-0004')
  })
})
