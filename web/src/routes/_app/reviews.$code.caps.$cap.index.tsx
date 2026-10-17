import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2, ChevronLeft, FileQuestion, Plus } from 'lucide-react'
import { useState } from 'react'
import { REVIEW_CAP_STATUSES, reviewCapCode, reviewCapSeq, reviewCapStatusLabel, reviewEntryCode, reviewEntryKindLabel, type ReviewCapStatus } from '@shared/constants.ts'
import { canManageReview, reviewManageReason } from '@shared/permissions.ts'
import { GRIEVANCE_NOTE_MAX } from '@shared/schemas.ts'
import type { ReviewCap, ReviewDetail } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, EmptyState } from '@/components/ui/feedback.tsx'
import { Field, Segmented, Textarea } from '@/components/ui/form.tsx'
import { Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { EntryMarker, Timeline } from '@/features/common/timeline.tsx'
import { ReviewLoadError } from '@/features/reviews/load-error.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { Fact, Person } from '@/features/reviews/parts.tsx'
import { ReviewCapStatusBadge } from '@/features/reviews/status.tsx'
import { ApiError, api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { reviewCapsQuery, reviewEntriesQuery, reviewQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/reviews/$code/caps/$cap/')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(reviewQuery(params.code)),
      context.queryClient.ensureQueryData(reviewEntriesQuery(params.code)),
      context.queryClient.ensureQueryData(reviewCapsQuery(params.code)),
    ]),
  errorComponent: ReviewLoadError,
  component: CapPage,
})

const closed = (status: ReviewCapStatus) => status === 'completed' || status === 'cancelled'

function CapPage() {
  const { code, cap: named } = Route.useParams()
  const user = useUser()
  const navigate = useNavigate()
  const { data: review } = useQuery(reviewQuery(code))
  const { data: entries } = useQuery(reviewEntriesQuery(code))
  const { data: caps } = useQuery(reviewCapsQuery(code))
  const [task, setTask] = useState<ReviewCapStatus | 'status' | null>(null)
  const cap = caps?.find((one) => one.seq === reviewCapSeq(named))
  useReviewPageTitle(`${cap ? reviewCapCode(cap.seq) : named.toUpperCase()} of ${review?.code ?? code.toUpperCase()}`)
  if (!review || !entries || !caps) return null

  const back = (
    <Link to="/reviews/$code" params={{ code: review.code }} className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
      <ChevronLeft className="size-4" aria-hidden /> {review.code}
    </Link>
  )
  if (!cap) {
    return (
      <div className="flex flex-col gap-6">
        <div>{back}</div>
        <EmptyState
          icon={FileQuestion}
          title="No CAP with that number"
          description={caps.length ? `${review.code} has ${caps.length === 1 ? 'one CAP' : `${caps.length} CAPs`}, ${reviewCapCode(1)} to ${reviewCapCode(caps.length)}.` : `${review.code} has no CAPs yet.`}
          action={
            <Link to="/reviews/$code" params={{ code: review.code }} className={buttonStyles('primary')}>
              Back to the review
            </Link>
          }
        />
      </div>
    )
  }

  const capCode = reviewCapCode(cap.seq)
  // Its own history: what the app wrote about it, and the updates and corrections filed under it.
  const history = entries.filter((entry) => entry.cap === cap.seq)
  // Someone who may not use a button still sees it, with the reason, as on a grievance; the server refuses whatever the page shows.
  const refused =
    review.status === 'completed' ? `${review.code} is Completed. Reopen it to change a CAP.` : canManageReview(user, review.reviewer.id) ? undefined : reviewManageReason(review.reviewer.name)
  const manage = review.status !== 'voided'

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        {back}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <EntryMarker kind="cap" className="mt-0" />
              <Mono className="text-sm font-medium text-ink-2">{capCode}</Mono>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Corrective action plan</span>
              <ReviewCapStatusBadge status={cap.status} />
            </div>
            <h1 className="mt-1.5 max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">{cap.title}</h1>
            <p className="mt-1.5 max-w-[75ch] text-sm text-ink-2 [overflow-wrap:anywhere]">{cap.shortDescription}</p>
          </div>
        </div>
        {manage && (
          <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="primary" icon={<Plus className="size-4" />} disabledReason={refused} onClick={() => void navigate({ to: '/reviews/$code/entries/new', params: { code: review.code }, search: { cap: cap.seq } })}>
              Add update
            </Button>
            <Button
              disabledReason={refused ?? (closed(cap.status) ? `It is ${reviewCapStatusLabel(cap.status)}. Reopen it before editing it.` : undefined)}
              onClick={() => void navigate({ to: '/reviews/$code/caps/$cap/edit', params: { code: review.code, cap: capCode } })}
            >
              Edit
            </Button>
            <Button disabledReason={refused} onClick={() => setTask('status')}>
              Change status
            </Button>
            <Button icon={<CheckCircle2 className="size-4" />} disabledReason={refused ?? (closed(cap.status) ? `It is already ${reviewCapStatusLabel(cap.status)}.` : undefined)} onClick={() => setTask('completed')}>
              Mark complete
            </Button>
          </div>
        )}
      </div>

      {review.status === 'voided' && (
        <Alert tone="warn" title="This review has been voided">
          Its CAPs are kept as a record and cannot be changed.
        </Alert>
      )}

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Status">
            <ReviewCapStatusBadge status={cap.status} />
          </Fact>
          <Fact label="Responsible">
            <Person person={cap.responsible} />
          </Fact>
          <Fact label="Due date">{cap.dueDate ? <Mono>{cap.dueDate}</Mono> : <span className="font-normal text-ink-3">None set</span>}</Fact>
          <Fact label="Completed">
            {cap.completedAt ? (
              <>
                <Mono>{formatDateTime(cap.completedAt)}</Mono>
                <div className="mt-0.5 text-xs font-normal text-ink-3">{cap.completedBy}</div>
              </>
            ) : (
              <span className="font-normal text-ink-3">Not yet</span>
            )}
          </Fact>
        </dl>
        <dl className="grid divide-line border-t border-line max-sm:divide-y sm:grid-cols-2 sm:divide-x">
          <Fact label="Review">
            <Link to="/reviews/$code" params={{ code: review.code }} className="text-accent hover:underline">
              <Mono>{review.code}</Mono>
            </Link>{' '}
            <span className="font-normal text-ink-2 [overflow-wrap:anywhere]">{review.title}</span>
          </Fact>
          <Fact label="Added">
            {cap.addedBy ?? 'A removed account'}
            <div className="mt-0.5 text-xs font-normal text-ink-3">{formatDateTime(cap.createdAt)}</div>
          </Fact>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Details" description={cap.version === 1 ? 'As they were written.' : "As they are now. Each edit is on the history, with what it replaced."} className="border-b border-line" />
        {cap.bodyHtml ? <RichTextView html={cap.bodyHtml} className="max-w-[75ch] px-5 py-5" /> : <p className="px-5 py-5 text-sm text-ink-3">Nothing was written beyond the short description.</p>}
      </Panel>

      <Panel>
        <PanelHeader title="History" description={`Updates on ${capCode}, and every change made to it. The review's timeline shows these too.`} className="border-b border-line" />
        <Timeline
          entries={history}
          filters={[['update', 'Updates']]}
          kindLabel={reviewEntryKindLabel}
          entryCode={reviewEntryCode}
          orderKey="review-timeline-order"
          actions={(entry) =>
            manage &&
            !refused && (
              <Link to="/reviews/$code/entries/new" params={{ code: review.code }} search={{ corrects: entry.seq }} className="font-medium text-accent hover:underline print:hidden">
                Add correction<span className="sr-only"> to {reviewEntryCode(entry.seq)}</span>
              </Link>
            )
          }
        />
      </Panel>

      {task && <StatusSheet review={review} cap={cap} preset={task === 'status' ? null : task} onClose={() => setTask(null)} />}
    </div>
  )
}

/** Change a CAP's status. Mark complete opens it with Completed chosen. Cancelling needs a reason; any note goes on the history with the change. */
function StatusSheet({ review, cap, preset, onClose }: { review: ReviewDetail; cap: ReviewCap; preset: ReviewCapStatus | null; onClose: () => void }) {
  const options = REVIEW_CAP_STATUSES.filter((status) => status !== cap.status).map((value) => ({ value, label: reviewCapStatusLabel(value) }))
  const [status, setStatus] = useState<ReviewCapStatus | null>(preset)
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<{ status?: string; note?: string }>({})
  const [error, setError] = useState<ApiError | null>(null)
  const capCode = reviewCapCode(cap.seq)
  const write = useWrite((body: Record<string, unknown>) => api.post<ReviewCap>(`/reviews/${encodeURIComponent(review.code)}/caps/${cap.seq}/status`, body), {
    silent: true,
    success: (next) => `${capCode} is now ${reviewCapStatusLabel(next.status)}`,
  })
  const cancelling = status === 'cancelled'

  async function commit() {
    const next = { status: status ? undefined : 'Choose a status', note: cancelling && !note.trim() ? 'Say why it is being cancelled' : undefined }
    setMissing(next)
    if (next.status || next.note) return
    setError(null)
    try {
      // The version is the one on the page now: after someone else's change the page reloads, and a second try goes through.
      await write.mutateAsync({ status, note, version: cap.version })
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={preset === 'completed' ? 'Mark complete' : 'Change status'}
      description={`${capCode} · ${cap.title}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="cap-status-form" loading={write.isPending}>
            {preset === 'completed' ? 'Mark complete' : 'Change status'}
          </Button>
        </>
      }
    >
      <form
        id="cap-status-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void commit()
        }}
      >
        {error && !Object.keys(error.fields).length && (
          <Alert tone="bad" title="That did not go through">
            {error.message}
          </Alert>
        )}
        <Field label="New status" hint={`It is ${reviewCapStatusLabel(cap.status)} now.`} error={missing.status ?? error?.fields.status}>
          <Segmented value={status} onChange={setStatus} options={options} />
        </Field>
        {status === 'completed' && <Alert>The time and your name are recorded as its completion. Reopening it later clears them; the history keeps both.</Alert>}
        {cancelling && <Alert>A cancelled CAP stays on the review, with this reason, and no longer counts towards the review being done.</Alert>}
        <Field label={cancelling ? 'Reason' : 'Note'} optional={!cancelling} hint="Shown on the history with the change." error={missing.note ?? error?.fields.note}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={GRIEVANCE_NOTE_MAX} rows={4} />
        </Field>
      </form>
    </Sheet>
  )
}
