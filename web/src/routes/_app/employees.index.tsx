import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Upload, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { EmployeeRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { EmployeeRowActions, QuickAddEmployee } from '@/features/employees/employee-parts.tsx'
import { Stacked } from '@/features/common/status.tsx'
import { employeesQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

type Show = 'active' | 'archived' | 'all'

export const Route = createFileRoute('/_app/employees/')({
  validateSearch: (search: Record<string, unknown>): { show?: Show } => ({ show: search.show === 'archived' || search.show === 'all' ? search.show : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: EmployeesPage,
})

const c = columnsFor<EmployeeRow>()
const columns = [
  c.accessor('name', { header: 'Employee', cell: (info) => <Stacked primary={<span className="font-medium">{info.getValue()}</span>} secondary={info.row.original.jobTitle} /> }),
  c.accessor('code', { header: 'Employee ID', cell: (info) => <Mono className="text-ink-2">{info.getValue()}</Mono>, meta: { hideBelow: 'sm' } }),
  c.accessor((row) => row.department ?? '', { id: 'department', header: 'Department', cell: (info) => info.getValue() || <span className="text-ink-3">—</span>, meta: { hideBelow: 'md' } }),
  c.accessor('assetsHeld', { header: 'Assets held', cell: (info) => (info.getValue() ? <span className="font-medium">{info.getValue()}</span> : <span className="text-ink-3">0</span>), meta: { align: 'right', hideBelow: 'sm' } }),
  c.accessor('state', { header: 'Status', cell: (info) => <Badge tone={info.getValue() === 'active' ? 'ok' : 'neutral'}>{info.getValue() === 'active' ? 'Active' : 'Archived'}</Badge>, meta: { hideBelow: 'lg' } }),
  c.display({ id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: (info) => <EmployeeRowActions employee={info.row.original} />, meta: { align: 'right', width: 'w-48' } }),
]
const getRowId = (row: EmployeeRow) => String(row.id)
const searchText = (row: EmployeeRow) => [row.name, row.code, row.department, row.jobTitle].filter(Boolean).join(' ')

function EmployeesPage() {
  usePageTitle('Employees')
  const { show = 'active' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data = [], isPending } = useQuery(employeesQuery)
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState<number | null>(null)

  useEffect(() => {
    if (flash === null) return
    const timer = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(timer)
  }, [flash])

  const active = data.filter((e) => e.state === 'active').length
  const rows = useMemo(() => (show === 'all' ? data : data.filter((e) => e.state === (show === 'active' ? 'active' : 'archived'))), [data, show])
  const table = useGrid({ data: rows, columns, getRowId, searchText, search, initialSorting: [{ id: 'name', desc: false }] })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description="Everyone who can hold equipment. An employee with assignment history is archived, never deleted."
        actions={
          <Link to="/employees/import">
            <Button icon={<Upload className="size-4" />}>Import CSV</Button>
          </Link>
        }
      />
      <QuickAddEmployee onAdded={setFlash} />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={show}
            onChange={(next) => void navigate({ search: { show: next === 'active' ? undefined : next } })}
            options={[
              { value: 'active', label: 'Active', count: active },
              { value: 'archived', label: 'Archived', count: data.length - active },
              { value: 'all', label: 'All', count: data.length },
            ]}
          />
          <SearchInput className="w-full sm:w-80" aria-label="Search employees" placeholder="Search name, ID, department" value={search} onChange={(event) => setSearch(event.target.value)} />
        </Toolbar>
        <DataGrid
          table={table}
          label="Employees"
          noun="employees"
          loading={isPending}
          rowClassName={(row) => (row.original.id === flash ? 'animate-row-flash' : undefined)}
          empty={<EmptyState icon={Users} title="No employees yet" description="Add one above, or import your HR export as a CSV." action={<Link to="/employees/import"><Button variant="primary">Import CSV</Button></Link>} />}
          noMatches={<EmptyState icon={Users} title="No employees match" description="Try a different name or ID." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
        />
      </div>
    </div>
  )
}
