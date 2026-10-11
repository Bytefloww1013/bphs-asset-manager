import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Download, Laptop } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AssetRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { AssetRowActions } from '@/features/assets/asset-actions.tsx'
import { QuickAddAsset } from '@/features/assets/quick-add.tsx'
import { AssetStateBadge, AssetTagLink, DaysOut, PersonCell, RatingBadge, assetSearchText, stateLabel } from '@/features/common/status.tsx'
import { downloadCsv, formatDate } from '@/lib/format.ts'
import { assetsQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

type StateFilter = 'all' | 'assigned' | 'in_storage' | 'retired'

export const Route = createFileRoute('/_app/assets/')({
  validateSearch: (search: Record<string, unknown>): { state?: StateFilter } => ({
    state: ['assigned', 'in_storage', 'retired'].includes(String(search.state)) ? (search.state as StateFilter) : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(assetsQuery),
  component: AssetsPage,
})

const c = columnsFor<AssetRow>()
const columns = [
  c.accessor('tag', {
    header: 'Asset tag',
    cell: (info) => (
      <div className="leading-5">
        <AssetTagLink tag={info.getValue()} />
        <div className="text-xs text-ink-3 md:hidden">
          {info.row.original.type} · {stateLabel(info.row.original.state)}
        </div>
      </div>
    ),
  }),
  c.accessor('type', { header: 'Type', meta: { hideBelow: 'md' } }),
  c.accessor((row) => row.serial ?? '', {
    id: 'serial',
    header: 'Serial',
    cell: (info) => (info.getValue() ? <Mono className="text-ink-2">{info.getValue()}</Mono> : <span className="text-ink-3">—</span>),
    meta: { hideBelow: 'lg' },
  }),
  c.accessor('state', { header: 'Status', cell: (info) => <AssetStateBadge state={info.getValue()} />, meta: { hideBelow: 'md' } }),
  c.accessor((row) => row.holder?.name ?? '', { id: 'holder', header: 'Assigned to', cell: (info) => <PersonCell person={info.row.original.holder} />, meta: { hideBelow: 'md' } }),
  c.accessor((row) => row.condition?.rating ?? '', { id: 'condition', header: 'Condition', cell: (info) => <RatingBadge name={info.row.original.condition?.rating} />, meta: { hideBelow: 'lg' } }),
  c.accessor((row) => row.daysOut ?? -1, { id: 'days', header: 'Days out', cell: (info) => <DaysOut days={info.row.original.daysOut} />, meta: { align: 'right', hideBelow: 'xl' } }),
  c.display({ id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: (info) => <AssetRowActions asset={info.row.original} />, meta: { align: 'right', width: 'w-48' } }),
]
const getRowId = (row: AssetRow) => String(row.id)

function AssetsPage() {
  usePageTitle('Assets')
  const { state = 'all' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data = [], isPending } = useQuery(assetsQuery)
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState<number | null>(null)

  useEffect(() => {
    if (flash === null) return
    const timer = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(timer)
  }, [flash])

  const counts = useMemo(
    () => ({
      all: data.length,
      assigned: data.filter((a) => a.state === 'assigned').length,
      in_storage: data.filter((a) => a.state === 'in_storage').length,
      retired: data.filter((a) => a.state === 'retired').length,
    }),
    [data],
  )
  const rows = useMemo(() => (state === 'all' ? data : data.filter((asset) => asset.state === state)), [data, state])

  const table = useGrid({ data: rows, columns, getRowId, searchText: assetSearchText, search, initialSorting: [{ id: 'tag', desc: false }] })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assets"
        description="Every device on the register, with its current holder and latest condition."
        actions={
          <Button
            icon={<Download className="size-4" />}
            disabled={data.length === 0}
            onClick={() =>
              downloadCsv(
                'assets.csv',
                ['Asset tag', 'Type', 'Serial', 'Status', 'Assigned to', 'Employee ID', 'Department', 'Condition', 'Days out', 'Created'],
                data.map((a) => [a.tag, a.type, a.serial, stateLabel(a.state), a.holder?.name, a.holder?.code, a.holder?.department, a.condition?.rating, a.daysOut, formatDate(a.createdAt)]),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      <QuickAddAsset onAdded={setFlash} />

      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={state}
            onChange={(next) => void navigate({ search: { state: next === 'all' ? undefined : next } })}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'assigned', label: 'Assigned', count: counts.assigned },
              { value: 'in_storage', label: 'In storage', count: counts.in_storage },
              { value: 'retired', label: 'Retired', count: counts.retired },
            ]}
          />
          <SearchInput className="w-full sm:w-80" aria-label="Search assets" placeholder="Search tag, serial, person, department" value={search} onChange={(event) => setSearch(event.target.value)} />
        </Toolbar>
        <DataGrid
          table={table}
          label="Assets"
          noun="assets"
          loading={isPending}
          rowClassName={(row) => (row.original.id === flash ? 'animate-row-flash' : undefined)}
          empty={<EmptyState icon={Laptop} title="No assets yet" description="Add the first one above, or paste rows copied from a spreadsheet." />}
          noMatches={<EmptyState icon={Laptop} title="No assets match" description="Try a different search, or switch the status filter." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
        />
      </div>
    </div>
  )
}
