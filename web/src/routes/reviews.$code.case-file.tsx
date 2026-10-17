import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { reviewCapCode, reviewCapStatusLabel, reviewEntryCode, reviewEntryKindLabel, reviewStatusLabel } from '@shared/constants.ts'
import type { ReviewAttachment, ReviewCap } from '@shared/types.ts'
import { Mono } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { Entry, Fact, FileTable, Heading, Names, Printout, Row } from '@/features/common/printout.tsx'
import { ReviewLoadError } from '@/features/reviews/load-error.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { formatDateTime } from '@/lib/format.ts'
import { reviewAttachmentsQuery, reviewCapsQuery, reviewEntriesQuery, reviewQuery } from '@/lib/queries.ts'
import { requireSession } from '@/lib/session.ts'

// Outside the app shell, as the grievance case file is: the page is the review's case file as it prints.
export const Route = createFileRoute('/reviews/$code/case-file')({
  beforeLoad: async ({ context, location }) => {
    await requireSession(context.queryClient, location.href, 'reviews')
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(reviewQuery(params.code)),
      context.queryClient.ensureQueryData(reviewEntriesQuery(params.code)),
      context.queryClient.ensureQueryData(reviewCapsQuery(params.code)),
      context.queryClient.ensureQueryData(reviewAttachmentsQuery(params.code)),
    ]),
  errorComponent: ReviewLoadError,
  component: CaseFile,
})

/** One CAP with every field and the names of its files, kept on one page where it fits. */
function Cap({ cap, files, first }: { cap: ReviewCap; files: ReviewAttachment[]; first: boolean }) {
  return (
    <div className="break-inside-avoid pt-5">
      {first && <Heading>Corrective action plans</Heading>}
      <div className="text-xs text-ink-3">
        <Mono>{reviewCapCode(cap.seq)}</Mono> · <span className="uppercase tracking-wide">{reviewCapStatusLabel(cap.status)}</span>
      </div>
      <h3 className="font-semibold [overflow-wrap:anywhere]">{cap.title}</h3>
      <dl className="mt-1 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <Fact label="Responsible">
          <Names people={[cap.responsible]} />
        </Fact>
        <Fact label="Due">{cap.dueDate ? <Mono>{cap.dueDate}</Mono> : 'No due date'}</Fact>
        <Fact label="Added">
          {cap.addedBy ?? 'A removed account'}, {formatDateTime(cap.createdAt)}
        </Fact>
        {cap.completedAt && (
          <Fact label="Completed">
            {cap.completedBy}, {formatDateTime(cap.completedAt)}
          </Fact>
        )}
      </dl>
      <p className="mt-2 [overflow-wrap:anywhere]">{cap.shortDescription}</p>
      {cap.bodyHtml && <RichTextView html={cap.bodyHtml} className="mt-2" />}
      {files.length > 0 && (
        <p className="mt-2 text-xs [overflow-wrap:anywhere]">
          <span className="text-ink-3">Files: </span>
          {files.map((file) => file.filename + (file.withdrawnAt ? ' (withdrawn)' : '')).join(', ')}
        </p>
      )}
    </div>
  )
}

function CaseFile() {
  const { code } = Route.useParams()
  const { data: review } = useQuery(reviewQuery(code))
  const { data: entries } = useQuery(reviewEntriesQuery(code))
  const { data: caps } = useQuery(reviewCapsQuery(code))
  const { data: files } = useQuery(reviewAttachmentsQuery(code))
  useReviewPageTitle(`${review?.code ?? code.toUpperCase()} case file`)

  if (!review || !entries || !caps || !files) return null
  const counted = caps.filter((cap) => cap.status !== 'cancelled')
  const history = entries.toSorted((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq)

  return (
    <Printout
      code={review.code}
      exportPath={`/reviews/${encodeURIComponent(code)}/exports`}
      back={
        <Link to="/reviews/$code" params={{ code: review.code }} className="inline-flex items-center gap-1 font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> {review.code}
        </Link>
      }
    >
      {/* The page break is on the row: Firefox ignores one on a block inside a cell. */}
      <Row className="break-after-page">
        <Mono className="text-ink-3">{review.code}</Mono>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{review.title}</h1>
        <p className="mt-1 text-ink-2 [overflow-wrap:anywhere]">{review.summary}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="Status">{reviewStatusLabel(review.status)}</Fact>
          <Fact label="Review date">
            <Mono>{review.reviewDate}</Mono>
          </Fact>
          <Fact label="Employee reviewed">
            <Names people={[review.employee]} />
          </Fact>
          <Fact label="Reviewed by">
            <Names people={[review.reviewer]} />
          </Fact>
          <Fact label="Recorded">
            {review.recordedBy ?? 'A removed account'}, {formatDateTime(review.createdAt)}
          </Fact>
          {review.completedAt && <Fact label="Completed">{formatDateTime(review.completedAt)}</Fact>}
          <Fact label="CAPs">{caps.length ? `${counted.filter((cap) => cap.status === 'completed').length} of ${counted.length} done` : 'None'}</Fact>
          <Fact label="Version">{review.version === 1 ? '1, as recorded' : `${review.version}, edited since it was recorded`}</Fact>
        </dl>
      </Row>

      <Row>
        <Heading>Findings</Heading>
        <p className="whitespace-pre-line [overflow-wrap:anywhere]">{review.findings}</p>
      </Row>

      {review.bodyHtml && (
        <Row>
          <div className="pt-6">
            <Heading>Review</Heading>
            <RichTextView html={review.bodyHtml} />
          </div>
        </Row>
      )}

      {caps.map((cap, i) => (
        <Row key={cap.id}>
          <Cap cap={cap} files={files.filter((file) => file.cap === cap.seq)} first={i === 0} />
        </Row>
      ))}

      {history.map((entry, i) => (
        <Row key={entry.id}>
          <Entry
            entry={entry}
            kindLabel={reviewEntryKindLabel(entry.kind)}
            about={entry.cap !== null && <> · {reviewCapCode(entry.cap)}</>}
            heading={i === 0 ? <Heading>History</Heading> : undefined}
          />
        </Row>
      ))}

      {files.length > 0 && (
        <Row>
          <FileTable files={files} where={(file) => [file.cap !== null && reviewCapCode(file.cap), `with ${reviewEntryCode(file.entrySeq)}`].filter(Boolean).join(', ')} />
        </Row>
      )}
    </Printout>
  )
}
