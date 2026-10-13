import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, Printer } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { grievanceEntryCode, grievanceEntryKindLabel, grievanceStatusLabel } from '@shared/constants.ts'
import type { GrievanceEntry, GrievancePerson, GrievanceVersion } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/form.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { fileSize } from '@/features/grievances/files.tsx'
import { GrievanceLoadError } from '@/features/grievances/load-error.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'
import { EntryMarker } from '@/features/grievances/timeline.tsx'
import { api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { grievanceAttachmentsQuery, grievanceEntriesQuery, grievanceQuery, grievanceVersionsQuery } from '@/lib/queries.ts'
import { requireSession, useUser } from '@/lib/session.ts'

// Outside the app shell: the page is the case file as it prints, with only a toolbar above it that the print leaves out.
export const Route = createFileRoute('/grievances/$code/case-file')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(grievanceQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceEntriesQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceAttachmentsQuery(params.code)),
    ]),
  errorComponent: GrievanceLoadError,
  component: CaseFile,
})

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function Names({ people }: { people: Pick<GrievancePerson, 'code' | 'name'>[] }) {
  return people.map((person) => (
    <div key={person.code}>
      {person.name} <Mono className="text-xs text-ink-3">{person.code}</Mono>
    </div>
  ))
}

const Heading = ({ children }: { children: ReactNode }) => <h2 className="mb-3 border-b border-ink pb-1 text-base font-semibold">{children}</h2>

/** One entry with every field, its details open. Its block is kept on one page where it fits; a section's heading rides with its first entry. */
function Entry({ entry, heading }: { entry: GrievanceEntry; heading?: ReactNode }) {
  return (
    <div className="break-inside-avoid pt-5">
      {heading}
      <div className="flex items-start gap-2">
        <EntryMarker kind={entry.kind} className="!mt-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">
            <Mono>{grievanceEntryCode(entry.seq)}</Mono> · <span className="uppercase tracking-wide">{grievanceEntryKindLabel(entry.kind)}</span>
          </div>
          <h3 className="font-semibold [overflow-wrap:anywhere]">{entry.title}</h3>
          <dl className="mt-1 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <Fact label="Occurred">{formatDateTime(entry.occurredAt)}</Fact>
            <Fact label="Recorded">{formatDateTime(entry.recordedAt)}</Fact>
            <Fact label="Documented by">{entry.documentedBy}</Fact>
            {entry.corrects !== null && <Fact label="Corrects">{grievanceEntryCode(entry.corrects)}</Fact>}
            {entry.correctedBy.length > 0 && <Fact label="Corrected by">{entry.correctedBy.map(grievanceEntryCode).join(', ')}</Fact>}
          </dl>
          {entry.shortDescription && <p className="mt-2 [overflow-wrap:anywhere]">{entry.shortDescription}</p>}
          {entry.bodyHtml && <RichTextView html={entry.bodyHtml} className="mt-2" />}
        </div>
      </div>
    </div>
  )
}

function Version({ version, heading }: { version: GrievanceVersion; heading?: ReactNode }) {
  return (
    <div className="break-inside-avoid pt-5">
      {heading}
      <h3 className="font-semibold">Version {version.version}</h3>
      <p className="text-xs text-ink-3">
        Replaced {formatDateTime(version.changedAt)} by {version.changedBy}. Reason: {version.reason}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
        <Fact label="Title">{version.title}</Fact>
        <Fact label="Short description">{version.shortDescription}</Fact>
        <Fact label="Date made">
          <Mono>{version.dateMade}</Mono>
        </Fact>
        <Fact label="Category">{version.category}</Fact>
        <Fact label="Employees involved">
          <Names people={version.employees} />
        </Fact>
        <Fact label="Management involved">
          <Names people={version.management} />
        </Fact>
      </dl>
      <RichTextView html={version.bodyHtml} className="mt-2" />
    </div>
  )
}

/** One row of the print table. A row is what Firefox breaks pages between. */
const Row = ({ className, children }: { className?: string; children: ReactNode }) => (
  <tr className={className}>
    <td>{children}</td>
  </tr>
)

function CaseFile() {
  const { code } = Route.useParams()
  const user = useUser()
  const { data: grievance } = useQuery(grievanceQuery(code))
  const { data: entries } = useQuery(grievanceEntriesQuery(code))
  const { data: files } = useQuery(grievanceAttachmentsQuery(code))
  const [includeAutomatic, setIncludeAutomatic] = useState(true)
  const [includeVersions, setIncludeVersions] = useState(false)
  const versions = useQuery({ ...grievanceVersionsQuery(code), enabled: includeVersions })
  const [exportedAt, setExportedAt] = useState(() => new Date().toISOString())
  useGrievancePageTitle(`${grievance?.code ?? code.toUpperCase()} case file`)

  // Ctrl+P prints the page as well as the button, so each print is caught here: logged, and stamped with its own time.
  useEffect(() => {
    const onPrint = () => {
      flushSync(() => setExportedAt(new Date().toISOString()))
      // shortcut: the print goes ahead if the log cannot be written (the server is unreachable); make printing wait on it if that matters.
      api.post(`/grievances/${encodeURIComponent(code)}/exports`, { format: 'pdf' }).catch(() => {})
    }
    window.addEventListener('beforeprint', onPrint)
    return () => window.removeEventListener('beforeprint', onPrint)
  }, [code])

  if (!grievance || !entries || !files) return null
  const shown = entries
    .filter((entry) => includeAutomatic || entry.kind !== 'system')
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq)
  const versionsReady = !includeVersions || versions.data !== undefined

  return (
    <div className="min-h-dvh bg-surface text-sm text-ink">
      <div className="border-b border-line bg-sunken print:hidden">
        <div className="mx-auto flex max-w-[50rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link to="/grievances/$code" params={{ code: grievance.code }} className="inline-flex items-center gap-1 font-medium text-ink-3 hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden /> {grievance.code}
          </Link>
          <label className="flex items-center gap-2">
            <Checkbox checked={includeAutomatic} onChange={(event) => setIncludeAutomatic(event.target.checked)} /> Include automatic entries
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={includeVersions} disabled={grievance.version === 1} onChange={(event) => setIncludeVersions(event.target.checked)} /> Include earlier versions
          </label>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-ink-3">Choose “Save as PDF” in the print dialog. Each print is logged.</span>
            <Button variant="primary" icon={<Printer className="size-4" aria-hidden />} disabled={!versionsReady} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>
        {versions.isError && <p className="mx-auto max-w-[50rem] px-6 pb-3 text-bad">Could not load the earlier versions. {versions.error.message}</p>}
      </div>

      <table className="mx-auto w-full max-w-[50rem] print:max-w-none">
        {/* A table head repeats on every printed page, in Firefox as in Chrome, where a fixed header does not. */}
        <thead>
          <tr>
            <td className="px-6 pt-6 pb-4 print:px-0 print:pt-0">
              <div className="flex justify-between border-b border-line pb-1 text-xs">
                <Mono>{grievance.code}</Mono>
                <span className="font-semibold uppercase tracking-wide">Confidential</span>
              </div>
            </td>
          </tr>
        </thead>
        <tbody className="[&>tr>td]:px-6 print:[&>tr>td]:px-0">
          {/* The page break is on the row: Firefox ignores one on a block inside a cell. */}
          <Row className="break-after-page">
            <Mono className="text-ink-3">{grievance.code}</Mono>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{grievance.title}</h1>
            <p className="mt-1 text-ink-2 [overflow-wrap:anywhere]">{grievance.shortDescription}</p>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
              <Fact label="Status">{grievanceStatusLabel(grievance.status)}</Fact>
              <Fact label="Category">{grievance.category.name}</Fact>
              <Fact label="Date made">
                <Mono>{grievance.dateMade}</Mono>
              </Fact>
              <Fact label="Owner">
                <Names people={[grievance.owner]} />
              </Fact>
              <Fact label="Employees involved">
                <Names people={grievance.employees} />
              </Fact>
              <Fact label="Management involved">
                <Names people={grievance.management} />
              </Fact>
              <Fact label="Recorded">
                {grievance.recordedBy ?? 'A removed account'}, {formatDateTime(grievance.createdAt)}
              </Fact>
              <Fact label="Version">{grievance.version === 1 ? '1, as recorded' : `${grievance.version}, edited since it was recorded`}</Fact>
            </dl>
          </Row>

          <Row>
            <Heading>Grievance</Heading>
            <RichTextView html={grievance.bodyHtml} />
          </Row>

          {shown.map((entry, i) => (
            <Row key={entry.id} className={i === 0 ? 'pt-6' : undefined}>
              <Entry entry={entry} heading={i === 0 ? <Heading>Timeline</Heading> : undefined} />
            </Row>
          ))}

          {files.length > 0 && (
            <Row>
              <div className="pt-6">
                <Heading>Files</Heading>
                <table className="w-full text-left text-xs">
                  <thead className="text-ink-3">
                    <tr className="[&>th]:pb-1 [&>th]:pr-3 [&>th]:font-normal">
                      <th>Name</th>
                      <th>Size</th>
                      <th>Added</th>
                      <th>SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id} className="break-inside-avoid border-t border-line align-top [&>td]:py-1.5 [&>td]:pr-3">
                        <td className="[overflow-wrap:anywhere]">
                          {file.filename}
                          {file.entrySeq !== null && <span className="text-ink-3"> · with {grievanceEntryCode(file.entrySeq)}</span>}
                          {file.withdrawnAt && (
                            <div className="text-ink-3">
                              Withdrawn {formatDateTime(file.withdrawnAt)}: {file.withdrawnReason}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap">{fileSize(file.size)}</td>
                        <td>
                          {file.uploadedBy}, {formatDateTime(file.uploadedAt)}
                        </td>
                        <td>
                          <Mono className="text-[10px] break-all">{file.sha256}</Mono>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Row>
          )}

          {includeVersions &&
            versions.data?.map((version, i) => (
              <Row key={version.version} className={i === 0 ? 'pt-6' : undefined}>
                <Version version={version} heading={i === 0 ? <Heading>Earlier versions, the latest first</Heading> : undefined} />
              </Row>
            ))}

          <Row>
            <p className="mt-8 border-t border-line pt-2 pb-6 text-xs text-ink-3">
              Exported by {user.name} ({user.email}) on {formatDateTime(exportedAt)}
            </p>
          </Row>
        </tbody>
      </table>
    </div>
  )
}
