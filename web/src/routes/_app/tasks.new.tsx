import { createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { canAssignTasks } from '@shared/permissions.ts'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { PageHeader, Panel } from '@/components/ui/layout.tsx'
import { TaskForm } from '@/features/tasks/task-form.tsx'
import { usePageTitle, useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/tasks/new')({ component: AssignTaskPage })

function AssignTaskPage() {
  usePageTitle('Assign task')
  const allowed = canAssignTasks(useUser())
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Assign task"
        description="Each account picked gets its own copy, sent now or at the time scheduled."
      />
      {allowed ? (
        <TaskForm />
      ) : (
        <Panel>
          <EmptyState
            icon={Lock}
            title="Assign access needed"
            description="Assigning tasks needs Assign access to Employee Tasks."
            className="py-20"
          />
        </Panel>
      )}
    </div>
  )
}
