import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { PackageCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AssetRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Kbd, Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { AssetRowActions } from '@/features/assets/asset-actions.tsx'
import { useSheetActions } from '@/features/assignments/open.ts'
import { AssetTagLink, RatingBadge, assetSearchText } from '@/features/common/status.tsx'
import { formatDate, plural } from '@/lib/format.ts'
import { assetsQuery, lookupsQuery } from '@/lib/queries.ts'
import { useDenied, usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/available')({
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({ type: typeof search.type === 'string' ? search.type : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(assetsQuery),
  component: AvailablePage,
})

const c = columnsFor<AssetRow>()

/** On this page Issue is the point, so it is the primary button and the shortcut is shown on it. */
function AvailableActions({ asset }: { asset: AssetRow }) {
  const sheets = useSheetActions()
  const readOnly = useDenied('assets', 'edit')
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="primary" aria-keyshortcuts="I" disabledReason={readOnly} onClick={() => sheets.issue(asset.id)}>
        Issue <Kbd className="border-white/30 bg-white/15 text-on-accent shadow-none max-sm:hidden">I</Kbd>
      </Button>
      <AssetRowActions asset={asset} hidePrimary />
    </div>
  )
}

const columns = [
  c.accessor('tag', {
    header: 'Asset tag',
    cell: (info) => (
      <div className="leading-5">
        <AssetTagLink tag={info.getValue()} />
        <div className="text-xs text-ink-3 md:hidden">{info.row.original.type}</div>
      </div>
    ),
  }),
  c.accessor('type', { header: 'Type', meta: { hideBelow: 'md' } }),
  c.accessor((row) => row.serial ?? '', { id: 'serial', header: 'Serial', cell: (info) => (info.getValue() ? <Mono className="text-ink-2">{info.getValue()}</Mono> : <span className="text-ink-3">—</span>), meta: { hideBelow: 'md' } }),
  c.accessor((row) => row.condition?.rating ?? '', { id: 'condition', header: 'Latest condition', cell: (info) => <RatingBadge name={info.row.original.condition?.rating} /> }),
  c.accessor((row) => row.lastReturnedAt ?? '', {
    id: 'returned',
    header: 'Last returned',
    cell: (info) => (info.row.original.lastReturnedAt ? <Mono className="text-ink-2">{formatDate(info.row.original.lastReturnedAt)}</Mono> : <span className="text-ink-3">Never issued</span>),
    meta: { hideBelow: 'lg' },
  }),
  c.display({ id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: (info) => <AvailableActions asset={info.row.original} />, meta: { align: 'right', width: 'md:w-52', pinned: true } }),
]
const getRowId = (row: AssetRow) => String(row.id)

function AvailablePage() {
  usePageTitle('Available')
  const { type: linked } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const sheets = useSheetActions()
  const { data = [], isPending } = useQuery(assetsQuery)
  const { data: lookups } = useQuery(lookupsQuery)
  const [search, setSearch] = useState('')

  const stock = useMemo(() => data.filter((asset) => asset.state === 'in_storage'), [data])
  const byType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const asset of stock) counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [stock])
  // The Overview links here for every type, including one with nothing free, so a type the register knows gets its tab even at
  // zero. A name it does not know (a link from before a rename) shows everything instead of an empty list under no tab.
  const known = linked !== undefined && (data.some((asset) => asset.type === linked) || (lookups?.assetTypes ?? []).some((item) => item.name === linked))
  const type = known ? linked : 'all'
  const tabs = type === 'all' || byType.some(([name]) => name === type) ? byType : [...byType, [type, 0] as [string, number]]
  const rows = useMemo(() => (type === 'all' ? stock : stock.filter((asset) => asset.type === type)), [stock, type])

  const table = useGrid({ data: rows, columns, getRowId, searchText: assetSearchText, search, resetKey: type, initialSorting: [{ id: 'tag', desc: false }] })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Available" description={`${plural(stock.length, 'physical asset')} in storage: in service, with no active assignment.`} />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by type"
            value={type}
            onChange={(next) => void navigate({ search: { type: next === 'all' ? undefined : next } })}
            options={[{ value: 'all', label: 'All', count: stock.length }, ...tabs.map(([name, count]) => ({ value: name, label: name, count }))]}
          />
          <SearchInput className="w-full sm:w-80" aria-label="Search available physical assets" placeholder="Search tag or serial" value={search} onChange={(event) => setSearch(event.target.value)} />
        </Toolbar>
        <DataGrid
          table={table}
          label="Available physical assets"
          noun="assets"
          loading={isPending}
          rowProps={(row) => ({
            tabIndex: 0,
            onKeyDown: (event) => {
              if (event.key.toLowerCase() === 'i' && !event.metaKey && !event.ctrlKey && event.target === event.currentTarget) {
                event.preventDefault()
                sheets.issue(row.original.id)
              }
            },
          })}
          empty={
            type !== 'all' && stock.length > 0 ? (
              <EmptyState
                icon={PackageCheck}
                title={`No ${type} in storage`}
                description={`${plural(stock.length, 'asset')} of other types ${stock.length === 1 ? 'is' : 'are'} available.`}
                action={
                  <Link to="/available" className={buttonStyles('primary')}>
                    Show all types
                  </Link>
                }
              />
            ) : (
              <EmptyState icon={PackageCheck} title="Nothing is available" description="Every asset in service is assigned. Add stock from the Physical Assets page." />
            )
          }
          noMatches={<EmptyState icon={PackageCheck} title="No available assets match" description="Try another type or search." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
        />
        <p className="text-sm text-ink-3">
          Focus a row with <Kbd>Tab</Kbd> and press <Kbd>I</Kbd> to issue it.
        </p>
      </div>
    </div>
  )
}
