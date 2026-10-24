import { notificationCountQuery } from '#foundation/notifications/web/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { Fragment, useId, useState } from 'react'
import { cn } from '@/lib/cn.ts'
import { areaById, areasFor, navFor, type NavEntry } from '@/lib/nav.ts'
import { useUser } from '@/lib/session.ts'
import { usePins } from '@/lib/sidebar-prefs.ts'
import type { Area } from '@/lib/workspace.ts'
import { NavBadge } from './nav-badge.tsx'

const entryStyle =
  'group flex h-9 items-center gap-2.5 rounded-control px-2.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface/70 hover:text-ink'
const currentStyle =
  'data-[status=active]:bg-surface data-[status=active]:text-ink data-[status=active]:shadow-panel data-[status=active]:ring-1 data-[status=active]:ring-line'

/**
 * An area's pages, as the pages panel and the phone drawer both draw them, so the two never differ. On Home, the pages
 * pinned from elsewhere follow, under Pinned.
 */
export function PageList({ area, onNavigate }: { area: Area; onNavigate?: () => void }) {
  const user = useUser()
  const { data: unread } = useQuery(notificationCountQuery)
  const groups = navFor(area, user, unread)
  const pathname = useLocation({ select: (location) => location.pathname })
  // An entry gives way to one beneath it: on /grievances/categories, Categories is the current page and Grievances is not.
  const yields = (to: string) =>
    groups.some((group) =>
      group.items.some(
        (other) => other.to && other.to !== to && other.to.startsWith(`${to}/`) && pathname.startsWith(other.to),
      ),
    )
  return (
    <nav aria-label="Pages" className="flex flex-col">
      {groups.map((group, index) => (
        <Fragment key={group.heading ?? index}>
          {index > 0 && !group.heading && <div role="presentation" className="mx-2.5 my-2 h-px bg-line" />}
          <div role="group" aria-label={group.heading} className={cn(index > 0 && group.heading && 'mt-1.5')}>
            {group.heading && (
              <p aria-hidden className="px-2.5 pb-1.5 pt-2.5 text-xs font-medium text-ink-3">
                {group.heading}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.label}>
                  {item.to && !item.soon ? (
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      activeOptions={{ exact: item.to === '/' || yields(item.to) }}
                      activeProps={{ 'aria-current': 'page' }}
                      className={cn(entryStyle, currentStyle)}
                    >
                      <EntryIcon item={item} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <NavBadge entry={item} />
                    </Link>
                  ) : (
                    <Unavailable item={item} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Fragment>
      ))}
      {area === 'me' && <Pinned onNavigate={onNavigate} />}
    </nav>
  )
}

function EntryIcon({ item }: { item: NavEntry }) {
  return (
    <item.icon
      className="size-[1.125rem] shrink-0 text-ink-3 group-data-[status=active]:text-workspace"
      aria-hidden
      strokeWidth={1.75}
    />
  )
}

/** Not a link and not a tab stop. role and aria-disabled let a screen reader announce it as an unavailable link, with the reason. */
function Unavailable({ item }: { item: NavEntry }) {
  return (
    <span
      role="link"
      aria-disabled="true"
      className="flex min-h-11 cursor-not-allowed items-center gap-2.5 rounded-control px-2.5 py-1 text-sm font-medium text-ink-3"
    >
      <item.icon className="size-[1.125rem] shrink-0 text-ink-4" aria-hidden strokeWidth={1.75} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.label}</span>
        <span className="text-xs font-normal">{item.soon}</span>
      </span>
      <NavBadge entry={item} reasonShown />
    </span>
  )
}

/** Home's pins: sidebar pages from the areas the account can still read, in the order they were pinned. */
function Pinned({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser()
  const pins = usePins()
  const [open, setOpen] = useState(true)
  const listId = useId()
  const pages = areasFor(user).flatMap((area) =>
    navFor(area.id, user).flatMap((group) =>
      group.items.flatMap((item) => (item.to && !item.soon ? [{ ...item, to: item.to, area: area.id }] : [])),
    ),
  )
  const pinned = pins.flatMap((pin) => pages.filter((page) => page.to === pin).slice(0, 1))
  return (
    <>
      <div role="presentation" className="mx-2.5 my-2 h-px bg-line" />
      <div className="px-1 pt-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="flex h-7 items-center gap-1 rounded-[0.375rem] px-1.5 text-xs font-medium text-ink-3 transition-colors hover:bg-surface/70 hover:text-ink"
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform duration-150', !open && '-rotate-90')}
            aria-hidden
          />
          Pinned
        </button>
      </div>
      <div id={listId} role="group" aria-label="Pinned" hidden={!open}>
        {pinned.length ? (
          <ul className="flex flex-col gap-0.5 pt-1">
            {pinned.map((page) => (
              <li key={page.to}>
                <Link to={page.to} onClick={onNavigate} className={entryStyle}>
                  <EntryIcon item={page} />
                  <span className="min-w-0 flex-1 truncate">{page.label}</span>
                  <span className="shrink-0 text-xs font-normal text-ink-3">{areaById(page.area).label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2.5 py-1 text-xs text-ink-3">Nothing pinned yet. Pin a page from its workspace.</p>
        )}
      </div>
    </>
  )
}
