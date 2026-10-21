import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, FileText, Flag, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { reviewCapCode, reviewEntryCode, reviewEntryKindLabel } from '@shared/constants.ts'
import { canManageReview } from '@shared/permissions.ts'
import type { ReviewCap, ReviewEntry } from '@shared/types.ts'
import { buttonStyles } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Fact, Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { AttachFiles, AttachmentList } from '@/features/common/files.tsx'
import { Timeline } from '@/features/common/timeline.tsx'
import { ReviewLoadError } from '@/features/reviews/load-error.tsx'
import { ReviewActions } from '@/features/reviews/manage.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { Person } from '@/features/reviews/parts.tsx'
import { CapFacts, CapLink } from '@/features/reviews/cap-parts.tsx'
import { ReviewCapStatusBadge, ReviewStatusBadge } from '@/features/reviews/status.tsx'
import { formatDateTime, plural } from '@/lib/format.ts'
import { reviewAttachmentsQuery, reviewCapsQuery, reviewEntriesQuery, reviewQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/reviews/$code/')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(reviewQuery(params.code)),
      context.queryClient.ensureQueryData(reviewEntriesQuery(params.code)),
      context.queryClient.ensureQueryData(reviewCapsQuery(params.code)),
      context.queryClient.ensureQueryData(reviewAttachmentsQuery(params.code)),
    ]),
  errorComponent: ReviewLoadError,
  component: ReviewPage,
})

/** A CAP as the timeline draws it: in the place an Action takes on a grievance, numbered CAP01 rather than as an entry. */
type CapRow = Omit<ReviewEntry, 'kind'> & { kind: 'cap'; code: string; plan: ReviewCap }
type Row = ReviewEntry | CapRow

const capRow = (cap: ReviewCap): CapRow => ({
  id: cap.id,
  seq: cap.seq,
  code: reviewCapCode(cap.seq),
  kind: 'cap',
  cap: cap.seq,
  occurredAt: cap.createdAt,
  recordedAt: cap.createdAt,
  title: cap.title,
  shortDescription: cap.shortDescription,
  bodyHtml: cap.bodyHtml,
  documentedBy: cap.addedBy ?? 'A removed account',
  corrects: null,
  correctedBy: [],
  plan: cap,
})

function ReviewPage() {
  const { code } = Route.useParams()
  const user = useUser()
  const { data: review } = useQuery(reviewQuery(code))
  const { data: entries } = useQuery(reviewEntriesQuery(code))
  const { data: caps } = useQuery(reviewCapsQuery(code))
  const { data: files } = useQuery(reviewAttachmentsQuery(code))
  useReviewPageTitle(review?.code ?? code.toUpperCase())
  if (!review || !entries || !caps || !files) return null
  // A voided review takes nothing more, and a completed one nothing until it is reopened; the server refuses both whatever the page shows.
  const manage = review.status !== 'voided' && canManageReview(user, review.reviewer.id)
  const add = manage && review.status !== 'completed'
  const counted = caps.filter((cap) => cap.status !== 'cancelled')
  const count = (kind: string) => entries.filter((entry) => entry.kind === kind).length
  const times = entries.map((entry) => entry.occurredAt).sort()
  const summary: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <ReviewStatusBadge status={review.status} /> },
    { label: 'Review date', value: <Mono>{review.reviewDate}</Mono> },
    {
      label: 'CAPs',
      value: caps.length ? (
        <>
          {counted.filter((cap) => cap.status === 'completed').length} of {counted.length} done
          <ul className="mt-1.5 flex flex-col gap-1 font-normal">
            {caps.map((cap) => (
              <li key={cap.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <CapLink code={review.code} seq={cap.seq} />
                <ReviewCapStatusBadge status={cap.status} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span className="font-normal text-ink-3">None yet</span>
      ),
    },
    {
      label: 'Entries',
      value: (
        <>
          {entries.length}
          <span className="block text-xs font-normal text-ink-3">
            {plural(count('update'), 'update')}, {plural(count('correction'), 'correction')}, {count('system')}{' '}
            automatic
          </span>
        </>
      ),
    },
    { label: 'First activity', value: <Mono>{formatDateTime(times[0])}</Mono> },
    { label: 'Latest activity', value: <Mono>{formatDateTime(times.at(-1))}</Mono> },
    ...(review.completedAt ? [{ label: 'Completed', value: <Mono>{formatDateTime(review.completedAt)}</Mono> }] : []),
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
        <h1 className="mt-1.5 max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">
          {review.title}
        </h1>
        <p className="mt-1.5 max-w-[75ch] text-sm text-ink-2 [overflow-wrap:anywhere]">{review.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
          {manage && <ReviewActions review={review} />}
          <Link to="/reviews/$code/case-file" params={{ code: review.code }} className={buttonStyles('secondary')}>
            <FileText className="size-4" aria-hidden /> Case file
          </Link>
        </div>
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
        <p className="max-w-[75ch] whitespace-pre-line px-5 py-5 text-sm text-ink-2 [overflow-wrap:anywhere]">
          {review.findings || 'None written yet.'}
        </p>
      </Panel>

      <Panel>
        <PanelHeader
          title="Review"
          description={
            review.version === 1
              ? 'As it was recorded.'
              : `Version ${review.version}. Each edit is on the history, with what it replaced.`
          }
          className="border-b border-line"
        />
        {review.bodyHtml ? (
          <RichTextView html={review.bodyHtml} className="max-w-[75ch] px-5 py-5" />
        ) : (
          <p className="px-5 py-5 text-sm text-ink-3">The review in full has not been written yet.</p>
        )}
      </Panel>

      {files.length > 0 && (
        <Panel>
          <PanelHeader
            title="Files"
            description="On the review and its CAPs. Each one downloads to be opened on your computer. Downloads are logged."
            className="border-b border-line"
          />
          <AttachmentList section="reviews" code={review.code} files={files} sealed={!add} />
        </Panel>
      )}

      {/* As on a grievance: beside the timeline on a wide screen, and first in the page's order. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <Panel aria-label="Summary" className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 print:hidden">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 lg:grid-cols-1">
            {summary.map(({ label, value }) => (
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
            description="Its CAPs, the updates since the review, and every change made to it, by when they happened."
            actions={
              add && (
                <>
                  <AttachFiles section="reviews" code={review.code} />
                  <Link
                    to="/reviews/$code/caps/new"
                    params={{ code: review.code }}
                    className={buttonStyles('secondary')}
                  >
                    <Flag className="size-4" aria-hidden /> Add CAP
                  </Link>
                  <Link
                    to="/reviews/$code/entries/new"
                    params={{ code: review.code }}
                    className={buttonStyles('primary')}
                  >
                    <Plus className="size-4" aria-hidden /> Add update
                  </Link>
                </>
              )
            }
            className="border-b border-line"
          />
          <Timeline<Row>
            entries={[...entries, ...caps.map(capRow)]}
            filters={[
              ['cap', 'CAPs'],
              ['update', 'Updates'],
            ]}
            kindLabel={(kind) => (kind === 'cap' ? 'CAP' : reviewEntryKindLabel(kind))}
            entryCode={reviewEntryCode}
            orderKey="review-timeline-order"
            link={(row, title) =>
              row.kind === 'cap' ? (
                <Link
                  to="/reviews/$code/caps/$cap"
                  params={{ code: review.code, cap: row.code }}
                  className="hover:text-accent hover:underline"
                >
                  {title}
                </Link>
              ) : (
                title
              )
            }
            tags={(row) =>
              row.kind === 'cap' ? (
                <CapFacts cap={row.plan} />
              ) : (
                row.cap !== null && <CapLink code={review.code} seq={row.cap} chip />
              )
            }
            actions={(entry) =>
              add &&
              entry.kind !== 'cap' && (
                <Link
                  to="/reviews/$code/entries/new"
                  params={{ code: review.code }}
                  search={{ corrects: entry.seq }}
                  className="font-medium text-accent hover:underline print:hidden"
                >
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
