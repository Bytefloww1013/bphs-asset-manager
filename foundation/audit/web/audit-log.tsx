import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, ScrollText } from 'lucide-react'
import { useEffect, useEffectEvent, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid, type GridFeatures } from '@/components/data-grid/grid.ts'
import { IconButton, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { DateInput, FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { formatDateTime, startOfLocalDay } from '@/lib/format.ts'
import { useSearchBox } from '@/lib/hooks.ts'
import type { AuditParams } from './queries.ts'

/** What both audit logs, the asset side's and the Grievance Audit Log, share: one page, over a log of their own. */
const PAGE = 50
// The longest search the server accepts.
const MAX_SEARCH = 100

export interface AuditSearch<A extends string> {
  action?: A
  from?: string
  to?: string
  q?: string
  page?: number
}

interface LogEntry<A extends string> {
  id: number
  occurredAt: string
  actor: string
  action: A
  details: string
}

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && startOfLocalDay(value) !== null

/** The route's `validateSearch`, for a log that records `actions`. */
export const auditSearch =
  <A extends string>(actions: readonly A[]) =>
  (search: Record<string, unknown>): AuditSearch<A> => ({
    action: actions.includes(search.action as A) ? (search.action as A) : undefined,
    from: isDate(search.from) ? search.from : undefined,
    to: isDate(search.to) ? search.to : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, MAX_SEARCH) : undefined,
    page: Number(search.page) > 1 ? Math.floor(Number(search.page)) : undefined,
  })

/** The columns of a log: when, who, the action as `badge` draws it, the record as `record` names it, and the details. */
export function auditColumns<E extends LogEntry<string>>({
  badge,
  record,
}: {
  badge: (entry: E) => ReactNode
  record: (entry: E) => ReactNode
}): ColumnDef<GridFeatures, E, any>[] {
  const c = columnsFor<E>()
  return [
    c.accessor((row) => row.occurredAt, {
      id: 'occurredAt',
      header: 'Occurred at',
      // The User, Record and Details columns each drop out below a width. Whatever has dropped out is shown under the time, so an
      // entry can be read in full on any screen.
      cell: (info) => {
        const entry = info.row.original
        return (
          <div className="leading-5">
            <Mono className="whitespace-nowrap text-ink-2">{formatDateTime(info.getValue())}</Mono>
            <div className="text-xs text-ink-3 md:hidden">
              <span className="font-medium text-ink-2 sm:hidden">{entry.actor} · </span>
              <Mono className="text-xs">{record(entry)}</Mono>
            </div>
            {entry.details && (
              <div className="text-xs text-ink-2 [overflow-wrap:anywhere] lg:hidden">{entry.details}</div>
            )}
          </div>
        )
      },
      enableSorting: false,
    }),
    c.accessor((row) => row.actor, {
      id: 'actor',
      header: 'User',
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      enableSorting: false,
      meta: { hideBelow: 'sm', cellClassName: 'max-lg:align-top max-lg:pt-2.5' },
    }),
    c.display({
      id: 'action',
      header: 'Action',
      cell: (info) => badge(info.row.original),
      meta: { cellClassName: 'max-lg:align-top max-lg:pt-2.5' },
    }),
    c.display({
      id: 'entity',
      header: 'Record',
      cell: (info) => <Mono className="whitespace-nowrap text-ink-2">{record(info.row.original)}</Mono>,
      meta: { hideBelow: 'md', cellClassName: 'max-lg:align-top max-lg:pt-2.5' },
    }),
    // Wrapped, not cut short: an entry names the record and each old and new value, and the log is where that is read.
    c.accessor((row) => row.details, {
      id: 'details',
      header: 'Details',
      cell: (info) => (
        <span className="block max-w-[44rem] leading-5 text-ink-2 [overflow-wrap:anywhere]">
          {info.getValue() || '—'}
        </span>
      ),
      enableSorting: false,
      meta: { hideBelow: 'lg' },
    }),
  ]
}

const getRowId = (row: { id: number }) => String(row.id)

export function AuditLog<A extends string, E extends LogEntry<A>>({
  title,
  description,
  footnote,
  actions,
  actionLabel,
  columns,
  query,
  csvUrl,
  search,
  onSearch,
}: {
  title: string
  description: string
  footnote: ReactNode
  actions: readonly A[]
  actionLabel: (action: A) => string
  columns: ColumnDef<GridFeatures, E, any>[]
  query: (
    params: AuditParams,
  ) => UseQueryOptions<{ total: number; entries: E[] }, Error, { total: number; entries: E[] }, any>
  csvUrl: (params: Omit<AuditParams, 'limit' | 'offset'>) => string
  search: AuditSearch<A>
  /** Moves to another search, as the route's `navigate({ search })` does. */
  onSearch: (update: (prev: AuditSearch<A>) => AuditSearch<A>, replace?: boolean) => void
}) {
  // A new filter starts on the first page. The search lives in the URL with the other filters so that it does too, in the
  // same step.
  const setFilter = (patch: AuditSearch<A>, replace = false) =>
    onSearch((prev) => ({ ...prev, ...patch, page: undefined }), replace)
  const [q, setQ] = useSearchBox(search.q, (q) => setFilter({ q }, true))

  const page = search.page ?? 1
  const filters = { action: search.action, from: search.from, to: search.to, q: search.q }
  const { data, isPending, isPlaceholderData } = useQuery(query({ ...filters, limit: PAGE, offset: (page - 1) * PAGE }))
  const table = useGrid({ data: data?.entries ?? [], columns, getRowId, pageSize: PAGE })

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  // A link to a page the log does not have (or has no longer) goes to the last one. Only an answer to the current question can
  // say so: while a new filter loads, the total shown is the previous filter's.
  const pastTheEnd = !!data && !isPlaceholderData && page > pages
  const toLastPage = useEffectEvent(() => onSearch((prev) => ({ ...prev, page: pages > 1 ? pages : undefined }), true))
  useEffect(() => {
    if (pastTheEnd) toLastPage()
  }, [pastTheEnd, pages])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <a href={csvUrl(filters)} download className={buttonStyles('secondary', 'md')}>
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        }
      />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by action"
            value={search.action ?? 'all'}
            onChange={(next) => setFilter({ action: next === 'all' ? undefined : next })}
            options={[
              { value: 'all', label: 'All' },
              ...actions.map((action) => ({ value: action, label: actionLabel(action) })),
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-3">
              From
              <DateInput
                className="w-40"
                value={search.from ?? ''}
                max={search.to}
                onChange={(event) => setFilter({ from: event.target.value || undefined })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-3">
              To
              <DateInput
                className="w-40"
                value={search.to ?? ''}
                min={search.from}
                onChange={(event) => setFilter({ to: event.target.value || undefined })}
              />
            </label>
            <SearchInput
              className="w-full sm:w-64"
              aria-label={`Search the ${title.toLowerCase()}`}
              placeholder="Search details or user"
              maxLength={MAX_SEARCH}
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
        </Toolbar>
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <DataGrid
            table={table}
            label={title}
            noun="entries"
            loading={isPending || pastTheEnd}
            empty={
              <EmptyState
                icon={ScrollText}
                title="No entries match"
                description="Widen the date range or clear the filters."
              />
            }
            footer={
              total > 0 && !pastTheEnd ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-4 py-2.5 text-sm text-ink-3">
                  <p className="tabular-nums" aria-live="polite">
                    {((page - 1) * PAGE + 1).toLocaleString()}–{Math.min(page * PAGE, total).toLocaleString()} of{' '}
                    {total.toLocaleString()} entries
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 tabular-nums">
                      Page {page} of {pages.toLocaleString()}
                    </span>
                    <IconButton
                      label="Previous page"
                      size="sm"
                      variant="secondary"
                      disabled={page <= 1}
                      onClick={() => onSearch((prev) => ({ ...prev, page: page - 1 || undefined }))}
                    >
                      <ChevronLeft className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Next page"
                      size="sm"
                      variant="secondary"
                      disabled={page >= pages}
                      onClick={() => onSearch((prev) => ({ ...prev, page: page + 1 }))}
                    >
                      <ChevronRight className="size-4" />
                    </IconButton>
                  </div>
                </div>
              ) : null
            }
          />
        </div>
        <p className="text-sm text-ink-3">{footnote}</p>
      </div>
    </div>
  )
}
