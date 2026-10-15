import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Upload, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { EmployeeRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { ExportButton } from '@/features/common/export-button.tsx'
import { EmployeeRowActions, QuickAddEmployee } from '@/features/employees/employee-parts.tsx'
import { Stacked } from '@/features/common/status.tsx'
import { EXPORTS } from '@/lib/exports.ts'
import { employeesQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'
import { useWorkspace } from '@/lib/workspace.ts'

type Show = 'active' | 'archived' | 'all'

/** The search of both Employees pages, at /employees in Assets and /grievances/employees in Grievances. */
export const employeesSearch = (search: Record<string, unknown>): { show?: Show } => ({
  show: search.show === 'archived' || search.show === 'all' ? search.show : undefined,
})

const c = columnsFor<EmployeeRow>()
const name = c.accessor('name', { header: 'Employee', cell: (info) => <Stacked primary={<span className="font-medium">{info.getValue()}</span>} secondary={info.row.original.jobTitle} /> })
const code = c.accessor('code', { header: 'Employee ID', cell: (info) => <Mono className="text-ink-2">{info.getValue()}</Mono>, meta: { hideBelow: 'sm' } })
const department = c.accessor((row) => row.department ?? '', { id: 'department', header: 'Department', cell: (info) => info.getValue() || <span className="text-ink-3">—</span>, meta: { hideBelow: 'md' } })
const held = c.accessor('assetsHeld', { header: 'Physical assets held', cell: (info) => (info.getValue() ? <span className="font-medium">{info.getValue()}</span> : <span className="text-ink-3">0</span>), meta: { align: 'right', hideBelow: 'sm' } })
const state = c.accessor('state', { header: 'Status', cell: (info) => <Badge tone={info.getValue() === 'active' ? 'ok' : 'neutral'}>{info.getValue() === 'active' ? 'Active' : 'Archived'}</Badge>, meta: { hideBelow: 'lg' } })
const actions = c.display({ id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: (info) => <EmployeeRowActions employee={info.row.original} />, meta: { align: 'right', width: 'md:w-48', pinned: true } })
// The same people in both workspaces; what they hold is Assets business only.
const COLUMNS = { assets: [name, code, department, held, state, actions], grievances: [name, code, department, state, actions] }
const getRowId = (row: EmployeeRow) => String(row.id)
const searchText = (row: EmployeeRow) => [row.name, row.code, row.department, row.jobTitle].filter(Boolean).join(' ')

export function EmployeesPage() {
  usePageTitle('Employees')
  // The page is only in Assets and Grievances.
  const assets = useWorkspace() === 'assets'
  const { show = 'active' } = useSearch({ strict: false }) as { show?: Show }
  const navigate = useNavigate()
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
  const table = useGrid({ data: rows, columns: COLUMNS[assets ? 'assets' : 'grievances'], getRowId, searchText, search, resetKey: show, initialSorting: [{ id: 'name', desc: false }] })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description={
          assets
            ? 'Everyone who can hold equipment. An employee with assignment history is archived, never deleted.'
            : 'Everyone who can own a grievance or be named on one. An employee with history is archived, never deleted.'
        }
        actions={
          assets && (
            <>
              <ExportButton dataset={EXPORTS.employees} items={data} />
              <Link to="/import-export" search={{ type: 'employees' }} className={buttonStyles()}>
                <Upload className="size-4" aria-hidden />
                Import
              </Link>
            </>
          )
        }
      />
      <QuickAddEmployee onAdded={setFlash} />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={show}
            onChange={(next) => void navigate({ to: '.', search: ((prev: Record<string, unknown>) => ({ ...prev, show: next === 'active' ? undefined : next })) as never })}
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
          empty={
            assets ? (
              <EmptyState icon={Users} title="No employees yet" description="Add one above, or import your HR export as a CSV or Excel file." action={<Link to="/import-export" search={{ type: 'employees' }} className={buttonStyles('primary')}>Import employees</Link>} />
            ) : (
              <EmptyState icon={Users} title="No employees yet" description="Add one above." />
            )
          }
          noMatches={<EmptyState icon={Users} title="No employees match" description="Try a different name or ID." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
        />
      </div>
    </div>
  )
}
