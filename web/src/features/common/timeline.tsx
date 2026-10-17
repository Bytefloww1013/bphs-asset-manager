import { Check, ChevronDown, Diamond, Flag, Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { GrievanceEntry } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { cn } from '@/lib/cn.ts'
import { formatDate, formatDateTime, plural } from '@/lib/format.ts'

/**
 * What the timeline draws of an entry. A grievance's entries have this shape, and so do a review's. A review's CAP is drawn among
 * them with a `code` of its own, CAP01, which then stands in for the entry number.
 */
export type TimelineEntry = Omit<GrievanceEntry, 'kind'> & { kind: string; code?: string }

type Order = 'newest' | 'oldest'

/** How many entries are drawn at a time. The rest are drawn as the reader nears the end of the list. */
const PAGE = 25
/** An entry written down more than a day after it happened says so. */
const BACK_DATED_MS = 24 * 60 * 60_000

const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })
const anchor = (code: string) => `entry-${code}`

function savedOrder(key: string): Order {
  try {
    return localStorage.getItem(key) === 'oldest' ? 'oldest' : 'newest'
  } catch {
    return 'newest'
  }
}

/** Each type has its own shape as well as its own word, so the types can be told apart without colour. */
export function EntryMarker({ kind, className }: { kind: string; className?: string }) {
  const box = cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-surface', className)
  if (kind === 'system') {
    return (
      <span className={cn('mt-0.5', box)} aria-hidden>
        <span className="size-2 rounded-full bg-ink-4" />
      </span>
    )
  }
  // A review's update is drawn as a grievance's action is: something someone did.
  if (kind === 'action' || kind === 'update') {
    return (
      <span className={cn('mt-2', box, 'bg-ink-2 text-surface')} aria-hidden>
        <Check className="size-3.5" strokeWidth={2.75} />
      </span>
    )
  }
  if (kind === 'cap') {
    return (
      <span className={cn('mt-2', box, 'rounded-md border-[1.5px] border-ink-2 text-ink-2')} aria-hidden>
        <Flag className="size-3.5" strokeWidth={2.25} />
      </span>
    )
  }
  if (kind === 'event') {
    return (
      <span className={cn('mt-2', box, 'text-ink-2')} aria-hidden>
        <Diamond className="size-5" strokeWidth={2} />
      </span>
    )
  }
  return (
    <span className={cn('mt-2', box, 'border-[1.5px] border-dashed border-ink-3 text-ink-2')} aria-hidden>
      <Pencil className="size-3" strokeWidth={2} />
    </span>
  )
}

function Chip({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const style = 'rounded-md border border-line-strong bg-sunken px-1.5 text-xs text-ink-2'
  if (!onClick) return <span className={style}>{children}</span>
  return (
    <button type="button" onClick={onClick} className={cn(style, 'border-dashed hover:border-accent-line hover:bg-accent-soft hover:text-accent')}>
      {children}
    </button>
  )
}

function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-control border border-line-strong">
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            'border-l border-line px-2.5 py-1 text-sm first:border-l-0 focus-visible:relative',
            option === value ? 'bg-accent-soft font-medium text-accent' : 'bg-surface text-ink-2 hover:bg-sunken',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

interface TimelineProps<E extends TimelineEntry> {
  entries: E[]
  /** The types the reader can narrow the timeline to, as the filter names them: `['action', 'Actions']`. */
  filters: [kind: E['kind'], label: string][]
  kindLabel: (kind: E['kind']) => string
  /** How an entry's number is shown, such as E05. */
  entryCode: (seq: number) => string
  /** Where this browser keeps the reader's choice of order. */
  orderKey: string
  link?: (entry: E, children: ReactNode) => ReactNode
  /** What can be done with an entry the app did not write, shown after who documented it. */
  actions?: (entry: E) => ReactNode
  /** More about an entry the app did not write, shown beside its type: a CAP's status, or the CAP an update is about. */
  tags?: (entry: E) => ReactNode
}

function Entry<E extends TimelineEntry>({
  entry,
  last,
  onGoTo,
  link,
  actions,
  tags,
  kindLabel,
  entryCode,
}: Pick<TimelineProps<E>, 'link' | 'actions' | 'tags' | 'kindLabel' | 'entryCode'> & { entry: E; last: boolean; onGoTo: (seq: number) => void }) {
  const [open, setOpen] = useState(false)
  const code = entry.code ?? entryCode(entry.seq)
  const automatic = entry.kind === 'system'
  const backDated = !automatic && entry.kind !== 'correction' && Date.parse(entry.recordedAt) - Date.parse(entry.occurredAt) > BACK_DATED_MS
  return (
    <li id={anchor(code)} tabIndex={-1} className="group/entry relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-1 focus-visible:outline-none print:break-inside-avoid">
      {/* The rail. It stops at the last entry's marker. */}
      <span className={cn('absolute left-[calc(0.75rem-1px)] top-0 border-l-[1.5px] border-line-strong', last ? 'h-3' : 'bottom-0')} aria-hidden />
      <EntryMarker kind={entry.kind} />
      {automatic ? (
        <div className="px-2.5 py-1 text-[0.8125rem] text-ink-3 group-focus-visible/entry:bg-accent-soft">
          <p>
            <Mono>{code}</Mono> · <span className="text-xs font-semibold uppercase tracking-wide">{kindLabel(entry.kind)}</span> · {entry.title} ·{' '}
            <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
          </p>
          {/* The note or reason given with a change. It is short, and it is why the change was made, so it is never folded away. */}
          {entry.bodyHtml && (
            <div className="mt-1 max-w-[70ch] border-l-2 border-line-strong pl-3 text-ink-2">
              <RichTextView html={entry.bodyHtml} />
              <p className="mt-0.5 text-xs text-ink-3">{entry.documentedBy}</p>
            </div>
          )}
        </div>
      ) : (
        <article
          className={cn(
            'rounded-control px-2.5 py-2 group-focus-visible/entry:bg-accent-soft',
            // A corrected entry keeps every word it had; the tint and the chip say there is more to read.
            entry.correctedBy.length > 0 && 'bg-warn-soft shadow-[inset_3px_0_0_var(--color-warn-line)]',
          )}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Mono className="text-xs text-ink-3">{code}</Mono>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{kindLabel(entry.kind)}</span>
            {tags?.(entry)}
            {entry.corrects !== null && <Chip onClick={() => onGoTo(entry.corrects!)}>Corrects {entryCode(entry.corrects)}</Chip>}
            {entry.correctedBy.map((seq) => (
              <Chip key={seq} onClick={() => onGoTo(seq)}>
                Corrected by {entryCode(seq)}
              </Chip>
            ))}
            {backDated && <Chip>Recorded {formatDate(entry.recordedAt)}</Chip>}
            <time dateTime={entry.occurredAt} className="ml-auto text-xs text-ink-3">
              {formatDateTime(entry.occurredAt)}
            </time>
          </div>
          <h4 className="mt-0.5 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{link ? link(entry, entry.title) : entry.title}</h4>
          <p className="text-sm text-ink-2 [overflow-wrap:anywhere]">{entry.shortDescription}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
            <span>Documented by {entry.documentedBy}</span>
            {entry.bodyHtml && (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${anchor(code)}-details`}
                onClick={() => setOpen(!open)}
                className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline print:hidden"
              >
                {open ? 'Hide details' : 'Details'}
                <ChevronDown className={cn('size-3.5', open && 'rotate-180')} aria-hidden />
                <span className="sr-only"> of {code}</span>
              </button>
            )}
            {actions?.(entry)}
          </p>
          {/* Printed, every entry is open: paper has no button to press. */}
          {entry.bodyHtml && (
            <div id={`${anchor(code)}-details`} className={cn('mt-2 max-w-[70ch] print:block', !open && 'hidden')}>
              <RichTextView html={entry.bodyHtml} />
            </div>
          )}
        </article>
      )}
    </li>
  )
}

/**
 * A record's timeline: one rail through the case, in the order things happened, with the newest first unless the reader turns it
 * round. Every entry of the record is passed in; only the drawing is done a page at a time.
 */
export function Timeline<E extends TimelineEntry>({ entries, filters, kindLabel, entryCode, orderKey, link, actions, tags }: TimelineProps<E>) {
  const [show, setShow] = useState<'all' | E['kind']>('all')
  const [hideAutomatic, setHideAutomatic] = useState(false)
  const [order, setOrder] = useState<Order>(() => savedOrder(orderKey))
  const [drawn, setDrawn] = useState(PAGE)
  const [goTo, setGoTo] = useState<number | null>(null)
  const more = useRef<HTMLButtonElement>(null)

  const rows = useMemo(() => {
    // Only entries can be corrected; a CAP, which has a code of its own, never is.
    const kindOf = new Map(entries.filter((entry) => !entry.code).map((entry) => [entry.seq, entry.kind]))
    // A correction is shown with the type of what it corrects, so filtering never hides that an entry was corrected.
    const matches = (entry: E) => (show === 'all' ? !(hideAutomatic && entry.kind === 'system') : (entry.corrects === null ? entry.kind : kindOf.get(entry.corrects)) === show)
    const sign = order === 'newest' ? -1 : 1
    return entries.filter(matches).sort((a, b) => sign * (Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq))
  }, [entries, show, hideAutomatic, order])

  const visible = rows.slice(0, drawn)
  const remaining = rows.length - visible.length
  const months: { name: string; entries: E[] }[] = []
  for (const entry of visible) {
    const name = monthName.format(new Date(entry.occurredAt))
    if (months.at(-1)?.name === name) months.at(-1)!.entries.push(entry)
    else months.push({ name, entries: [entry] })
  }

  // Nearing the end of what is drawn draws the next page. The button does the same for anyone not scrolling.
  useEffect(() => {
    const button = more.current
    if (!button || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((seen) => seen.some((one) => one.isIntersecting) && setDrawn((n) => n + PAGE), { rootMargin: '600px' })
    observer.observe(button)
    return () => observer.disconnect()
  }, [remaining])

  // Following a chip to another entry: it is drawn first if it was not, then scrolled to and given focus.
  useEffect(() => {
    if (goTo === null) return
    const target = document.getElementById(anchor(entryCode(goTo)))
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
    setGoTo(null)
  }, [goTo, visible.length, entryCode])

  const follow = (seq: number) => {
    setShow('all')
    setDrawn(entries.length)
    setGoTo(seq)
  }
  const reorder = (next: Order) => {
    setOrder(next)
    setDrawn(PAGE)
    try {
      localStorage.setItem(orderKey, next)
    } catch {
      // The order is still changed for this visit.
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2.5 print:hidden">
        <Segments
          label="Show"
          value={show}
          onChange={(next) => {
            setShow(next)
            setDrawn(PAGE)
          }}
          options={[['all', 'All'], ...filters]}
        />
        <label className={cn('inline-flex items-center gap-1.5 text-sm text-ink-2', show !== 'all' && 'text-ink-4')}>
          <input type="checkbox" className="accent-(--color-accent)" checked={hideAutomatic || show !== 'all'} disabled={show !== 'all'} onChange={(event) => setHideAutomatic(event.target.checked)} />
          Hide automatic
        </label>
        <div className="ml-auto">
          <Segments
            label="Order"
            value={order}
            onChange={reorder}
            options={[
              ['newest', 'Newest first'],
              ['oldest', 'Oldest first'],
            ]}
          />
        </div>
      </div>
      <p className="sr-only" role="status">
        Showing {visible.length} of {plural(rows.length, 'entry', 'entries')}, {order === 'newest' ? 'newest' : 'oldest'} first.
      </p>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">No {show === 'all' ? 'entries' : filters.find(([kind]) => kind === show)?.[1].toLowerCase()} on this timeline.</p>
      ) : (
        <div className="px-5 pb-5 pt-1">
          {months.map((month, m) => (
            <section key={month.name} aria-label={month.name}>
              <h3 className="pb-1.5 pl-9 pt-4 text-xs font-semibold tracking-wide text-ink-3">{month.name}</h3>
              <ol>
                {month.entries.map((entry, i) => (
                  <Entry key={entry.code ?? entry.id} entry={entry} link={link} actions={actions} tags={tags} kindLabel={kindLabel} entryCode={entryCode} onGoTo={follow} last={remaining === 0 && m === months.length - 1 && i === month.entries.length - 1} />
                ))}
              </ol>
            </section>
          ))}
          {remaining > 0 && (
            <div className="pl-9 pt-3 print:hidden">
              <Button ref={more} variant="secondary" size="sm" onClick={() => setDrawn((n) => n + PAGE)}>
                Show {Math.min(PAGE, remaining)} more ({remaining} not shown)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
