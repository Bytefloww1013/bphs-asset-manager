import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { TASK_NOTE_MAX } from '@shared/constants.ts'
import type { TaskDetail } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Textarea } from '@/components/ui/form.tsx'
import { Fact, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { FilePicker, filesProblem, withFiles } from '@/features/common/files.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { TASK_FILES_HINT, TaskFiles } from '@/features/tasks/files.tsx'
import { TaskLoadError } from '@/features/tasks/load-error.tsx'
import { TaskHistory, sendBackNote } from '@/features/tasks/parts.tsx'
import { TaskStatusBadge } from '@/features/tasks/status.tsx'
import { ApiError, api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { myTaskQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

// Not nested in the Tasks page: a task replaces the list.
export const Route = createFileRoute('/_app/me/tasks_/$id')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(myTaskQuery(Number(params.id))),
  errorComponent: ({ error }) => <TaskLoadError error={error} mine />,
  component: MyTaskPage,
})

function MyTaskPage() {
  const id = Number(Route.useParams({ select: (params) => params.id }))
  const { data: task } = useQuery(myTaskQuery(id))
  usePageTitle(task?.title ?? 'Task')
  if (!task) return null
  const sentBack = task.status === 'outstanding' || task.status === 'past_due' ? sendBackNote(task.events) : null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/me/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Tasks
        </Link>
        <div className="mt-3">
          <TaskStatusBadge status={task.status} />
        </div>
        {/* Marking it complete takes its form away; focus comes here, by the new status, rather than falling to the page. */}
        <h1
          id="my-task-title"
          tabIndex={-1}
          className="mt-1.5 text-2xl font-semibold tracking-[-0.015em] text-ink outline-none [overflow-wrap:anywhere]"
        >
          {task.title}
        </h1>
      </div>

      {sentBack && (
        <Alert tone="warn" title={`Sent back by ${sentBack.actor}`}>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{sentBack.note}</p>
        </Alert>
      )}
      {task.status === 'awaiting_approval' && (
        <Alert tone="accent" title="Awaiting approval">
          You marked this complete. It now waits for {task.assigner.name} or another task manager to approve it.
        </Alert>
      )}
      {task.status === 'cancelled' && (
        <Alert title="Cancelled">This task was cancelled, so there is nothing more to do.</Alert>
      )}

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-3 sm:divide-x">
          <Fact label="From">{task.assigner.name}</Fact>
          <Fact label="Assigned">{formatDateTime(task.sendAt)}</Fact>
          <Fact label="Due">{formatDateTime(task.dueAt)}</Fact>
        </dl>
        {task.completedAt && (
          <dl className="grid divide-line border-t border-line max-sm:divide-y sm:grid-cols-3 sm:divide-x">
            <Fact label="Completed">{formatDateTime(task.completedAt)}</Fact>
            <Fact label="Approved">
              {task.approvedAt ? formatDateTime(task.approvedAt) : task.requiresApproval ? 'Not yet' : 'Not needed'}
            </Fact>
            <Fact label="Your note">{task.completionNote}</Fact>
          </dl>
        )}
      </Panel>

      {task.bodyHtml && (
        <Panel>
          <PanelHeader title="Details" className="border-b border-line" />
          <RichTextView html={task.bodyHtml} className="max-w-[75ch] px-5 py-5" />
        </Panel>
      )}

      <TaskFiles task={task} base="/me/tasks" />

      {(task.status === 'outstanding' || task.status === 'past_due') && <CompleteForm task={task} />}

      <TaskHistory events={task.events} />
    </div>
  )
}

function CompleteForm({ task }: { task: TaskDetail }) {
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const tooLong = note.trim().length > TASK_NOTE_MAX
  const filesWrong = filesProblem(files)
  // A file kept from before a send back counts towards a required one.
  const hasFile = task.attachments.some((file) => file.side === 'assignee' && !file.withdrawnAt)
  const needsFile = task.requiresFile && !hasFile && !files.length
  const complete = useWrite(
    () => api.post<TaskDetail>(`/me/tasks/${task.id}/complete`, withFiles({ note: note.trim() || undefined }, files)),
    {
      success: (now) => (now.status === 'awaiting_approval' ? 'Sent for approval' : 'Task completed'),
      onSuccess: () => {
        setNote('')
        setFiles([])
        requestAnimationFrame(() => document.getElementById('my-task-title')?.focus())
      },
    },
  )
  return (
    <Panel>
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!tooLong && !filesWrong && !needsFile) complete.mutate(undefined)
        }}
      >
        <Field
          label="Completion note"
          optional
          hint={
            task.requiresApproval
              ? 'This task needs approval, so it waits for the assigner once you mark it complete.'
              : `${note.trim().length} of ${TASK_NOTE_MAX} characters`
          }
          error={tooLong ? `A note can be at most ${TASK_NOTE_MAX} characters.` : null}
        >
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <Field
          label="Files"
          optional={!task.requiresFile}
          hint={
            !task.requiresFile
              ? TASK_FILES_HINT
              : hasFile
                ? `This task needs a file with its completion. The one already on it counts, or attach more. ${TASK_FILES_HINT}`
                : `This task needs a file with its completion. ${TASK_FILES_HINT}`
          }
          error={filesWrong ?? (complete.error instanceof ApiError ? complete.error.fields.files : undefined)}
        >
          <FilePicker value={files} onChange={(picked) => (setFiles(picked), complete.reset())} />
        </Field>
        <div>
          <Button
            type="submit"
            variant="primary"
            icon={<CheckCircle2 className="size-4" aria-hidden />}
            loading={complete.isPending}
            disabledReason={needsFile ? 'This task needs a file with its completion. Attach one.' : undefined}
          >
            Mark complete
          </Button>
        </div>
      </form>
    </Panel>
  )
}
