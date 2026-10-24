import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageHeader } from '@/components/ui/layout.tsx'
import { usePageTitle } from '@/lib/session.ts'
import { canAssignTasks } from '../../shared/permissions.ts'
import { TaskForm } from '../task-form.tsx'

export const Route = createFileRoute('/_app/tasks/new')({
  // Assigning needs Assign access, as the API does; without it the page does not exist (issue #27).
  beforeLoad: ({ context }) => {
    if (!canAssignTasks(context.user)) throw notFound()
  },
  component: AssignTaskPage,
})

function AssignTaskPage() {
  usePageTitle('Assign task')
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Assign task"
        description="Each account picked gets its own copy, sent now or at the time scheduled."
      />
      <TaskForm />
    </div>
  )
}
