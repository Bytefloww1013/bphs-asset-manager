import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { reviewEntryCode, reviewEntryKindLabel } from '@shared/constants.ts'
import { canManageReview } from '@shared/permissions.ts'
import type { ReviewPerson } from '@shared/types.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { buttonStyles } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { Timeline } from '@/features/common/timeline.tsx'
import { ReviewLoadError } from '@/features/reviews/load-error.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { ReviewStatusBadge } from '@/features/reviews/status.tsx'
import { formatDateTime, plural } from '@/lib/format.ts'
import { reviewEntriesQuery, reviewQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/reviews/$code/')({
  loader: ({ context, params }) => Promise.all([context.queryClient.ensureQueryData(reviewQuery(params.code)), context.queryClient.ensureQueryData(reviewEntriesQuery(params.code))]),
  errorComponent: ReviewLoadError,
  component: ReviewPage,
})

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

/** As on a grievance, someone who has been archived keeps their place on the review and is marked. */
function Person({ person }: { person: ReviewPerson }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>{person.name}</span>
      <Mono className="text-xs font-normal text-ink-3">{person.code}</Mono>
      {person.archived && (
        <Badge tone="neutral" dot={false}>
          archived
        </Badge>
      )}
    </span>
  )
}

function ReviewPage() {
  const { code } = Route.useParams()
  const user = useUser()
  const { data: review } = useQuery(reviewQuery(code))
  const { data: entries } = useQuery(reviewEntriesQuery(code))
  useReviewPageTitle(review?.code ?? code.toUpperCase())
  if (!review || !entries) return null
  // A voided review takes nothing more; the server refuses it whatever the page shows.
  const manage = review.status !== 'voided' && canManageReview(user, review.reviewer.id)
  const count = (kind: string) => entries.filter((entry) => entry.kind === kind).length
  const times = entries.map((entry) => entry.occurredAt).sort()
  const summary: [string, ReactNode][] = [
    ['Status', <ReviewStatusBadge status={review.status} />],
    ['Review date', <Mono>{review.reviewDate}</Mono>],
    [
      'Entries',
      <>
        {entries.length}
        <span className="block text-xs font-normal text-ink-3">
          {plural(count('update'), 'update')}, {plural(count('correction'), 'correction')}, {count('system')} automatic
        </span>
      </>,
    ],
    ['First activity', <Mono>{formatDateTime(times[0])}</Mono>],
    ['Latest activity', <Mono>{formatDateTime(times.at(-1))}</Mono>],
    ...(review.completedAt ? [['Completed', <Mono>{formatDateTime(review.completedAt)}</Mono>] as [string, ReactNode]] : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/reviews" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Reviews
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Mono className="text-sm font-medium text-ink-2">{review.code}</Mono>
          <ReviewStatusBadge status={review.status} />
        </div>
        <h1 className="mt-1.5 max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">{review.title}</h1>
        <p className="mt-1.5 max-w-[75ch] text-sm text-ink-2 [overflow-wrap:anywhere]">{review.summary}</p>
        {manage && (
          <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
            <Link to="/reviews/$code/edit" params={{ code: review.code }} className={buttonStyles('secondary')}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Link>
          </div>
        )}
      </div>

      {review.status === 'voided' && (
        <Alert tone="warn" title="This review has been voided">
          It is kept as a record and cannot be changed. The reason is on its timeline.
        </Alert>
      )}

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Review date">
            <Mono>{review.reviewDate}</Mono>
          </Fact>
          <Fact label="Employee reviewed">
            <Person person={review.employee} />
          </Fact>
          <Fact label="Reviewed by">
            <Person person={review.reviewer} />
          </Fact>
          <Fact label="Recorded">
            {review.recordedBy ?? 'A removed account'}
            <div className="mt-0.5 text-xs font-normal text-ink-3">{formatDateTime(review.createdAt)}</div>
          </Fact>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Findings" className="border-b border-line" />
        <p className="max-w-[75ch] whitespace-pre-line px-5 py-5 text-sm text-ink-2 [overflow-wrap:anywhere]">{review.findings || 'None written yet.'}</p>
      </Panel>

      <Panel>
        <PanelHeader title="Review" description={review.version === 1 ? 'As it was recorded.' : `Version ${review.version}. Each edit is on the history, with what it replaced.`} className="border-b border-line" />
        {review.bodyHtml ? <RichTextView html={review.bodyHtml} className="max-w-[75ch] px-5 py-5" /> : <p className="px-5 py-5 text-sm text-ink-3">The review in full has not been written yet.</p>}
      </Panel>

      {/* As on a grievance: beside the timeline on a wide screen, and first in the page's order. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel aria-label="Summary" className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 print:hidden">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 lg:grid-cols-1">
            {summary.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel className="lg:col-start-1 lg:row-start-1">
          <PanelHeader
            title="Timeline"
            description="Updates since the review, and every change made to it, by when they happened."
            actions={
              manage && (
                <Link to="/reviews/$code/entries/new" params={{ code: review.code }} className={buttonStyles('primary')}>
                  <Plus className="size-4" aria-hidden /> Add update
                </Link>
              )
            }
            className="border-b border-line"
          />
          <Timeline
            entries={entries}
            filters={[['update', 'Updates']]}
            kindLabel={reviewEntryKindLabel}
            entryCode={reviewEntryCode}
            orderKey="review-timeline-order"
            actions={(entry) =>
              manage && (
                <Link to="/reviews/$code/entries/new" params={{ code: review.code }} search={{ corrects: entry.seq }} className="font-medium text-accent hover:underline print:hidden">
                  Add correction<span className="sr-only"> to {reviewEntryCode(entry.seq)}</span>
                </Link>
              )
            }
          />
        </Panel>
      </div>
    </div>
  )
}
