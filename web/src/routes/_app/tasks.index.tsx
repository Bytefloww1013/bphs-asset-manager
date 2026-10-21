import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ListTodo, Plus, SearchX } from 'lucide-react'
import { useMemo } from 'react'
import { TASK_STATUSES, taskStatusLabel } from '@shared/constants.ts'
import { canAssignTasks } from '@shared/permissions.ts'
import type { AccountRef, TaskRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, Select } from '@/components/ui/form.tsx'
import { PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { TaskStatusBadge } from '@/features/tasks/status.tsx'
import { formatDateTime } from '@/lib/format.ts'
import { tasksQuery } from '@/lib/queries.ts'
import { usePageTitle, useUser } from '@/lib/session.ts'

const TABS = ['all', ...TASK_STATUSES] as const
type Tab = (typeof TABS)[number]
const tabLabel = (value: Tab) => (value === 'all' ? 'All' : taskStatusLabel(value))

interface TaskSearch {
  status?: Tab
  assignee?: number
  assigner?: number
}

const isId = (value: unknown) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined)

export const Route = createFileRoute('/_app/tasks/')({
  // The page is "All tasks", so All is where it starts and the one tab the address does not name.
  validateSearch: (search: Record<string, unknown>): TaskSearch => ({
    status: TABS.includes(search.status as Tab) && search.status !== 'all' ? (search.status as Tab) : undefined,
    assignee: isId(search.assignee),
    assigner: isId(search.assigner),
  }),
  component: TasksPage,
})

const DENIED = 'Assigning tasks needs Assign access to Employee Tasks.'
const assignTask = (
  <Link to="/tasks/new" className={buttonStyles('primary')}>
    <Plus className="size-4" aria-hidden />
    Assign task
  </Link>
)
const assignDenied = (
  <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} disabledReason={DENIED}>
    Assign task
  </Button>
)

/** Everyone in one role across the tasks, once each, by name. */
const people = (rows: TaskRow[], role: 'assignee' | 'assigner') =>
  [...new Map(rows.map((row) => [row[role].id, row[role]])).values()].sort((a, b) => a.name.localeCompare(b.name))

const c = columnsFor<TaskRow>()
const getRowId = (row: TaskRow) => String(row.id)
const dateTime = (iso: string) => <span className="whitespace-nowrap text-ink-2">{formatDateTime(iso)}</span>
const person = (ref: AccountRef) => (
  <span className="whitespace-nowrap text-ink-2" title={ref.email}>
    {ref.name}
  </span>
)
const columns = [
  c.accessor((row) => row.assignee.name, { id: 'assignee', header: 'Assignee', cell: (info) => person(info.row.original.assignee) }),
  c.accessor((row) => row.assigner.name, { id: 'assigner', header: 'Assigner', cell: (info) => person(info.row.original.assigner), meta: { hideBelow: 'lg' } }),
  c.accessor('title', {
    header: 'Title',
    cell: (info) => (
      <Link to="/tasks/$id" params={{ id: String(info.row.original.id) }} className="block min-w-40 max-w-80 truncate font-medium hover:underline" title={info.getValue()}>
        {info.getValue()}
      </Link>
    ),
  }),
  c.accessor('status', { header: 'Status', cell: (info) => <TaskStatusBadge status={info.getValue()} />, enableSorting: false }),
  c.accessor('sendAt', { header: 'Assigned', cell: (info) => dateTime(info.getValue()), meta: { hideBelow: 'xl' } }),
  c.accessor('dueAt', { header: 'Due', cell: (info) => dateTime(info.getValue()), meta: { hideBelow: 'sm' } }),
]

function TasksPage() {
  usePageTitle('All tasks')
  const canAssign = canAssignTasks(useUser())
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setFilter = (patch: TaskSearch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })
  const { data = [], isPending, isError } = useQuery(tasksQuery)

  const tab = search.status ?? 'all'
  const narrowed = Boolean(search.assignee || search.assigner)
  // The people filters apply first, so each tab's count is what that tab would show.
  const byPerson = useMemo(
    () => data.filter((row) => (!search.assignee || row.assignee.id === search.assignee) && (!search.assigner || row.assigner.id === search.assigner)),
    [data, search.assignee, search.assigner],
  )
  const counts = useMemo(() => Object.fromEntries(TABS.map((value) => [value, byPerson.filter((row) => value === 'all' || row.status === value).length])) as Record<Tab, number>, [byPerson])
  const rows = useMemo(() => byPerson.filter((row) => tab === 'all' || row.status === tab), [byPerson, tab])
  const filters = useMemo(() => ({ assignee: people(data, 'assignee'), assigner: people(data, 'assigner') }), [data])
  const table = useGrid({ data: rows, columns, getRowId, initialSorting: [{ id: 'dueAt', desc: false }], resetKey: JSON.stringify(search) })
  const action = canAssign ? assignTask : assignDenied
  const clear = () => void navigate({ search: (prev) => ({ status: prev.status }) })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="All tasks" description="Every task assigned to an employee, from scheduled to completed or cancelled." actions={action} />
      <div className="flex flex-col gap-3">
        <FilterTabs
          label="Filter by status"
          value={tab}
          onChange={(next) => setFilter({ status: next === 'all' ? undefined : next })}
          options={TABS.map((value) => ({ value, label: tabLabel(value), count: isPending ? undefined : counts[value] }))}
        />
        <Toolbar>
          {(
            [
              ['assignee', 'Assignee', 'Any assignee'],
              ['assigner', 'Assigner', 'Any assigner'],
            ] as const
          ).map(([key, label, any]) => (
            <Select key={key} aria-label={label} className="w-48" value={search[key] ?? ''} onChange={(event) => setFilter({ [key]: isId(event.target.value) })}>
              <option value="">{any}</option>
              {filters[key].map((ref) => (
                <option key={ref.id} value={ref.id}>
                  {ref.name}
                </option>
              ))}
            </Select>
          ))}
          {narrowed && (
            <Button variant="ghost" onClick={clear}>
              Clear filters
            </Button>
          )}
        </Toolbar>
        <DataGrid
          table={table}
          label="Tasks"
          noun="tasks"
          loading={isPending}
          rowClassName={() => 'cursor-pointer'}
          rowProps={(row) => ({
            // The title is the link a keyboard reaches; a click anywhere else on the row opens the task too, unless it was selecting text.
            onClick: (event) => {
              if ((event.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return
              void navigate({ to: '/tasks/$id', params: { id: String(row.id) } })
            },
          })}
          empty={
            isError ? (
              <EmptyState icon={ListTodo} title="Tasks could not be loaded" description="Try again in a moment." />
            ) : narrowed ? (
              <EmptyState
                icon={SearchX}
                title="No tasks match"
                description="Try the All tab, or clear the filters."
                action={
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : data.length && tab !== 'all' ? (
              <EmptyState icon={ListTodo} title={`No ${tabLabel(tab).toLowerCase()} tasks`} description="Tasks in other statuses are under their own tabs, and all of them are under All." />
            ) : (
              <EmptyState icon={ListTodo} title="No tasks yet" description="Tasks assigned to employees are listed on this page." action={action} />
            )
          }
        />
      </div>
    </div>
  )
}
