import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppWindow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { ExportButton } from '@/components/export-button.tsx'
import { PersonCell, Stacked } from '@/components/status.tsx'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { formatDate } from '@/lib/format.ts'
import { useCan, usePageTitle } from '@/lib/session.ts'
import type { DigitalAssetRow, DigitalAssetState } from '../../shared/index.ts'
import {
  DigitalAssetIdCell,
  DigitalAssetRowActions,
  DigitalStateBadge,
  QuickAddDigitalAsset,
  digitalStateLabel,
} from '../digital-parts.tsx'
import { digitalAssetsExport } from '../exports.ts'
import { digitalAssetsQuery, digitalLookupsQuery } from '../queries.ts'

type Show = 'all' | DigitalAssetState
const STATES: DigitalAssetState[] = ['active', 'not_issued', 'inactive']

export const Route = createFileRoute('/_app/digital-assets')({
  validateSearch: (search: Record<string, unknown>): { show?: DigitalAssetState } => ({
    show: STATES.find((state) => state === search.show),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(digitalAssetsQuery),
      context.queryClient.ensureQueryData(digitalLookupsQuery),
    ]),
  component: DigitalAssetsPage,
})

const c = columnsFor<DigitalAssetRow>()
const columns = [
  c.accessor('code', {
    header: 'Asset ID',
    cell: (info) => (
      <Stacked
        primary={<DigitalAssetIdCell asset={info.row.original} />}
        secondary={<span className="md:hidden">{info.row.original.type}</span>}
      />
    ),
  }),
  c.accessor('type', { header: 'Type', meta: { hideBelow: 'md' } }),
  c.accessor('account', {
    header: 'License/Account',
    cell: (info) => (
      <span className="block max-w-72 truncate" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
    meta: { hideBelow: 'lg' },
  }),
  c.accessor((row) => row.employee?.name ?? '', {
    id: 'employee',
    header: 'Assigned Employee',
    cell: (info) => <PersonCell person={info.row.original.employee} />,
    meta: { hideBelow: 'sm' },
  }),
  c.accessor((row) => digitalStateLabel(row.state), {
    id: 'state',
    header: 'Status',
    cell: (info) => <DigitalStateBadge state={info.row.original.state} />,
  }),
  c.accessor((row) => row.issuedAt ?? '', {
    id: 'issuedAt',
    header: 'Issue Date',
    cell: (info) =>
      info.row.original.issuedAt ? (
        <Mono className="text-ink-2">{formatDate(info.row.original.issuedAt)}</Mono>
      ) : (
        <span className="text-ink-3">—</span>
      ),
    meta: { hideBelow: 'xl' },
  }),
  c.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: (info) => <DigitalAssetRowActions asset={info.row.original} />,
    meta: { align: 'right', width: 'md:w-48', pinned: true },
  }),
]
const getRowId = (row: DigitalAssetRow) => String(row.id)
const searchText = (row: DigitalAssetRow) =>
  [
    row.code,
    row.type,
    row.account,
    row.employee?.name,
    row.employee?.code,
    row.employee?.department,
    digitalStateLabel(row.state),
  ]
    .filter(Boolean)
    .join(' ')

function DigitalAssetsPage() {
  usePageTitle('Digital Assets')
  const readOnly = !useCan('assets', 'edit')
  const { show = 'all' } = Route.useSearch() as { show?: Show }
  const navigate = useNavigate({ from: Route.fullPath })
  const { data = [], isPending } = useQuery(digitalAssetsQuery)
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState<number | null>(null)

  useEffect(() => {
    if (flash === null) return
    const timer = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(timer)
  }, [flash])

  const count = (state: DigitalAssetState) => data.filter((row) => row.state === state).length
  const rows = useMemo(() => (show === 'all' ? data : data.filter((row) => row.state === show)), [data, show])
  const table = useGrid({
    data: rows,
    columns,
    getRowId,
    searchText,
    search,
    resetKey: show,
    initialSorting: [{ id: 'code', desc: false }],
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Digital Assets"
        description="Licenses and accounts, one seat per row, and who each is issued to. A seat is Active while someone holds it."
        actions={<ExportButton dataset={digitalAssetsExport} items={data} />}
      />
      {!readOnly && <QuickAddDigitalAsset onAdded={setFlash} />}
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={show}
            onChange={(next) => void navigate({ search: { show: next === 'all' ? undefined : next } })}
            options={[
              { value: 'all', label: 'All', count: data.length },
              { value: 'active', label: 'Active', count: count('active') },
              { value: 'not_issued', label: 'Not Issued', count: count('not_issued') },
              { value: 'inactive', label: 'Inactive', count: count('inactive') },
            ]}
          />
          <SearchInput
            className="w-full sm:w-80"
            aria-label="Search digital assets"
            placeholder="Search ID, type, account, employee"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Toolbar>
        <DataGrid
          table={table}
          label="Digital assets"
          noun="digital assets"
          loading={isPending}
          rowClassName={(row) => (row.original.id === flash ? 'animate-row-flash' : undefined)}
          empty={
            <EmptyState
              icon={AppWindow}
              title={show === 'all' ? 'No digital assets yet' : `Nothing is ${digitalStateLabel(show)}`}
              description={
                show === 'all'
                  ? 'Add a license or account above. Each seat gets its own Asset ID.'
                  : 'Choose All to see every digital asset.'
              }
            />
          }
          noMatches={
            <EmptyState
              icon={AppWindow}
              title="No digital assets match"
              description="Try a different ID, type, account or name."
              action={<Button onClick={() => setSearch('')}>Clear search</Button>}
            />
          }
        />
      </div>
    </div>
  )
}
