import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ListTodo } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui/feedback.tsx'
import { FilterTabs, Switch } from '@/components/ui/form.tsx'
import { PageHeader, Panel } from '@/components/ui/layout.tsx'
import { formatDateTime } from '@/lib/format.ts'
import { usePageTitle } from '@/lib/session.ts'
import { TASK_OPEN } from '../../shared/constants.ts'
import type { TaskRow } from '../../shared/types.ts'
import { myTasksQuery } from '../queries.ts'
import { TaskStatusBadge } from '../status.tsx'

type View = 'open' | 'completed'
const VIEW_LABEL: Record<View, string> = { open: 'Open', completed: 'Completed' }
const EMPTY: Record<View, string> = { open: 'Nothing to do', completed: 'Nothing completed yet' }

export const Route = createFileRoute('/_app/me/tasks')({
  // Open is where the page starts, so the address names only the other choices.
  validateSearch: (search: Record<string, unknown>): { view?: 'completed'; cancelled?: true } => ({
    view: search.view === 'completed' ? 'completed' : undefined,
    cancelled: search.cancelled === true || search.cancelled === 'true' ? true : undefined,
  }),
  component: MyTasksPage,
})

// Cancelled tasks belong to neither view, so "Show cancelled" adds them to whichever is showing.
const inView = (view: View) => (task: TaskRow) =>
  task.status === 'cancelled' || (view === 'open' ? TASK_OPEN.includes(task.status) : task.status === 'completed')

function MyTasksPage() {
  usePageTitle('Tasks')
  const search = Route.useSearch()
  const view: View = search.view ?? 'open'
  const cancelled = search.cancelled ?? false
  const navigate = useNavigate({ from: Route.fullPath })
  const list = useQuery(myTasksQuery(cancelled))
  const rows = list.data?.filter(inView(view)) ?? []
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tasks" description="Work assigned to you, soonest due first." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          label="Show"
          value={view}
          onChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, view: next === 'open' ? undefined : next }) })
          }
          options={(['open', 'completed'] as const).map((value) => ({ value, label: VIEW_LABEL[value] }))}
        />
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <Switch
            id="show-cancelled"
            label="Show cancelled"
            checked={cancelled}
            onChange={(next) => void navigate({ search: (prev) => ({ ...prev, cancelled: next || undefined }) })}
          />
          <label htmlFor="show-cancelled">Show cancelled</label>
        </div>
      </div>

      <Panel>
        {list.isError ? (
          <EmptyState icon={ListTodo} title="Tasks could not be loaded" description="Try again in a moment." />
        ) : list.isPending ? (
          <div className="flex justify-center py-14">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ListTodo} title={EMPTY[view]} />
        ) : (
          <ul aria-label={`${VIEW_LABEL[view]} tasks`} className="divide-y divide-line">
            {rows.map((task) => (
              <li key={task.id}>
                <Link
                  to="/me/tasks/$id"
                  params={{ id: String(task.id) }}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-sunken/60 focus-visible:-outline-offset-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink [overflow-wrap:anywhere]">{task.title}</p>
                    <p className="text-xs text-ink-3">
                      From {task.assigner.name} · Due <time dateTime={task.dueAt}>{formatDateTime(task.dueAt)}</time>
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
