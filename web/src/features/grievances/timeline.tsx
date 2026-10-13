import { Check, ChevronDown, Diamond, Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { type GrievanceEntryKind, grievanceEntryCode, grievanceEntryKindLabel } from '@shared/constants.ts'
import type { GrievanceDetail, GrievanceEntry } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { GrievanceStatusBadge } from '@/features/grievances/status.tsx'
import { cn } from '@/lib/cn.ts'
import { formatDate, formatDateTime, plural } from '@/lib/format.ts'

type Show = 'all' | 'action' | 'event'
type Order = 'newest' | 'oldest'

/** How many entries are drawn at a time. The rest are drawn as the reader nears the end of the list. */
const PAGE = 25
/** An entry written down more than a day after it happened says so. */
const BACK_DATED_MS = 24 * 60 * 60_000
const ORDER_KEY = 'grievance-timeline-order'

const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' })
const anchor = (seq: number) => `entry-${grievanceEntryCode(seq)}`

function savedOrder(): Order {
  try {
    return localStorage.getItem(ORDER_KEY) === 'oldest' ? 'oldest' : 'newest'
  } catch {
    return 'newest'
  }
}

/** Each type has its own shape as well as its own word, so the types can be told apart without colour. */
export function EntryMarker({ kind, className }: { kind: GrievanceEntryKind; className?: string }) {
  const box = cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-surface', className)
  if (kind === 'system') {
    return (
      <span className={cn('mt-0.5', box)} aria-hidden>
        <span className="size-2 rounded-full bg-ink-4" />
      </span>
    )
  }
  if (kind === 'action') {
    return (
      <span className={cn('mt-2', box, 'bg-ink-2 text-surface')} aria-hidden>
        <Check className="size-3.5" strokeWidth={2.75} />
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

function Entry({ entry, last, onGoTo, link }: { entry: GrievanceEntry; last: boolean; onGoTo: (seq: number) => void; link?: (entry: GrievanceEntry, children: ReactNode) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const code = grievanceEntryCode(entry.seq)
  const automatic = entry.kind === 'system'
  const backDated = !automatic && entry.kind !== 'correction' && Date.parse(entry.recordedAt) - Date.parse(entry.occurredAt) > BACK_DATED_MS
  return (
    <li id={anchor(entry.seq)} tabIndex={-1} className="group/entry relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-1 focus-visible:outline-none print:break-inside-avoid">
      {/* The rail. It stops at the last entry's marker. */}
      <span className={cn('absolute left-[calc(0.75rem-1px)] top-0 border-l-[1.5px] border-line-strong', last ? 'h-3' : 'bottom-0')} aria-hidden />
      <EntryMarker kind={entry.kind} />
      {automatic ? (
        <div className="px-2.5 py-1 text-[0.8125rem] text-ink-3 group-focus-visible/entry:bg-accent-soft">
          <p>
            <Mono>{code}</Mono> · <span className="text-xs font-semibold uppercase tracking-wide">{grievanceEntryKindLabel(entry.kind)}</span> · {entry.title} ·{' '}
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
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{grievanceEntryKindLabel(entry.kind)}</span>
            {entry.corrects !== null && <Chip onClick={() => onGoTo(entry.corrects!)}>Corrects {grievanceEntryCode(entry.corrects)}</Chip>}
            {entry.correctedBy.map((seq) => (
              <Chip key={seq} onClick={() => onGoTo(seq)}>
                Corrected by {grievanceEntryCode(seq)}
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
                aria-controls={`${anchor(entry.seq)}-details`}
                onClick={() => setOpen(!open)}
                className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline print:hidden"
              >
                {open ? 'Hide details' : 'Details'}
                <ChevronDown className={cn('size-3.5', open && 'rotate-180')} aria-hidden />
                <span className="sr-only"> of {code}</span>
              </button>
            )}
          </p>
          {/* Printed, every entry is open: paper has no button to press. */}
          {entry.bodyHtml && (
            <div id={`${anchor(entry.seq)}-details`} className={cn('mt-2 max-w-[70ch] print:block', !open && 'hidden')}>
              <RichTextView html={entry.bodyHtml} />
            </div>
          )}
        </article>
      )}
    </li>
  )
}

/**
 * A grievance's timeline: one rail through the case, in the order things happened, with the newest first unless the reader turns it
 * round. Every entry of the grievance is passed in; only the drawing is done a page at a time.
 */
export function Timeline({ entries, link }: { entries: GrievanceEntry[]; link?: (entry: GrievanceEntry, children: ReactNode) => ReactNode }) {
  const [show, setShow] = useState<Show>('all')
  const [hideAutomatic, setHideAutomatic] = useState(false)
  const [order, setOrder] = useState<Order>(savedOrder)
  const [drawn, setDrawn] = useState(PAGE)
  const [goTo, setGoTo] = useState<number | null>(null)
  const more = useRef<HTMLButtonElement>(null)

  const rows = useMemo(() => {
    const kindOf = new Map(entries.map((entry) => [entry.seq, entry.kind]))
    // A correction is shown with the type of what it corrects, so filtering never hides that an entry was corrected.
    const matches = (entry: GrievanceEntry) => (show === 'all' ? !(hideAutomatic && entry.kind === 'system') : (entry.corrects === null ? entry.kind : kindOf.get(entry.corrects)) === show)
    const sign = order === 'newest' ? -1 : 1
    return entries.filter(matches).sort((a, b) => sign * (Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq))
  }, [entries, show, hideAutomatic, order])

  const visible = rows.slice(0, drawn)
  const remaining = rows.length - visible.length
  const months: { name: string; entries: GrievanceEntry[] }[] = []
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
    const target = document.getElementById(anchor(goTo))
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
    setGoTo(null)
  }, [goTo, visible.length])

  const follow = (seq: number) => {
    setShow('all')
    setDrawn(entries.length)
    setGoTo(seq)
  }
  const reorder = (next: Order) => {
    setOrder(next)
    setDrawn(PAGE)
    try {
      localStorage.setItem(ORDER_KEY, next)
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
          options={[
            ['all', 'All'],
            ['action', 'Actions'],
            ['event', 'Events'],
          ]}
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
        <p className="px-5 py-8 text-center text-sm text-ink-3">No {show === 'action' ? 'actions' : show === 'event' ? 'events' : 'entries'} on this timeline.</p>
      ) : (
        <div className="px-5 pb-5 pt-1">
          {months.map((month, m) => (
            <section key={month.name} aria-label={month.name}>
              <h3 className="pb-1.5 pl-9 pt-4 text-xs font-semibold tracking-wide text-ink-3">{month.name}</h3>
              <ol>
                {month.entries.map((entry, i) => (
                  <Entry key={entry.id} entry={entry} link={link} onGoTo={follow} last={remaining === 0 && m === months.length - 1 && i === month.entries.length - 1} />
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

/** The grievance at a glance. It stays beside the timeline on a wide screen while the timeline scrolls. */
export function TimelineSummary({ grievance, entries }: { grievance: GrievanceDetail; entries: GrievanceEntry[] }) {
  const count = (kind: GrievanceEntryKind) => entries.filter((entry) => entry.kind === kind).length
  const times = entries.map((entry) => entry.occurredAt).sort()
  const facts: [string, ReactNode][] = [
    ['Status', <GrievanceStatusBadge status={grievance.status} />],
    ['Owner', grievance.owner.name],
    ['Grievance date', <Mono>{grievance.dateMade}</Mono>],
    [
      'Entries',
      <>
        {entries.length}
        <span className="block text-xs font-normal text-ink-3">
          {plural(count('action'), 'action')}, {plural(count('event'), 'event')}, {plural(count('correction'), 'correction')}, {count('system')} automatic
        </span>
      </>,
    ],
    ['First activity', <Mono>{formatDateTime(times[0])}</Mono>],
    ['Latest activity', <Mono>{formatDateTime(times.at(-1))}</Mono>],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 lg:grid-cols-1">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-ink-3">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
