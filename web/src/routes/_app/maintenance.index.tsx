import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Plus, SearchX, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MAINTENANCE_OPEN, type MaintenanceStatus } from '@shared/constants.ts'
import type { MaintenanceRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { useMaintenancePageTitle } from '@/features/maintenance/page-title.ts'
import { MaintenanceStatusBadge, UrgentBadge, isUrgent } from '@/features/maintenance/status.tsx'
import { formatDate, formatDateTime } from '@/lib/format.ts'
import { maintenanceQuery } from '@/lib/queries.ts'

const TABS = ['open', 'finished', 'rejected', 'all'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = { open: 'Open', finished: 'Finished', rejected: 'Rejected', all: 'All' }
const inTab = (tab: Tab, status: MaintenanceStatus) => tab === 'all' || (tab === 'open' ? MAINTENANCE_OPEN.includes(status) : status === tab)

export const Route = createFileRoute('/_app/maintenance/')({
  // The Open tab is where the page starts, so it is the one tab the address does not name.
  validateSearch: (search: Record<string, unknown>): { status?: Tab } => ({
    status: TABS.includes(search.status as Tab) && search.status !== 'open' ? (search.status as Tab) : undefined,
  }),
  component: MaintenancePage,
})

const newRequest = (
  <Link to="/maintenance/new" className={buttonStyles('primary')}>
    <Plus className="size-4" aria-hidden />
    New request
  </Link>
)

const c = columnsFor<MaintenanceRow>()
const getRowId = (row: MaintenanceRow) => String(row.id)
const searchText = (row: MaintenanceRow) => [row.code, row.requestedBy, row.email, row.program, row.location, row.description].join(' ')

/** A cell's text on one line, cut short, with the whole of it as the tooltip. */
const Clipped = ({ text, width }: { text: string; width: string }) => (
  <span className={`block truncate text-ink-2 ${width}`} title={text}>
    {text}
  </span>
)

const columns = [
  c.accessor('code', {
    header: 'Request',
    cell: (info) => (
      <Link to="/maintenance/$id" params={{ id: String(info.row.original.id) }} className="whitespace-nowrap font-mono text-sm font-medium text-accent hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  c.accessor('receivedAt', {
    header: 'Received',
    cell: (info) => (
      <span className="whitespace-nowrap text-ink-2" title={formatDateTime(info.getValue())}>
        {formatDate(info.getValue())}
      </span>
    ),
    meta: { hideBelow: 'sm' },
  }),
  c.accessor((row) => (isUrgent(row.urgent) ? 1 : 0), { id: 'urgent', header: 'Urgent', cell: (info) => <UrgentBadge urgent={info.row.original.urgent} />, meta: { hideBelow: 'md' } }),
  c.accessor('requestedBy', { header: 'Requested by', cell: (info) => <Clipped text={info.getValue()} width="max-w-40" /> }),
  c.accessor('program', { header: 'Program', cell: (info) => <Clipped text={info.getValue()} width="max-w-36" />, meta: { hideBelow: 'xl' } }),
  c.accessor('location', { header: 'Location', cell: (info) => <Clipped text={info.getValue()} width="max-w-40" />, meta: { hideBelow: 'lg' } }),
  c.accessor('description', { header: 'Description', cell: (info) => <Clipped text={info.getValue()} width="max-w-72" />, enableSorting: false, meta: { hideBelow: 'md' } }),
  c.accessor('status', { header: 'Status', cell: (info) => <MaintenanceStatusBadge status={info.getValue()} /> }),
  c.accessor((row) => row.assignee?.name ?? '', { id: 'assignee', header: 'Dispatched to', cell: (info) => <Clipped text={info.getValue()} width="max-w-40" />, meta: { hideBelow: 'lg' } }),
]

function MaintenancePage() {
  useMaintenancePageTitle()
  const navigate = useNavigate({ from: Route.fullPath })
  const tab = Route.useSearch().status ?? 'open'
  const [search, setSearch] = useState('')
  const { data = [], isPending } = useQuery(maintenanceQuery)

  const counts = useMemo(() => Object.fromEntries(TABS.map((value) => [value, data.filter((row) => inTab(value, row.status)).length])) as Record<Tab, number>, [data])
  const rows = useMemo(() => data.filter((row) => inTab(tab, row.status)), [data, tab])
  const table = useGrid({ data: rows, columns, getRowId, searchText, search, resetKey: tab })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Requests" description="Maintenance work order requests, from the Zoho form or entered here." actions={newRequest} />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={tab}
            onChange={(next) => void navigate({ search: { status: next === 'open' ? undefined : next } })}
            options={TABS.map((value) => ({ value, label: TAB_LABEL[value], count: isPending ? undefined : counts[value] }))}
          />
          <SearchInput className="w-full sm:w-72" aria-label="Search requests" placeholder="Search ID, name, location or text" value={search} onChange={(event) => setSearch(event.target.value)} />
        </Toolbar>
        <DataGrid
          table={table}
          label="Maintenance requests"
          noun="requests"
          loading={isPending}
          rowClassName={() => 'cursor-pointer'}
          rowProps={(row) => ({
            // The ID is the link a keyboard reaches; a click anywhere else on the row opens the request too, unless it was selecting text.
            onClick: (event) => {
              if ((event.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return
              void navigate({ to: '/maintenance/$id', params: { id: row.id } })
            },
          })}
          noMatches={
            <EmptyState
              icon={SearchX}
              title="No requests match"
              description="Try fewer words, or the All tab."
              action={
                <Button variant="secondary" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              }
            />
          }
          empty={
            counts.all && tab !== 'all' ? (
              <EmptyState icon={Wrench} title={`No ${TAB_LABEL[tab].toLowerCase()} requests`} description="Requests in other statuses are under their own tabs, and all of them are under All." />
            ) : (
              <EmptyState icon={Wrench} title="No requests yet" description="Requests sent from the Zoho form, or entered here, are listed on this page." action={newRequest} />
            )
          }
        />
      </div>
    </div>
  )
}
