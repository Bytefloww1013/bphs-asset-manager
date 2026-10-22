import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn.ts'
import { areaById, jumpIndex, type JumpEntry } from '@/lib/nav.ts'
import { useUser } from '@/lib/session.ts'
import { Kbd } from '../ui/layout.tsx'

/**
 * Every word typed has to appear in the page, its group or its area. Pages whose name starts with what is typed come first,
 * then pages whose name contains it, then the rest; the sidebar order holds within each.
 */
function rankPages(pages: JumpEntry[], query: string): JumpEntry[] {
  const text = query.trim().toLowerCase()
  if (!text) return pages
  const words = text.split(/\s+/)
  const rank = (label: string) => (label.startsWith(text) ? 0 : label.includes(text) ? 1 : 2)
  return pages
    .filter((page) => {
      const haystack = `${page.label} ${page.group ?? ''} ${page.areaName}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
    .map((page) => ({ page, rank: rank(page.label.toLowerCase()) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ page }) => page)
}

/**
 * Ctrl K (Cmd K on a Mac) opens the quick switcher. It is the app's one global shortcut, so it works from inside a field too.
 */
export function useQuickSwitcherShortcut(onOpen: () => void) {
  const latest = useRef(onOpen)
  useEffect(() => {
    latest.current = onOpen
  }, [onOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'k') return
      // The browser's own Ctrl K would focus its search bar.
      event.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Jump to any sidebar page the account can open. Pages only: no actions, no records, no counts, and nothing is remembered. */
export function QuickSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-ink/35" />
        {/* Mounted only while open, so each opening starts from an empty field and the first page. */}
        <Switcher onDone={() => onOpenChange(false)} />
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Switcher({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const router = useRouter()
  const listId = useId()
  const pages = useMemo(() => jumpIndex(user), [user])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = useMemo(() => rankPages(pages, query), [pages, query])
  const pointerMoved = useRef(false)
  const pointerAt = useRef('')

  // Keys and typing move the highlight, so the list scrolls to keep it in view. The pointer's row is already under it, and
  // scrolling then would fight the wheel.
  useEffect(() => {
    const byPointer = pointerMoved.current
    pointerMoved.current = false
    if (!byPointer) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, active, query])

  const go = (page: JumpEntry | undefined) => {
    if (!page) return
    onDone()
    void router.navigate({ to: page.to })
  }

  const move = (step: number) => {
    if (matches.length === 0) return
    setActive((index) => (index + step + matches.length) % matches.length)
  }

  return (
    <Dialog.Content
      // The field takes focus itself; Radix would otherwise focus the first thing it finds.
      onOpenAutoFocus={(event) => event.preventDefault()}
      // One click handler for every row. The rows never take focus: the field keeps it and takes the keys, as the APG combobox does.
      onClick={(event) => {
        const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[role=option]') : null
        if (row) go(matches[Number(row.dataset.index)])
      }}
      className="fixed left-1/2 top-[12vh] z-[60] flex max-h-[76vh] w-[calc(100%-2rem)] max-w-[35rem] -translate-x-1/2 animate-pop-in flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-pop outline-none"
    >
      <Dialog.Title className="sr-only">Jump to a page</Dialog.Title>
      <Dialog.Description className="sr-only">
        Type to narrow the pages. Use the arrow keys to move, Enter to open the page, and Escape to close.
      </Dialog.Description>
      <div className="flex h-[3.25rem] shrink-0 items-center gap-2.5 border-b border-line px-3.5 text-ink-3">
        <Search className="size-[18px] shrink-0" aria-hidden />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={matches.length > 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label="Jump to a page"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Jump to a page…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              go(matches[active])
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Pages"
        className="m-0 flex min-h-0 max-h-[22.5rem] list-none scroll-py-1.5 flex-col overflow-y-auto p-1.5"
      >
        {matches.map((page, index) => {
          const area = areaById(page.area)
          const selected = index === active
          return (
            <li
              key={page.to}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={selected}
              onMouseMove={(event) => {
                // A list that scrolls under a resting pointer makes some browsers send a mousemove from the pointer's own spot.
                // Only a pointer that has moved takes the highlight.
                const at = `${event.clientX},${event.clientY}`
                if (at === pointerAt.current) return
                pointerAt.current = at
                if (selected) return
                pointerMoved.current = true
                setActive(index)
              }}
              // Keep focus in the field, so the keys still work after a click.
              onMouseDown={(event) => event.preventDefault()}
              className={cn(
                'flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-sm',
                selected ? 'bg-accent-soft text-ink' : 'text-ink-2',
              )}
            >
              <area.icon className={cn('size-4 shrink-0', selected ? 'text-accent' : 'text-ink-3')} aria-hidden />
              <span className="min-w-0 truncate font-medium">{page.label}</span>
              <span className="ml-auto shrink-0 truncate pl-2 text-xs text-ink-3">
                {page.group && page.group !== page.areaName ? `${page.areaName} · ${page.group}` : page.areaName}
              </span>
            </li>
          )
        })}
      </ul>
      {matches.length === 0 && <p className="px-3.5 pb-4 pt-2.5 text-sm text-ink-3">No page matches.</p>}
      <div aria-hidden className="flex shrink-0 gap-3.5 border-t border-line bg-canvas px-3.5 py-2 text-xs text-ink-3">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
      </div>
    </Dialog.Content>
  )
}
