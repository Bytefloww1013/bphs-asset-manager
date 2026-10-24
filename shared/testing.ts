// For the kernel's tests that pin today's modules: a module added later adds its own entries to a list (issue #23's
// proof, docs/verify/new-module-proof.sh), but leaves today's as they were, so these tests need no edit for it.
import { expect } from 'vitest'

/** Each entry in `today` is in `list`, in this order. Entries the other modules add, wherever they fall, are left out. */
export function expectToday<T>(list: readonly T[], today: readonly T[]) {
  expect(list.filter((entry) => today.includes(entry))).toEqual(today)
}
