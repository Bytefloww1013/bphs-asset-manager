import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ProgramRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { Stacked } from '@/features/common/status.tsx'
import { ProgramRowActions, QuickAddProgram } from '@/features/programs/program-parts.tsx'
import { programsQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

type Show = 'active' | 'deactivated' | 'all'

export const Route = createFileRoute('/_app/programs')({
  validateSearch: (search: Record<string, unknown>): { show?: Show } => ({ show: search.show === 'deactivated' || search.show === 'all' ? search.show : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery),
  component: ProgramsPage,
})

const c = columnsFor<ProgramRow>()
const columns = [
  c.accessor('name', {
    header: 'Program Name',
    cell: (info) => (
      <Stacked
        primary={<span className="font-medium">{info.getValue()}</span>}
        // On a phone the Program ID column, the status and the count have no room of their own, so they sit under the name.
        secondary={
          <span className="sm:hidden">
            {info.row.original.code} · {info.row.original.isActive ? 'Active' : 'Deactivated'} · {info.row.original.assetsHeld} held
          </span>
        }
      />
    ),
  }),
  c.accessor('code', { header: 'Program ID', cell: (info) => <Mono className="text-ink-2">{info.getValue()}</Mono>, meta: { hideBelow: 'sm' } }),
  c.accessor((row) => row.address ?? '', { id: 'address', header: 'Program Address', cell: (info) => (info.getValue() ? <span className="text-ink-2">{info.getValue()}</span> : <span className="text-ink-3">—</span>), meta: { hideBelow: 'lg' } }),
  c.display({ id: 'actions', header: () => <span className="sr-only">Status, physical assets held and actions</span>, cell: (info) => <ProgramRowActions program={info.row.original} />, meta: { align: 'right', width: 'sm:w-80', pinned: true } }),
]
const getRowId = (row: ProgramRow) => String(row.id)
const searchText = (row: ProgramRow) => [row.name, row.code, row.address].filter(Boolean).join(' ')

function ProgramsPage() {
  usePageTitle('Programs')
  const { show = 'active' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data = [], isPending } = useQuery(programsQuery)
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState<number | null>(null)

  useEffect(() => {
    if (flash === null) return
    const timer = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(timer)
  }, [flash])

  const active = data.filter((p) => p.isActive).length
  const rows = useMemo(() => (show === 'all' ? data : data.filter((p) => p.isActive === (show === 'active'))), [data, show])
  const table = useGrid({ data: rows, columns, getRowId, searchText, search, resetKey: show, initialSorting: [{ id: 'name', desc: false }] })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Programs" description="A program can hold equipment the same way an employee does. One that has held an asset is deactivated, never deleted." />
      <QuickAddProgram onAdded={setFlash} />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={show}
            onChange={(next) => void navigate({ search: { show: next === 'active' ? undefined : next } })}
            options={[
              { value: 'active', label: 'Active', count: active },
              { value: 'deactivated', label: 'Deactivated', count: data.length - active },
              { value: 'all', label: 'All', count: data.length },
            ]}
          />
          <SearchInput className="w-full sm:w-80" aria-label="Search programs" placeholder="Search name, ID, address" value={search} onChange={(event) => setSearch(event.target.value)} />
        </Toolbar>
        <DataGrid
          table={table}
          label="Programs"
          noun="programs"
          loading={isPending}
          rowClassName={(row) => (row.original.id === flash ? 'animate-row-flash' : undefined)}
          empty={
            show === 'active' && data.length === 0 ? (
              <EmptyState icon={Building2} title="No programs yet" description="Add one above. Once it is there, physical assets can be assigned to it from the Issue sheet." />
            ) : (
              <EmptyState icon={Building2} title={show === 'deactivated' ? 'No deactivated programs' : 'No active programs'} description="Switch the status filter to see the others." />
            )
          }
          noMatches={<EmptyState icon={Building2} title="No programs match" description="Try a different name or ID." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
        />
      </div>
    </div>
  )
}
