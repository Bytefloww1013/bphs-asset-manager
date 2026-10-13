import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Plus, Scale, SearchX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { grievanceStatusLabel } from '@shared/constants.ts'
import type { GrievancePerson, GrievanceRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button, IconButton, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, Input, SearchInput, Select } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'
import { GrievanceStatusBadge } from '@/features/grievances/status.tsx'
import { formatDateTime, formatRelative, startOfLocalDay } from '@/lib/format.ts'
import { grievanceCategoriesQuery, grievancesQuery } from '@/lib/queries.ts'

// The longest search the server accepts.
const MAX_SEARCH = 100
// Voided grievances are listed under All only, so they have no tab of their own.
const TABS = ['open', 'in_progress', 'resolved', 'closed', 'all'] as const
type Tab = (typeof TABS)[number]

interface GrievanceSearch {
  status?: Tab
  owner?: number
  category?: number
  from?: string
  to?: string
  q?: string
}

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && startOfLocalDay(value) !== null
const isId = (value: unknown) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined)

export const Route = createFileRoute('/_app/grievances/')({
  // The Open tab is where the page starts, so it is the one tab the address does not name.
  validateSearch: (search: Record<string, unknown>): GrievanceSearch => ({
    status: TABS.includes(search.status as Tab) && search.status !== 'open' ? (search.status as Tab) : undefined,
    owner: isId(search.owner),
    category: isId(search.category),
    from: isDate(search.from) ? search.from : undefined,
    to: isDate(search.to) ? search.to : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, MAX_SEARCH) : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(grievanceCategoriesQuery),
  component: GrievancesPage,
})

const newGrievance = (
  <Link to="/grievances/new" className={buttonStyles('primary')}>
    <Plus className="size-4" aria-hidden />
    New grievance
  </Link>
)

/** The first two names and how many more; the full list is the cell's tooltip. */
function People({ people }: { people: GrievancePerson[] }) {
  const name = (person: GrievancePerson) => `${person.name}${person.archived ? ' (archived)' : ''}`
  return (
    <span className="block max-w-40 truncate text-ink-2" title={people.map(name).join(', ')}>
      {people.slice(0, 2).map(name).join(', ')}
      {people.length > 2 && <span className="text-ink-3"> +{people.length - 2}</span>}
    </span>
  )
}

const c = columnsFor<GrievanceRow>()
const getRowId = (row: GrievanceRow) => String(row.id)

function GrievancesPage() {
  useGrievancePageTitle()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setFilter = (patch: GrievanceSearch, replace = false) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace })
  // The box holds what is being typed and follows the address only when something else changes it (the Back button).
  const [q, setQ] = useState(search.q ?? '')
  const typing = useRef(false)
  useEffect(() => {
    if (!typing.current && (search.q ?? '') !== q.trim()) setQ(search.q ?? '')
  }, [search.q])
  useEffect(() => {
    typing.current = q.trim() !== (search.q ?? '')
    if (!typing.current) return
    const timer = setTimeout(() => {
      typing.current = false
      setFilter({ q: q.trim() || undefined }, true)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const tab = search.status ?? 'open'
  const { data, isPending, isPlaceholderData } = useQuery(grievancesQuery({ ...search, status: tab }))
  const { data: categories = [] } = useQuery(grievanceCategoriesQuery)
  const narrowed = Boolean(search.owner || search.category || search.from || search.to || search.q)

  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())
  const toggle = (id: number) =>
    setOpened((now) => {
      const next = new Set(now)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const columns = useMemo(
    () => [
      c.display({
        id: 'more',
        header: () => <span className="sr-only">Preview</span>,
        cell: ({ row }) => {
          const open = opened.has(row.original.id)
          return (
            <IconButton label={`${open ? 'Hide' : 'Show'} the start of ${row.original.code}`} size="sm" aria-expanded={open} onClick={() => toggle(row.original.id)}>
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </IconButton>
          )
        },
        meta: { width: 'w-10', cellClassName: 'pr-0 sm:pr-0' },
      }),
      c.accessor('code', {
        header: 'Grievance ID',
        cell: (info) => (
          <Link to="/grievances/$code" params={{ code: info.getValue() }} className="whitespace-nowrap font-mono text-sm font-medium text-accent hover:underline">
            {info.getValue()}
          </Link>
        ),
      }),
      c.accessor('title', {
        header: 'Title',
        cell: (info) => (
          <div className="min-w-40 max-w-56 leading-5">
            <Link to="/grievances/$code" params={{ code: info.row.original.code }} className="block truncate font-medium hover:underline" title={info.getValue()}>
              {info.getValue()}
            </Link>
            <div className="truncate text-xs text-ink-3">{info.row.original.category.name}</div>
          </div>
        ),
      }),
      c.accessor('shortDescription', {
        header: 'Short description',
        cell: (info) => (
          <span className="block max-w-64 truncate text-ink-2" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
        enableSorting: false,
        meta: { hideBelow: 'xl' },
      }),
      c.accessor('dateMade', { header: 'Date made', cell: (info) => <Mono className="whitespace-nowrap text-ink-2">{info.getValue()}</Mono>, meta: { hideBelow: 'sm' } }),
      c.accessor((row) => row.employees.map((person) => person.name).join(', '), { id: 'employees', header: 'Employees involved', cell: (info) => <People people={info.row.original.employees} />, enableSorting: false, meta: { hideBelow: 'lg' } }),
      c.accessor((row) => row.management.map((person) => person.name).join(', '), { id: 'management', header: 'Management involved', cell: (info) => <People people={info.row.original.management} />, enableSorting: false, meta: { hideBelow: 'lg' } }),
      c.accessor((row) => row.owner.name, { id: 'owner', header: 'Owner', cell: (info) => <People people={[info.row.original.owner]} />, meta: { hideBelow: 'md' } }),
      c.accessor('status', { header: 'Status', cell: (info) => <GrievanceStatusBadge status={info.getValue()} />, enableSorting: false }),
      c.accessor('lastActivityAt', {
        header: 'Last activity',
        cell: (info) => (
          <span className="whitespace-nowrap text-ink-3" title={formatDateTime(info.getValue())}>
            {formatRelative(info.getValue())}
          </span>
        ),
        meta: { hideBelow: 'xl' },
      }),
    ],
    [opened],
  )
  const table = useGrid({ data: data?.rows ?? [], columns, getRowId, resetKey: JSON.stringify(search) })

  const counts = data?.counts
  const clear = () => {
    setQ('')
    void navigate({ search: (prev) => ({ status: prev.status }) })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Grievances" description="Employee grievances and what was done about each one. Confidential." actions={newGrievance} />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={tab}
            onChange={(next) => setFilter({ status: next === 'open' ? undefined : next })}
            options={TABS.map((value) => ({ value, label: value === 'all' ? 'All' : grievanceStatusLabel(value), count: counts?.[value] }))}
          />
          <SearchInput className="w-full sm:w-72" aria-label="Search grievances" placeholder="Search ID, title, text or a name" maxLength={MAX_SEARCH} value={q} onChange={(event) => setQ(event.target.value)} />
        </Toolbar>
        <Toolbar>
          <Select aria-label="Owner" className="w-48" value={search.owner ?? ''} onChange={(event) => setFilter({ owner: isId(event.target.value) })}>
            <option value="">Any owner</option>
            {data?.owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
                {owner.archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
          <Select aria-label="Category" className="w-48" value={search.category ?? ''} onChange={(event) => setFilter({ category: isId(event.target.value) })}>
            <option value="">Any category</option>
            {categories
              .filter((category) => category.isActive || category.id === search.category || category.grievanceCount > 0)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-ink-3">
            Made from
            <Input type="date" className="w-40" value={search.from ?? ''} max={search.to} onChange={(event) => setFilter({ from: event.target.value || undefined })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-3">
            to
            <Input type="date" className="w-40" value={search.to ?? ''} min={search.from} onChange={(event) => setFilter({ to: event.target.value || undefined })} />
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
            label="Grievances"
            noun="grievances"
            loading={isPending}
            detail={(row) =>
              opened.has(row.original.id) ? (
                <p className="max-w-3xl whitespace-pre-line pl-10 text-sm leading-6 text-ink-2">{row.original.preview}</p>
              ) : null
            }
            empty={
              narrowed ? (
                <EmptyState
                  icon={SearchX}
                  title="No grievances match"
                  description={counts?.all ? `Nothing under ${tab === 'all' ? 'All' : grievanceStatusLabel(tab)} matches, but ${counts.all} elsewhere ${counts.all === 1 ? 'does' : 'do'}. Try the All tab, or clear the filters.` : 'Widen the dates or clear the filters.'}
                  action={
                    <Button variant="secondary" onClick={clear}>
                      Clear filters
                    </Button>
                  }
                />
              ) : counts?.all && tab !== 'all' ? (
                <EmptyState icon={Scale} title={`No ${grievanceStatusLabel(tab).toLowerCase()} grievances`} description="Grievances in other statuses are under their own tabs, and all of them are under All." />
              ) : (
                <EmptyState icon={Scale} title="No grievances yet" description="Grievances recorded here will be listed on this page." action={newGrievance} />
              )
            }
          />
        </div>
      </div>
    </div>
  )
}
