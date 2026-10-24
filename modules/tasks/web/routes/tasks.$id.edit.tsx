import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { Alert } from '@/components/ui/feedback.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { usePageTitle, useUser } from '@/lib/session.ts'
import { canEditTask, taskClosedReason, taskEditReason } from '../../shared/permissions.ts'
import { TaskLoadError } from '../load-error.tsx'
import { ownershipOf } from '../parts.tsx'
import { taskQuery } from '../queries.ts'
import { TaskForm } from '../task-form.tsx'

export const Route = createFileRoute('/_app/tasks/$id/edit')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(taskQuery(Number(params.id))),
  errorComponent: ({ error }) => <TaskLoadError error={error} />,
  component: EditTaskPage,
})

function EditTaskPage() {
  const id = Number(Route.useParams({ select: (params) => params.id }))
  const user = useUser()
  const { data: task } = useQuery(taskQuery(id))
  usePageTitle(task ? `Edit ${task.title}` : 'Edit task')
  if (!task) return null
  // The page says why before anything is typed; the server refuses the same whatever the page shows.
  const ownership = ownershipOf(task)
  const refused = taskClosedReason(task.status) ?? (canEditTask(user, ownership) ? null : taskEditReason(ownership))

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to="/tasks/$id"
          params={{ id: String(task.id) }}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> {task.title}
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Edit task"
            description="Its history records which fields changed. Once it has been sent, the assignee is told."
          />
        </div>
      </div>
      {refused ? (
        <Alert tone="warn" title="This task cannot be edited">
          {refused}
        </Alert>
      ) : (
        <TaskForm task={task} />
      )}
    </div>
  )
}
