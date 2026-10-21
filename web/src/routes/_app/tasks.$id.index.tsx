import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2, ChevronLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { TASK_ASSIGNER_REMINDERS_LABEL, TASK_NOTE_MAX, TASK_REMINDER_PRESETS, TASK_REMINDER_PRESET_LABEL, TASK_WEEKDAY_LABEL } from '@shared/constants.ts'
import { canEditTask, taskApproveReason, taskClosedReason, taskEditReason } from '@shared/permissions.ts'
import type { TaskDetail } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Textarea } from '@/components/ui/form.tsx'
import { Fact, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { ConfirmDialog } from '@/components/ui/overlay.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { ChangeSheet, useChange } from '@/features/common/change-sheet.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { TaskFiles } from '@/features/tasks/files.tsx'
import { TaskLoadError } from '@/features/tasks/load-error.tsx'
import { TaskHistory, ownershipOf, sendBackNote } from '@/features/tasks/parts.tsx'
import { TaskStatusBadge } from '@/features/tasks/status.tsx'
import { api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { taskQuery } from '@/lib/queries.ts'
import { useDenied, usePageTitle, useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/tasks/$id/')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(taskQuery(Number(params.id))),
  errorComponent: ({ error }) => <TaskLoadError error={error} />,
  component: TaskPage,
})

/** "Weekdays at 09:00 (Europe/London)", "Mon, Wed at 14:30 (America/Chicago)" or "None". */
function remindersText(task: TaskDetail) {
  if (!task.reminderDays.length) return 'None'
  const days = task.reminderDays.join()
  const preset = (['weekdays', 'every_day'] as const).find((name) => TASK_REMINDER_PRESETS[name].join() === days)
  return `${preset ? TASK_REMINDER_PRESET_LABEL[preset] : task.reminderDays.map((day) => TASK_WEEKDAY_LABEL[day]).join(', ')} at ${task.reminderTime} (${task.reminderZone})`
}

function TaskPage() {
  const id = Number(Route.useParams({ select: (params) => params.id }))
  const navigate = useNavigate()
  const user = useUser()
  const { data: task } = useQuery(taskQuery(id))
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null)
  const [sendingBack, setSendingBack] = useState(false)
  usePageTitle(task?.title ?? 'Task')
  const noFull = useDenied('tasks', 'full')

  const cancel = useWrite(() => api.post<TaskDetail>(`/tasks/${id}/cancel`), { success: 'Task cancelled' })
  const approve = useWrite(() => api.post<TaskDetail>(`/tasks/${id}/approve`), { success: 'Task approved' })
  const remove = useWrite(() => api.delete(`/tasks/${id}`), {
    success: 'Task deleted',
    onSuccess: () => navigate({ to: '/tasks' }),
  })
  if (!task) return null

  const ownership = ownershipOf(task)
  // The server's checks, said before anything is pressed: a cancelled, completed or awaiting task takes no edit and no cancel.
  const noEdit = (canEditTask(user, ownership) ? null : taskEditReason(ownership)) ?? taskClosedReason(task.status) ?? undefined
  const noApprove = taskApproveReason(user, ownership) ?? undefined
  const sentBack = task.status === 'outstanding' || task.status === 'past_due' ? sendBackNote(task.events) : null

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> All tasks
        </Link>
        <div className="mt-3">
          <TaskStatusBadge status={task.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">{task.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {task.status === 'awaiting_approval' && (
              <>
                <Button variant="primary" icon={<CheckCircle2 className="size-4" aria-hidden />} disabledReason={noApprove} loading={approve.isPending} onClick={() => approve.mutate(undefined)}>
                  Approve
                </Button>
                <Button disabledReason={noApprove} onClick={() => setSendingBack(true)}>
                  Send back
                </Button>
              </>
            )}
            <Button disabledReason={noEdit} onClick={() => void navigate({ to: '/tasks/$id/edit', params: { id: String(id) } })}>
              Edit
            </Button>
            <Button variant="danger-ghost" disabledReason={noEdit} onClick={() => setConfirm('cancel')}>
              Cancel task
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} disabledReason={noFull} onClick={() => setConfirm('delete')}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {sentBack && (
        <Alert tone="warn" title={`Sent back by ${sentBack.actor}`}>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{sentBack.note}</p>
        </Alert>
      )}
      {task.cancelledAt && <Alert title="Cancelled">Cancelled {formatDateTime(task.cancelledAt)}. It stays as a record but has left {task.assignee.name}&rsquo;s list.</Alert>}

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Assigned to">{task.assignee.name}</Fact>
          <Fact label="Assigned by">{task.assigner.name}</Fact>
          <Fact label="Assigned">{formatDateTime(task.sendAt)}</Fact>
          <Fact label="Due">{formatDateTime(task.dueAt)}</Fact>
        </dl>
        <dl className="grid divide-line border-t border-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Requires approval">{task.requiresApproval ? 'Yes' : 'No'}</Fact>
          <Fact label="Requires a file">{task.requiresFile ? 'Yes' : 'No'}</Fact>
          <Fact label="Reminders">{remindersText(task)}</Fact>
          <Fact label="Past-due notices to the assigner">{TASK_ASSIGNER_REMINDERS_LABEL[task.assignerReminders]}</Fact>
        </dl>
        {task.completedAt && (
          <dl className="grid divide-line border-t border-line max-sm:divide-y sm:grid-cols-3 sm:divide-x">
            <Fact label="Completed">{formatDateTime(task.completedAt)}</Fact>
            <Fact label="Approved">{task.approvedAt ? formatDateTime(task.approvedAt) : task.requiresApproval ? 'Not yet' : 'Not needed'}</Fact>
            <Fact label="Completion note">{task.completionNote && <span className="whitespace-pre-wrap">{task.completionNote}</span>}</Fact>
          </dl>
        )}
      </Panel>

      {task.bodyHtml && (
        <Panel>
          <PanelHeader title="Details" className="border-b border-line" />
          <RichTextView html={task.bodyHtml} className="max-w-[75ch] px-5 py-5" />
        </Panel>
      )}

      <TaskFiles task={task} base="/tasks" />

      <TaskHistory events={task.events} />

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Cancel this task?"
        description={
          task.status === 'scheduled'
            ? `It stays as a record, marked Cancelled. It will not be sent, so ${task.assignee.name} never sees it. A cancelled task cannot be changed again.`
            : `It stays as a record, marked Cancelled, and leaves ${task.assignee.name}'s list. They are told it was cancelled. A cancelled task cannot be changed again.`
        }
        confirmLabel="Cancel task"
        tone="danger"
        onConfirm={() => cancel.mutateAsync(undefined)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this task?"
        description="It, its files, its history and its notifications are removed for good. A task that will not be done is usually cancelled instead."
        confirmLabel="Delete task"
        tone="danger"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
      {sendingBack && <SendBackSheet task={task} onClose={() => setSendingBack(false)} />}
    </div>
  )
}

function SendBackSheet({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<string>()
  const change = useChange<TaskDetail>(`/tasks/${task.id}/send-back`, () => `Sent back to ${task.assignee.name}`, onClose)

  function commit() {
    setMissing(note.trim() ? undefined : 'Say what still needs doing')
    if (note.trim()) void change.send({ note: note.trim() })
  }

  return (
    <ChangeSheet title="Send back" description={task.title} submit="Send back" change={change} onSubmit={commit} onClose={onClose}>
      <Field label="Note" hint={`${task.assignee.name} sees it on the task, which is open again.`} error={missing ?? change.field('note')}>
        <Textarea rows={4} maxLength={TASK_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </ChangeSheet>
  )
}
