import { useLocation } from '@tanstack/react-router'
import { Command, Lock, Pin, PinOff, Search } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/cn.ts'
import { areaById, jumpIndex } from '@/lib/nav.ts'
import { useUser } from '@/lib/session.ts'
import { MAX_PINS, togglePin, usePins } from '@/lib/sidebar-prefs.ts'
import type { Area } from '@/lib/workspace.ts'
import { Tooltip } from '../ui/tooltip.tsx'
import { PageList } from './page-list.tsx'

// Mac keyboards say Command where everyone else says Ctrl. The panel only shows on a wide window, so a desktop check is enough.
const onMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

/**
 * The area's pages beside the rail: its name, the quick switcher's button and the page groups. Collapsed, it shrinks to
 * nothing and goes inert, so its links leave the Tab order as well as the screen.
 */
export function PagesPanel({ area, collapsed, onJump }: { area: Area; collapsed: boolean; onJump: () => void }) {
  const { name, confidential } = areaById(area)
  const content = useSettleIn(area, collapsed)
  return (
    <div
      id="pages-panel"
      inert={collapsed}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r bg-sidebar transition-[width,border-color] duration-[280ms] ease-out-expo motion-reduce:transition-none lg:block',
        collapsed ? 'w-0 border-r-transparent' : 'w-[14.75rem] border-line',
      )}
    >
      {/* Fixed width, so the pages are clipped rather than squeezed while the panel opens or closes. */}
      <div ref={content} className="flex h-full w-[14.75rem] flex-col">
        <div className="flex items-start gap-2 px-4 pb-2.5 pt-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-md font-semibold tracking-[-0.01em] text-ink">{name}</p>
            {confidential && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-workspace">
                <Lock className="size-3.5" aria-hidden />
                Confidential
              </p>
            )}
          </div>
          {area !== 'me' && <PinButton />}
        </div>
        <button
          type="button"
          onClick={onJump}
          aria-label="Jump to…"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          className="mx-3 mb-1.5 flex h-[2.125rem] items-center gap-2 rounded-control bg-surface pl-2.5 pr-2 text-left text-sm text-ink-3 ring-1 ring-line transition-shadow duration-150 hover:text-ink-2 hover:ring-line-strong"
        >
          <Search className="size-[0.9375rem] shrink-0" aria-hidden strokeWidth={1.75} />
          <span className="flex-1">Jump to…</span>
          <kbd
            aria-hidden
            className="flex items-center gap-0.5 rounded-[5px] bg-sunken px-[5px] py-px font-sans text-xs text-ink-3 ring-1 ring-inset ring-line"
          >
            {onMac ? <Command className="size-3" /> : 'Ctrl'} K
          </kbd>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
          <PageList area={area} />
        </div>
      </div>
    </div>
  )
}

/**
 * Pins the page open now to Home, or takes it off. Only a sidebar page the account can open can be pinned: a record such as
 * /assets/LT-0042 has no button, so nothing from inside a workspace is kept in the browser.
 */
function PinButton() {
  const user = useUser()
  const pins = usePins()
  const pathname = useLocation({ select: (location) => location.pathname })
  const page = jumpIndex(user).find((entry) => entry.to === pathname)
  if (!page) return null
  const pinned = pins.includes(page.to)
  // Home holds eight pins at most. Past that the button stays in the Tab order and says why it does nothing.
  const full = !pinned && pins.length >= MAX_PINS
  const label = pinned ? 'Unpin this page' : 'Pin this page'
  const Icon = pinned ? PinOff : Pin
  return (
    <Tooltip content={full ? `Home holds ${MAX_PINS} pins at most. Unpin one first.` : label} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-disabled={full || undefined}
        onClick={() => {
          if (!full) togglePin(page.to)
        }}
        className="-mr-1 grid size-[1.625rem] shrink-0 place-items-center rounded-[0.375rem] text-ink-3 transition-colors duration-150 hover:bg-surface/70 hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:text-ink-4 aria-disabled:hover:bg-transparent"
      >
        <Icon className="size-[0.9375rem]" aria-hidden strokeWidth={1.75} />
      </button>
    </Tooltip>
  )
}

/**
 * The panel's one authored motion: on a change of area (not on first load) its contents settle in from the left, so the
 * eye reads the new list as a new place. Skipped when reduced motion is asked for, and while the panel is closed.
 */
function useSettleIn(area: Area, collapsed: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef(area)
  // A layout effect, so the first frame of the new list is already the animation's first frame and never flashes in.
  useLayoutEffect(() => {
    if (shown.current === area) return
    shown.current = area
    if (collapsed || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate(
      [
        { opacity: 0, transform: 'translateX(-8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  }, [area, collapsed])
  return ref
}
