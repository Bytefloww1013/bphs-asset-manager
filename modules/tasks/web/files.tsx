import { useState } from 'react'
import { ChangeSheet, useChange } from '@/components/records/change-sheet.tsx'
import { FILE_RULES, FileRow } from '@/components/records/files.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Textarea } from '@/components/ui/form.tsx'
import { Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { useUser } from '@/lib/session.ts'
import { TASK_NOTE_MAX } from '../shared/constants.ts'
import { taskFileWithdrawProblem } from '../shared/permissions.ts'
import type { TaskAttachment, TaskDetail } from '../shared/types.ts'
import { ownershipOf } from './parts.tsx'

export const TASK_FILES_HINT = `${FILE_RULES} A file added by mistake can be withdrawn, with a reason.`

const SIDE_LABEL: Record<TaskAttachment['side'], string> = {
  assigner: 'With the task',
  assignee: 'With the completion',
}

/**
 * A task's files, for Employee Tasks (`base` `/tasks`) or My Space (`/me/tasks`). Each downloads as a file to save. A withdrawn
 * file stays on the list, with the reason, but no longer downloads. Nothing shows while the task has no files.
 */
export function TaskFiles({ task, base }: { task: TaskDetail; base: '/tasks' | '/me/tasks' }) {
  const user = useUser()
  const [withdrawing, setWithdrawing] = useState<TaskAttachment | null>(null)
  if (!task.attachments.length) return null
  const ownership = ownershipOf(task)
  return (
    <Panel>
      <PanelHeader title="Files" className="border-b border-line" />
      <ul className="divide-y divide-line">
        {task.attachments.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            href={`/api${base}/${task.id}/attachments/${file.id}`}
            details={<> · {SIDE_LABEL[file.side]}</>}
            action={
              <Button
                size="sm"
                variant="danger-ghost"
                disabledReason={taskFileWithdrawProblem(user, ownership, file) ?? undefined}
                onClick={() => setWithdrawing(file)}
              >
                Withdraw
              </Button>
            }
          />
        ))}
      </ul>
      {withdrawing && (
        <WithdrawSheet
          path={`${base}/${task.id}/attachments/${withdrawing.id}/withdraw`}
          file={withdrawing}
          onClose={() => setWithdrawing(null)}
        />
      )}
    </Panel>
  )
}

function WithdrawSheet({ path, file, onClose }: { path: string; file: TaskAttachment; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState<string>()
  const change = useChange<TaskDetail>(path, () => `${file.filename} withdrawn`, onClose)

  function commit() {
    setMissing(reason.trim() ? undefined : 'Say why it is being withdrawn')
    if (reason.trim()) void change.send({ reason: reason.trim() })
  }

  return (
    <ChangeSheet
      title="Withdraw this file"
      description={file.filename}
      submit="Withdraw file"
      danger
      change={change}
      onSubmit={commit}
      onClose={onClose}
    >
      <Alert tone="warn" title="This cannot be undone">
        A withdrawn file can no longer be downloaded. Its name, who added it and this reason stay on the task. Use it
        for a file added by mistake.
      </Alert>
      <Field label="Reason" hint="Shown in the task's history." error={missing ?? change.field('reason')}>
        <Textarea
          rows={4}
          maxLength={TASK_NOTE_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </ChangeSheet>
  )
}
