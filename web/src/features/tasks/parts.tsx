import { taskEventLabel } from '@shared/constants.ts'
import type { TaskEventRow, TaskRow } from '@shared/types.ts'
import { PanelHeader, Panel } from '@/components/ui/layout.tsx'
import { formatDateTime } from '@/lib/format.ts'

/** Who a task belongs to, as the shared permission checks take it. */
export const ownershipOf = (task: TaskRow) => ({
  assigneeUserId: task.assignee.id,
  assignerUserId: task.assigner.id,
  assignerSuperAdmin: task.assignerSuperAdmin,
  status: task.status,
})

/** What happened to a task, oldest first. */
export function TaskHistory({ events }: { events: TaskEventRow[] }) {
  return (
    <Panel>
      <PanelHeader
        title="History"
        description="What happened to this task, oldest first."
        className="border-b border-line"
      />
      <ol className="flex flex-col divide-y divide-line">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-1 px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
              <span className="font-medium text-ink-2">{event.actor}</span>
              <span>{formatDateTime(event.createdAt)}</span>
            </div>
            <p className="text-sm text-ink-2">
              {taskEventLabel(event.kind)}
              {event.details && <span className="text-ink-3"> · {event.details}</span>}
            </p>
            {event.note && (
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink [overflow-wrap:anywhere]">{event.note}</p>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  )
}

/** The note on the latest send-back, while the task is open again after it. */
export function sendBackNote(events: TaskEventRow[]) {
  const last = events.findLast((event) => event.kind === 'sent_back' || event.kind === 'completed')
  return last?.kind === 'sent_back' ? last : null
}
