import { Link } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { ChangeSheet, Note, useChange } from '@/components/records/change-sheet.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Segmented } from '@/components/ui/form.tsx'
import { useDenied } from '@/lib/session.ts'
import { reviewStatusLabel } from '../shared/constants.ts'
import { REVIEW_OPEN_STATUSES } from '../shared/schemas.ts'
import type { ReviewDetail } from '../shared/types.ts'

type Task = 'status' | 'void'

/** Edit, Change status and Void, for the account that may change the review. The server refuses anyone else whatever the page shows. */
export function ReviewActions({ review }: { review: ReviewDetail }) {
  const noVoid = useDenied('reviews', 'full')
  const [task, setTask] = useState<Task | null>(null)
  const close = () => setTask(null)
  return (
    <>
      <Link to="/reviews/$code/edit" params={{ code: review.code }} className={buttonStyles('secondary')}>
        <Pencil className="size-4" aria-hidden /> Edit
      </Link>
      <Button onClick={() => setTask('status')}>Change status</Button>
      <Button variant="danger-ghost" disabledReason={noVoid} onClick={() => setTask('void')}>
        Void
      </Button>
      {task === 'status' && <StatusSheet review={review} onClose={close} />}
      {task === 'void' && <VoidSheet review={review} onClose={close} />}
    </>
  )
}

const path = (review: ReviewDetail, task: Task) => `/reviews/${encodeURIComponent(review.code)}/${task}`
const about = (review: ReviewDetail) => `${review.code} · ${review.title}`

function StatusSheet({ review, onClose }: { review: ReviewDetail; onClose: () => void }) {
  const options = REVIEW_OPEN_STATUSES.filter((status) => status !== review.status).map((value) => ({
    value,
    label: reviewStatusLabel(value),
  }))
  const [status, setStatus] = useState<(typeof options)[number]['value'] | null>(null)
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<string>()
  const change = useChange<ReviewDetail>(
    path(review, 'status'),
    (next) => `${next.code} is now ${reviewStatusLabel(next.status)}`,
    onClose,
  )

  function commit() {
    setMissing(status ? undefined : 'Choose a status')
    if (status) void change.send({ status, note })
  }

  return (
    <ChangeSheet
      title="Change status"
      description={about(review)}
      submit="Change status"
      change={change}
      onSubmit={commit}
      onClose={onClose}
    >
      <Field
        label="New status"
        hint={`It is ${reviewStatusLabel(review.status)} now.`}
        error={missing ?? change.field('status')}
      >
        <Segmented value={status} onChange={setStatus} options={options} />
      </Field>
      {status === 'completed' && (
        <Alert>
          Completing the review is its sign-off, once every CAP is Completed or Cancelled. It then takes no new CAPs,
          updates or files until it is reopened.
        </Alert>
      )}
      <Field label="Note" optional hint="Shown on the history with the change." error={change.field('note')}>
        <Note value={note} onChange={setNote} />
      </Field>
    </ChangeSheet>
  )
}

function VoidSheet({ review, onClose }: { review: ReviewDetail; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState<string>()
  const change = useChange<ReviewDetail>(path(review, 'void'), (next) => `${next.code} voided`, onClose)

  function commit() {
    setMissing(reason.trim() ? undefined : 'Say why it is being voided')
    if (reason.trim()) void change.send({ reason })
  }

  return (
    <ChangeSheet
      title="Void this review"
      description={about(review)}
      submit="Void review"
      danger
      change={change}
      onSubmit={commit}
      onClose={onClose}
    >
      <Alert tone="warn" title="This cannot be undone">
        A voided review is kept as a record, with its history, its CAPs and this reason, but nothing about it can be
        changed again and its CAPs leave the action items. Use it for a review entered by mistake; one that is done is
        completed instead.
      </Alert>
      <Field label="Reason" hint="Shown on the history." error={missing ?? change.field('reason')}>
        <Note value={reason} onChange={setReason} />
      </Field>
    </ChangeSheet>
  )
}
