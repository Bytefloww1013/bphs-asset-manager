import { Link } from '@tanstack/react-router'
import { ListTodo } from 'lucide-react'
import { buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { ApiError } from '@/lib/api.ts'

/** A task page that could not load, with the way back to its list: Employee Tasks or My Space. */
export function TaskLoadError({ error, mine = false }: { error: unknown; mine?: boolean }) {
  return (
    <EmptyState
      icon={ListTodo}
      title={error instanceof ApiError && (error.status === 404 || error.status === 422) ? `No task${mine ? ' of yours' : ''} with that ID` : 'Could not load this task'}
      description={error instanceof Error ? error.message : undefined}
      action={
        <Link to={mine ? '/me/tasks' : '/tasks'} className={buttonStyles('primary')}>
          Back to tasks
        </Link>
      }
    />
  )
}
