const FIRST_TAG = 'BPHS-0001'

interface Pattern {
  prefix: string
  /** How many tags have this prefix, and when the latest of them was added. */
  count: number
  newest: string
  /** The largest number after the prefix, and how many digits it was written with. */
  n: number
  width: number
}

/**
 * The next tag in the register's own pattern (BPHS-0150 -> BPHS-0151), offered as a hint. The pattern is the prefix most tags
 * share, so one odd tag with a large number does not take it over; between prefixes used equally often, the one used most recently.
 */
export function nextTag(assets: readonly { tag: string; createdAt: string }[]): string {
  const patterns = new Map<string, Pattern>()
  for (const { tag, createdAt } of assets) {
    const match = /^(.*?)(\d+)$/.exec(tag)
    if (!match) continue
    const prefix = match[1]!
    const n = Number(match[2])
    const pattern = patterns.get(prefix) ?? { prefix, count: 0, newest: '', n: -1, width: 0 }
    pattern.count += 1
    if (createdAt > pattern.newest) pattern.newest = createdAt
    if (n > pattern.n) {
      pattern.n = n
      pattern.width = match[2]!.length
    }
    patterns.set(prefix, pattern)
  }
  let best: Pattern | null = null
  for (const pattern of patterns.values()) {
    if (!best || pattern.count > best.count || (pattern.count === best.count && pattern.newest > best.newest))
      best = pattern
  }
  return best ? `${best.prefix}${String(best.n + 1).padStart(best.width, '0')}` : FIRST_TAG
}
