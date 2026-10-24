import { UnreadBadge } from '#foundation/notifications/web/index.ts'
import { Clock } from 'lucide-react'
import type { NavEntry } from '@/lib/nav.ts'

/**
 * The one trailing slot of a sidebar entry: a count, or "Coming later", each with words for a screen reader. Where the reason is
 * already written under the entry's name, the glyph is decoration and the words are not repeated.
 */
export function NavBadge({ entry, reasonShown = false }: { entry: NavEntry; reasonShown?: boolean }) {
  if (entry.soon) {
    return (
      <>
        <Clock className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        {!reasonShown && <span className="sr-only">{entry.soon}</span>}
      </>
    )
  }
  return <UnreadBadge count={entry.count} />
}
