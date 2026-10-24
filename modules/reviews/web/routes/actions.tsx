import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Download, ListChecks, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState, useToast } from '@/components/ui/feedback.tsx'
import { DateInput, FilterTabs, SearchInput, Select } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { api } from '@/lib/api.ts'
import { formatDate, formatDateTime } from '@/lib/format.ts'
import type { FileFormat } from '@/lib/spreadsheet.ts'
import { downloadTable } from '@/lib/spreadsheet.ts'
import { reviewCapCode, reviewCapStatusLabel, type ReviewCapStatus } from '../../shared/constants.ts'
import type { ReviewActionItem, ReviewPerson } from '../../shared/types.ts'
import { useReviewPageTitle } from '../page-title.ts'
import { reviewActionItemsQuery } from '../queries.ts'
import { ReviewCapStatusBadge } from '../status.tsx'

const TABS = ['open', 'completed', 'cancelled', 'all'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = { open: 'Open', completed: 'Completed', cancelled: 'Cancelled', all: 'All' }
const inTab = (tab: Tab, status: ReviewCapStatus) =>
  tab === 'all' || (tab === 'open' ? status === 'not_started' || status === 'in_progress' : status === tab)

export const Route = createFileRoute('/_app/reviews/actions')({
  // As on Requests, the Open tab is where the page starts, so it is the one tab the address does not name.
  validateSearch: (search: Record<string, unknown>): { status?: Tab } => ({
    status: TABS.includes(search.status as Tab) && search.status !== 'open' ? (search.status as Tab) : undefined,
  }),
  component: ActionItemsPage,
})

const name = (person: ReviewPerson) => `${person.name}${person.archived ? ' (archived)' : ''}`
const capOf = (row: ReviewActionItem) => `${row.review.code} ${reviewCapCode(row.seq)}`
const c = columnsFor<ReviewActionItem>()
const getRowId = (row: ReviewActionItem) => String(row.id)
const searchText = (row: ReviewActionItem) =>
  [capOf(row), row.title, row.shortDescription, row.review.title, row.responsible.name].join(' ')

const columns = [
  c.accessor(capOf, {
    id: 'cap',
    header: 'CAP',
    cell: (info) => (
      <Link
        to="/reviews/$code/caps/$cap"
        params={{ code: info.row.original.review.code, cap: reviewCapCode(info.row.original.seq) }}
        className="flex flex-col whitespace-nowrap font-mono text-sm font-medium leading-5 text-accent hover:underline"
      >
        <span>{info.row.original.review.code}</span>
        <span>{reviewCapCode(info.row.original.seq)}</span>
      </Link>
    ),
  }),
  c.accessor('title', {
    header: 'Title',
    cell: (info) => (
      <div className="min-w-40 max-w-72 leading-5">
        <div className="truncate font-medium" title={info.getValue()}>
          {info.getValue()}
        </div>
        <div className="truncate text-xs text-ink-3" title={info.row.original.shortDescription}>
          {info.row.original.shortDescription}
        </div>
      </div>
    ),
  }),
  c.accessor((row) => row.review.title, {
    id: 'review',
    header: 'Review',
    cell: (info) => (
      <div className="max-w-48 truncate text-ink-2" title={info.getValue()}>
        {info.getValue()}
      </div>
    ),
    meta: { hideBelow: 'xl' },
  }),
  c.accessor((row) => row.responsible.name, {
    id: 'responsible',
    header: 'Responsible',
    cell: (info) => <span className="whitespace-nowrap text-ink-2">{name(info.row.original.responsible)}</span>,
    meta: { hideBelow: 'md' },
  }),
  // Nothing is marked overdue: the date is shown as it was set.
  c.accessor('dueDate', {
    header: 'Due',
    cell: (info) =>
      info.getValue() ? (
        <Mono className="whitespace-nowrap text-ink-2">{info.getValue()}</Mono>
      ) : (
        <span className="text-ink-4">None</span>
      ),
    meta: { hideBelow: 'sm' },
  }),
  c.accessor('status', {
    header: 'Status',
    cell: (info) => <ReviewCapStatusBadge status={info.getValue()} />,
    enableSorting: false,
  }),
  c.accessor('completedAt', {
    header: 'Completed',
    cell: (info) =>
      info.getValue() ? (
        <span className="whitespace-nowrap text-ink-2" title={formatDateTime(info.getValue())}>
          {formatDate(info.getValue())}
        </span>
      ) : (
        <span className="text-ink-4">Not yet</span>
      ),
    meta: { hideBelow: 'lg' },
  }),
]

const HEADER = [
  'Review ID',
  'CAP',
  'Title',
  'Short description',
  'Review',
  'Responsible',
  'Due date',
  'Status',
  'Completed',
]
const sheetRow = (row: ReviewActionItem) => [
  row.review.code,
  reviewCapCode(row.seq),
  row.title,
  row.shortDescription,
  row.review.title,
  name(row.responsible),
  row.dueDate,
  reviewCapStatusLabel(row.status),
  row.completedAt && formatDate(row.completedAt),
]

/** Every CAP on every review the account may see, apart from voided reviews, across reviews. */
function ActionItemsPage() {
  useReviewPageTitle('Action items')
  const navigate = useNavigate({ from: Route.fullPath })
  const toast = useToast()
  const tab = Route.useSearch().status ?? 'open'
  const [search, setSearch] = useState('')
  const [responsible, setResponsible] = useState<number | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [saving, setSaving] = useState<FileFormat | null>(null)
  const { data = [], isPending } = useQuery(reviewActionItemsQuery)

  const people = useMemo(
    () =>
      [...new Map(data.map((row) => [row.responsible.id, row.responsible])).values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [data],
  )
  // Due dates are calendar dates, so they compare as text. A CAP with no due date drops out once either end is set.
  const narrowed = useMemo(
    () =>
      data.filter(
        (row) =>
          (responsible === null || row.responsible.id === responsible) &&
          (!from || (row.dueDate !== null && row.dueDate >= from)) &&
          (!to || (row.dueDate !== null && row.dueDate <= to)),
      ),
    [data, responsible, from, to],
  )
  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((value) => [value, narrowed.filter((row) => inTab(value, row.status)).length]),
      ) as Record<Tab, number>,
    [narrowed],
  )
  const rows = useMemo(() => narrowed.filter((row) => inTab(tab, row.status)), [narrowed, tab])
  const table = useGrid({
    data: rows,
    columns,
    getRowId,
    searchText,
    search,
    resetKey: `${tab} ${responsible} ${from} ${to}`,
  })
  const filtered = Boolean(search || responsible !== null || from || to)

  const clear = () => {
    setSearch('')
    setResponsible(null)
    setFrom('')
    setTo('')
  }

  // What is saved is what the list shows: this tab, these filters, in this order, every page of it.
  async function save(format: FileFormat) {
    const shown = table.getPrePaginatedRowModel().rows.map((row) => sheetRow(row.original))
    setSaving(format)
    try {
      await api.post('/reviews/action-items/exports', { format, rows: shown.length })
      await downloadTable(format, 'action-items', HEADER, shown, 'Action items')
    } catch (e) {
      toast({ tone: 'bad', title: 'Not exported', description: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Action items"
        description="Every corrective action plan, across the reviews you can see. Nothing is marked overdue."
        actions={
          <>
            {(['csv', 'xlsx'] as const).map((format) => (
              <Button
                key={format}
                icon={<Download className="size-4" />}
                disabled={!table.getPrePaginatedRowModel().rows.length}
                loading={saving === format}
                onClick={() => void save(format)}
              >
                {format === 'csv' ? 'Export CSV' : 'Export Excel'}
              </Button>
            ))}
          </>
        }
      />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={tab}
            onChange={(next) => void navigate({ search: { status: next === 'open' ? undefined : next } })}
            options={TABS.map((value) => ({
              value,
              label: TAB_LABEL[value],
              count: isPending ? undefined : counts[value],
            }))}
          />
          <SearchInput
            className="w-full sm:w-72"
            aria-label="Search action items"
            placeholder="Search ID, title or a name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Toolbar>
        <Toolbar>
          <Select
            aria-label="Responsible"
            className="w-48"
            value={responsible ?? ''}
            onChange={(event) => setResponsible(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Anyone responsible</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {name(person)}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-ink-3">
            Due from
            <DateInput
              className="w-40"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-3">
            to
            <DateInput
              className="w-40"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          {filtered && (
            <Button variant="ghost" onClick={clear}>
              Clear filters
            </Button>
          )}
        </Toolbar>
        <DataGrid
          table={table}
          label="Action items"
          noun="action items"
          loading={isPending}
          noMatches={
            <EmptyState
              icon={SearchX}
              title="No action items match"
              description="Try fewer words, or the All tab."
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          }
          empty={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No action items match"
                description="Widen the due dates or clear the filters."
                action={
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : data.length && tab !== 'all' ? (
              <EmptyState
                icon={ListChecks}
                title={`No ${TAB_LABEL[tab].toLowerCase()} action items`}
                description="CAPs in other statuses are under their own tabs, and all of them are under All."
              />
            ) : (
              <EmptyState
                icon={ListChecks}
                title="No action items yet"
                description="Corrective action plans added to reviews are listed on this page."
              />
            )
          }
        />
      </div>
    </div>
  )
}
