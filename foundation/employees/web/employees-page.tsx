import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Upload, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { ExportButton } from '@/components/export-button.tsx'
import { Stacked } from '@/components/status.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { useCan, usePageTitle } from '@/lib/session.ts'
import { useWorkspace } from '@/lib/workspace.ts'
import type { EmployeeRow } from '../shared/index.ts'
import { EmployeeRowActions, QuickAddEmployee } from './employee-parts.tsx'
import { employeesExport } from './exports.ts'
import { employeesQuery } from './queries.ts'

type Show = 'active' | 'archived' | 'all'

/** The search of every Employees page: /employees in Assets, /grievances/employees and /reviews/employees. */
export const employeesSearch = (search: Record<string, unknown>): { show?: Show } => ({
  show: search.show === 'archived' || search.show === 'all' ? search.show : undefined,
})

const c = columnsFor<EmployeeRow>()
const name = c.accessor('name', {
  header: 'Employee',
  cell: (info) => (
    <Stacked primary={<span className="font-medium">{info.getValue()}</span>} secondary={info.row.original.jobTitle} />
  ),
})
const code = c.accessor('code', {
  header: 'Employee ID',
  cell: (info) => <Mono className="text-ink-2">{info.getValue()}</Mono>,
  meta: { hideBelow: 'sm' },
})
const department = c.accessor((row) => row.department ?? '', {
  id: 'department',
  header: 'Department',
  cell: (info) => info.getValue() || <span className="text-ink-3">—</span>,
  meta: { hideBelow: 'md' },
})
const held = c.accessor('assetsHeld', {
  header: 'Physical assets held',
  cell: (info) =>
    info.getValue() ? <span className="font-medium">{info.getValue()}</span> : <span className="text-ink-3">0</span>,
  meta: { align: 'right', hideBelow: 'sm' },
})
const state = c.accessor('state', {
  header: 'Status',
  cell: (info) => (
    <Badge tone={info.getValue() === 'active' ? 'ok' : 'neutral'}>
      {info.getValue() === 'active' ? 'Active' : 'Archived'}
    </Badge>
  ),
  meta: { hideBelow: 'lg' },
})
const actions = c.display({
  id: 'actions',
  header: () => <span className="sr-only">Actions</span>,
  cell: (info) => <EmployeeRowActions employee={info.row.original} />,
  meta: { align: 'right', width: 'md:w-48', pinned: true },
})
// The same people in every workspace; what they hold is Assets business only.
const COLUMNS = {
  assets: [name, code, department, held, state, actions],
  others: [name, code, department, state, actions],
}
const getRowId = (row: EmployeeRow) => String(row.id)
const searchText = (row: EmployeeRow) => [row.name, row.code, row.department, row.jobTitle].filter(Boolean).join(' ')

export function EmployeesPage() {
  usePageTitle('Employees')
  const readOnly = !useCan('employees', 'edit')
  // The page is in Assets, Grievances and Administrative Reviews.
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
  const rows = useMemo(
    () => (show === 'all' ? data : data.filter((e) => e.state === (show === 'active' ? 'active' : 'archived'))),
    [data, show],
  )
  const table = useGrid({
    data: rows,
    columns: COLUMNS[assets ? 'assets' : 'others'],
    getRowId,
    searchText,
    search,
    resetKey: show,
    initialSorting: [{ id: 'name', desc: false }],
  })

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
              <ExportButton dataset={employeesExport} items={data} />
              {!readOnly && (
                <Link to="/import-export" search={{ type: 'employees' }} className={buttonStyles()}>
                  <Upload className="size-4" aria-hidden />
                  Import
                </Link>
              )}
            </>
          )
        }
      />
      {!readOnly && <QuickAddEmployee onAdded={setFlash} />}
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by status"
            value={show}
            onChange={(next) =>
              void navigate({
                to: '.',
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  show: next === 'active' ? undefined : next,
                })) as never,
              })
            }
            options={[
              { value: 'active', label: 'Active', count: active },
              { value: 'archived', label: 'Archived', count: data.length - active },
              { value: 'all', label: 'All', count: data.length },
            ]}
          />
          <SearchInput
            className="w-full sm:w-80"
            aria-label="Search employees"
            placeholder="Search name, ID, department"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Toolbar>
        <DataGrid
          table={table}
          label="Employees"
          noun="employees"
          loading={isPending}
          rowClassName={(row) => (row.original.id === flash ? 'animate-row-flash' : undefined)}
          empty={
            assets ? (
              <EmptyState
                icon={Users}
                title="No employees yet"
                description="Add one above, or import your HR export as a CSV or Excel file."
                action={
                  readOnly ? undefined : (
                    <Link to="/import-export" search={{ type: 'employees' }} className={buttonStyles('primary')}>
                      Import employees
                    </Link>
                  )
                }
              />
            ) : (
              <EmptyState icon={Users} title="No employees yet" description="Add one above." />
            )
          }
          noMatches={
            <EmptyState
              icon={Users}
              title="No employees match"
              description="Try a different name or ID."
              action={<Button onClick={() => setSearch('')}>Clear search</Button>}
            />
          }
        />
      </div>
    </div>
  )
}
