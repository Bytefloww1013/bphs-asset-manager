import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, FileQuestion, PencilLine } from 'lucide-react'
import type { ReactNode } from 'react'
import { AttachmentList } from '@/components/records/files.tsx'
import { EntryMarker } from '@/components/records/timeline.tsx'
import { buttonStyles } from '@/components/ui/button.tsx'
import { Alert, EmptyState } from '@/components/ui/feedback.tsx'
import { Fact, Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { formatDateTime } from '@/lib/format.ts'
import { useCan } from '@/lib/session.ts'
import { grievanceEntryCode, grievanceEntryKindLabel } from '../../shared/constants.ts'
import type { GrievanceEntry } from '../../shared/types.ts'
import { GrievanceLoadError } from '../load-error.tsx'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceAttachmentsQuery, grievanceEntriesQuery, grievanceQuery } from '../queries.ts'
import { grievanceFiles } from '../files.ts'

export const Route = createFileRoute('/_app/grievances/$code/entries/$seq')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(grievanceQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceEntriesQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceAttachmentsQuery(params.code)),
    ]),
  errorComponent: GrievanceLoadError,
  component: EntryPage,
})

/** The address names an entry as the pages do, E06; a bare 6 is read the same way. */
const seqOf = (text: string) => Number(/^e?0*([1-9]\d*)$/i.exec(text.trim())?.[1] ?? Number.NaN)

function EntryLink({
  code,
  entry,
  className,
  children,
}: {
  code: string
  entry: GrievanceEntry
  className?: string
  children?: ReactNode
}) {
  return (
    <Link
      to="/grievances/$code/entries/$seq"
      params={{ code, seq: grievanceEntryCode(entry.seq) }}
      className={className ?? 'font-medium text-accent hover:underline'}
    >
      {children ?? (
        <>
          <Mono>{grievanceEntryCode(entry.seq)}</Mono>: {entry.title}
        </>
      )}
    </Link>
  )
}

function EntryPage() {
  const { code, seq: named } = Route.useParams()
  // A correction needs Edit access to Grievances, even for the owner; without it Add correction isn't drawn (issue #27).
  const canEdit = useCan('grievances', 'edit')
  const { data: grievance } = useQuery(grievanceQuery(code))
  const { data: entries } = useQuery(grievanceEntriesQuery(code))
  const { data: attachments } = useQuery(grievanceAttachmentsQuery(code))
  const seq = seqOf(named)
  const entry = entries?.find((one) => one.seq === seq)
  useGrievancePageTitle(
    `${entry ? grievanceEntryCode(entry.seq) : named.toUpperCase()} of ${grievance?.code ?? code.toUpperCase()}`,
  )
  if (!grievance || !entries || !attachments) return null

  const back = (
    <Link
      to="/grievances/$code"
      params={{ code: grievance.code }}
      className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
    >
      <ChevronLeft className="size-4" aria-hidden /> {grievance.code}
    </Link>
  )
  if (!entry) {
    return (
      <div className="flex flex-col gap-6">
        <div>{back}</div>
        <EmptyState
          icon={FileQuestion}
          title="No entry with that number"
          description={`${grievance.code} has ${entries.length === 1 ? 'one entry' : `${entries.length} entries`}, ${grievanceEntryCode(1)} to ${grievanceEntryCode(entries.length)}.`}
          action={
            <Link to="/grievances/$code" params={{ code: grievance.code }} className={buttonStyles('primary')}>
              Back to the grievance
            </Link>
          }
        />
      </div>
    )
  }

  const entryCode = grievanceEntryCode(entry.seq)
  const bySeq = (n: number) => entries.find((one) => one.seq === n)
  const original = entry.corrects === null ? undefined : bySeq(entry.corrects)
  const corrections = entry.correctedBy.map(bySeq).filter((one) => one !== undefined)
  const previous = bySeq(entry.seq - 1)
  const next = bySeq(entry.seq + 1)
  // Nothing a person wrote is in an automatic entry, and a finished grievance takes no more entries; the server refuses both.
  const files = attachments.filter((file) => file.entrySeq === entry.seq)
  const correctable = entry.kind !== 'system' && grievance.status !== 'closed' && grievance.status !== 'voided'

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        {back}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <EntryMarker kind={entry.kind} className="mt-0" />
              <Mono className="text-sm font-medium text-ink-2">{entryCode}</Mono>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {grievanceEntryKindLabel(entry.kind)}
              </span>
            </div>
            <h1 className="mt-1.5 max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">
              {entry.title}
            </h1>
            {entry.shortDescription && (
              <p className="mt-1.5 max-w-[75ch] text-sm text-ink-2 [overflow-wrap:anywhere]">
                {entry.shortDescription}
              </p>
            )}
          </div>
          {correctable && canEdit && (
            <Link
              to="/grievances/$code/entries/new"
              params={{ code: grievance.code }}
              search={{ corrects: entry.seq }}
              className={buttonStyles('secondary')}
            >
              <PencilLine className="size-4" aria-hidden /> Add correction
            </Link>
          )}
        </div>
      </div>

      {/* The link is shown from both ends. The text of the entry below is as it was written, corrected or not. */}
      {corrections.length > 0 && (
        <Alert
          tone="warn"
          title={
            corrections.length === 1
              ? 'This entry has been corrected'
              : `This entry has been corrected ${corrections.length} times`
          }
        >
          <ul className="flex flex-col gap-1">
            {corrections.map((one) => (
              <li key={one.id}>
                <EntryLink code={grievance.code} entry={one} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-2">What it says below is unchanged.</p>
        </Alert>
      )}
      {original && (
        <Alert title="This is a correction">
          It corrects <EntryLink code={grievance.code} entry={original} />
        </Alert>
      )}

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Fact label="Type">{grievanceEntryKindLabel(entry.kind)}</Fact>
          <Fact label="Occurred at">
            <Mono>{formatDateTime(entry.occurredAt)}</Mono>
          </Fact>
          <Fact label="Recorded at">
            <Mono>{formatDateTime(entry.recordedAt)}</Mono>
          </Fact>
          <Fact label="Documented by">{entry.documentedBy}</Fact>
        </dl>
        <dl className="border-t border-line">
          <Fact label="Grievance">
            <Link to="/grievances/$code" params={{ code: grievance.code }} className="text-accent hover:underline">
              <Mono>{grievance.code}</Mono>
            </Link>{' '}
            <span className="font-normal text-ink-2 [overflow-wrap:anywhere]">{grievance.title}</span>
          </Fact>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Details" description="As they were recorded." className="border-b border-line" />
        {entry.bodyHtml ? (
          <RichTextView html={entry.bodyHtml} className="max-w-[75ch] px-5 py-5" />
        ) : (
          <p className="px-5 py-5 text-sm text-ink-3">
            {entry.kind === 'system'
              ? 'This entry was written by the app. It has no details.'
              : 'Nothing was recorded beyond the short description.'}
          </p>
        )}
      </Panel>

      {files.length > 0 && (
        <Panel>
          <PanelHeader
            title="Files"
            description="Added with this entry. Each one downloads to be opened on your computer."
            className="border-b border-line"
          />
          <AttachmentList
            record={grievanceFiles}
            code={grievance.code}
            files={files}
            sealed={grievance.status === 'closed' || grievance.status === 'voided'}
          />
        </Panel>
      )}

      <nav aria-label="Entries" className="flex flex-wrap items-center justify-between gap-3">
        {previous ? (
          <EntryLink code={grievance.code} entry={previous} className={buttonStyles('secondary')}>
            <ChevronLeft className="size-4" aria-hidden /> Previous entry, {grievanceEntryCode(previous.seq)}
          </EntryLink>
        ) : (
          <span />
        )}
        {next && (
          <EntryLink code={grievance.code} entry={next} className={buttonStyles('secondary')}>
            Next entry, {grievanceEntryCode(next.seq)} <ChevronRight className="size-4" aria-hidden />
          </EntryLink>
        )}
      </nav>
    </div>
  )
}
