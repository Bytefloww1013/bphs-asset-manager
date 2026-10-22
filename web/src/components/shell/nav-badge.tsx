import { Clock, Lock } from 'lucide-react'
import { UnreadBadge } from '@/features/notifications/parts.tsx'
import type { NavEntry } from '@/lib/nav.ts'

/**
 * The one trailing slot of a sidebar entry: a count, a lock, or "Coming later", each with words for a screen reader. Where the
 * reason is already written under the entry's name, the glyph is decoration and the words are not repeated.
 */
export function NavBadge({ entry, reasonShown = false }: { entry: NavEntry; reasonShown?: boolean }) {
  if (entry.lock || entry.soon) {
    const Glyph = entry.lock ? Lock : Clock
    return (
      <>
        <Glyph className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        {!reasonShown && <span className="sr-only">{entry.lock ?? entry.soon}</span>}
      </>
    )
  }
  return <UnreadBadge count={entry.count} />
}
