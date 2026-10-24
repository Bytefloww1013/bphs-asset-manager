import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ClipboardCheck, Plus, SearchX } from 'lucide-react'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { DateInput, FilterTabs, SearchInput, Select } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { formatDateTime, formatRelative, startOfLocalDay } from '@/lib/format.ts'
import { useSearchBox } from '@/lib/hooks.ts'
import { useCan } from '@/lib/session.ts'
import { REVIEW_STATUSES, reviewStatusLabel } from '../../shared/constants.ts'
import type { ReviewPerson, ReviewRow } from '../../shared/types.ts'
import { useReviewPageTitle } from '../page-title.ts'
import { reviewsQuery } from '../queries.ts'
import { ReviewStatusBadge } from '../status.tsx'

// The longest search the server accepts.
const MAX_SEARCH = 100
const TABS = [...REVIEW_STATUSES, 'all'] as const
type Tab = (typeof TABS)[number]

interface ReviewSearch {
  status?: Tab
  reviewer?: number
  employee?: number
  from?: string
  to?: string
  q?: string
}

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && startOfLocalDay(value) !== null
const isId = (value: unknown) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined)

export const Route = createFileRoute('/_app/reviews/')({
  // As on Grievances, the Open tab is where the page starts and the one tab the address does not name.
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
    status: TABS.includes(search.status as Tab) && search.status !== 'open' ? (search.status as Tab) : undefined,
    reviewer: isId(search.reviewer),
    employee: isId(search.employee),
    from: isDate(search.from) ? search.from : undefined,
    to: isDate(search.to) ? search.to : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, MAX_SEARCH) : undefined,
  }),
  component: ReviewsPage,
})

const newReview = (
  <Link to="/reviews/new" className={buttonStyles('primary')}>
    <Plus className="size-4" aria-hidden />
    New review
  </Link>
)

const name = (person: ReviewPerson) => `${person.name}${person.archived ? ' (archived)' : ''}`
const c = columnsFor<ReviewRow>()
const getRowId = (row: ReviewRow) => String(row.id)
const columns = [
  c.accessor('code', {
    header: 'Review ID',
    cell: (info) => (
      <Link
        to="/reviews/$code"
        params={{ code: info.getValue() }}
        className="whitespace-nowrap font-mono text-sm font-medium text-accent hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  c.accessor('title', {
    header: 'Title',
    cell: (info) => (
      <div className="min-w-40 max-w-64 leading-5">
        <Link
          to="/reviews/$code"
          params={{ code: info.row.original.code }}
          className="block truncate font-medium hover:underline"
          title={info.getValue()}
        >
          {info.getValue()}
        </Link>
        <div className="truncate text-xs text-ink-3" title={info.row.original.summary}>
          {info.row.original.summary}
        </div>
      </div>
    ),
  }),
  c.accessor((row) => row.employee.name, {
    id: 'employee',
    header: 'Employee reviewed',
    cell: (info) => <span className="whitespace-nowrap text-ink-2">{name(info.row.original.employee)}</span>,
    meta: { hideBelow: 'md' },
  }),
  c.accessor((row) => row.reviewer.name, {
    id: 'reviewer',
    header: 'Reviewed by',
    cell: (info) => <span className="whitespace-nowrap text-ink-2">{name(info.row.original.reviewer)}</span>,
    meta: { hideBelow: 'lg' },
  }),
  c.accessor('reviewDate', {
    header: 'Review date',
    cell: (info) => <Mono className="whitespace-nowrap text-ink-2">{info.getValue()}</Mono>,
    meta: { hideBelow: 'sm' },
  }),
  c.accessor('status', {
    header: 'Status',
    cell: (info) => <ReviewStatusBadge status={info.getValue()} />,
    enableSorting: false,
  }),
  c.accessor((row) => row.caps.done, {
    id: 'caps',
    header: 'CAPs',
    cell: (info) =>
      info.row.original.caps.total ? (
        <span className="whitespace-nowrap text-ink-2">
          {info.row.original.caps.done} of {info.row.original.caps.total} done
        </span>
      ) : (
        <span className="text-ink-4">None</span>
      ),
    enableSorting: false,
    meta: { hideBelow: 'xl' },
  }),
  c.accessor('nextDue', {
    header: 'Next due',
    cell: (info) =>
      info.getValue() ? (
        <Mono className="whitespace-nowrap text-ink-2">{info.getValue()}</Mono>
      ) : (
        <span className="text-ink-4">None</span>
      ),
    meta: { hideBelow: 'xl' },
  }),
  c.accessor('lastActivityAt', {
    header: 'Last activity',
    cell: (info) => (
      <span className="whitespace-nowrap text-ink-3" title={formatDateTime(info.getValue())}>
        {formatRelative(info.getValue())}
      </span>
    ),
    meta: { hideBelow: 'xl' },
  }),
]

function ReviewsPage() {
  useReviewPageTitle()
  const canCreate = useCan('reviews', 'edit')
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setFilter = (patch: ReviewSearch, replace = false) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace })
  const [q, setQ] = useSearchBox(search.q, (q) => setFilter({ q }, true))

  const tab = search.status ?? 'open'
  const { data, isPending, isPlaceholderData } = useQuery(reviewsQuery({ ...search, status: tab }))
  const narrowed = Boolean(search.reviewer || search.employee || search.from || search.to || search.q)
  const table = useGrid({ data: data?.rows ?? [], columns, getRowId, resetKey: JSON.stringify(search) })

  const counts = data?.counts
  const clear = () => {
    setQ('')
    void navigate({ search: (prev) => ({ status: prev.status }) })
  }
  const tabLabel = (value: Tab) => (value === 'all' ? 'All' : reviewStatusLabel(value))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reviews"
        description="Administrative reviews of employees, with their corrective action plans."
        actions={canCreate ? newReview : undefined}
      />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={tab}
            onChange={(next) => setFilter({ status: next === 'open' ? undefined : next })}
            options={TABS.map((value) => ({ value, label: tabLabel(value), count: counts?.[value] }))}
          />
          <SearchInput
            className="w-full sm:w-72"
            aria-label="Search reviews"
            placeholder="Search ID, title or a name"
            maxLength={MAX_SEARCH}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </Toolbar>
        <Toolbar>
          {(
            [
              ['reviewer', 'Reviewed by', 'Any reviewer', data?.reviewers],
              ['employee', 'Employee reviewed', 'Any employee', data?.employees],
            ] as const
          ).map(([key, label, any, people]) => (
            <Select
              key={key}
              aria-label={label}
              className="w-48"
              value={search[key] ?? ''}
              onChange={(event) => setFilter({ [key]: isId(event.target.value) })}
            >
              <option value="">{any}</option>
              {people?.map((person) => (
                <option key={person.id} value={person.id}>
                  {name(person)}
                </option>
              ))}
            </Select>
          ))}
          <label className="flex items-center gap-2 text-sm text-ink-3">
            Reviewed from
            <DateInput
              className="w-40"
              value={search.from ?? ''}
              max={search.to}
              onChange={(event) => setFilter({ from: event.target.value || undefined })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-3">
            to
            <DateInput
              className="w-40"
              value={search.to ?? ''}
              min={search.from}
              onChange={(event) => setFilter({ to: event.target.value || undefined })}
            />
          </label>
          {narrowed && (
            <Button variant="ghost" onClick={clear}>
              Clear filters
            </Button>
          )}
        </Toolbar>
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <DataGrid
            table={table}
            label="Reviews"
            noun="reviews"
            loading={isPending}
            empty={
              narrowed ? (
                <EmptyState
                  icon={SearchX}
                  title="No reviews match"
                  description={
                    counts?.all
                      ? `Nothing under ${tabLabel(tab)} matches, but ${counts.all} elsewhere ${counts.all === 1 ? 'does' : 'do'}. Try the All tab, or clear the filters.`
                      : 'Widen the dates or clear the filters.'
                  }
                  action={
                    <Button variant="secondary" onClick={clear}>
                      Clear filters
                    </Button>
                  }
                />
              ) : counts?.all && tab !== 'all' ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title={`No ${tabLabel(tab).toLowerCase()} reviews`}
                  description="Reviews in other statuses are under their own tabs, and all of them are under All."
                />
              ) : (
                <EmptyState
                  icon={ClipboardCheck}
                  title="No reviews yet"
                  description="Administrative reviews recorded here will be listed on this page."
                  action={canCreate ? newReview : undefined}
                />
              )
            }
          />
        </div>
      </div>
    </div>
  )
}
