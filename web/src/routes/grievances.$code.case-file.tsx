import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { grievanceEntryCode, grievanceEntryKindLabel, grievanceStatusLabel } from '@shared/constants.ts'
import type { GrievanceVersion } from '@shared/types.ts'
import { Checkbox } from '@/components/ui/form.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { Entry, Fact, FileTable, Heading, Names, Printout, Row } from '@/features/common/printout.tsx'
import { GrievanceLoadError } from '@/features/grievances/load-error.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'
import { formatDateTime } from '@/lib/format.ts'
import {
  grievanceAttachmentsQuery,
  grievanceEntriesQuery,
  grievanceQuery,
  grievanceVersionsQuery,
} from '@/lib/queries.ts'
import { requireSession } from '@/lib/session.ts'

// Outside the app shell: the page is the case file as it prints, with only a toolbar above it that the print leaves out.
export const Route = createFileRoute('/grievances/$code/case-file')({
  beforeLoad: async ({ context, location }) => {
    await requireSession(context.queryClient, location.href, 'grievances')
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(grievanceQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceEntriesQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceAttachmentsQuery(params.code)),
    ]),
  errorComponent: GrievanceLoadError,
  component: CaseFile,
})

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

function CaseFile() {
  const { code } = Route.useParams()
  const { data: grievance } = useQuery(grievanceQuery(code))
  const { data: entries } = useQuery(grievanceEntriesQuery(code))
  const { data: files } = useQuery(grievanceAttachmentsQuery(code))
  const [includeAutomatic, setIncludeAutomatic] = useState(true)
  const [includeVersions, setIncludeVersions] = useState(false)
  const versions = useQuery({ ...grievanceVersionsQuery(code), enabled: includeVersions })
  useGrievancePageTitle(`${grievance?.code ?? code.toUpperCase()} case file`)

  if (!grievance || !entries || !files) return null
  const shown = entries
    .filter((entry) => includeAutomatic || entry.kind !== 'system')
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq)

  return (
    <Printout
      code={grievance.code}
      exportPath={`/grievances/${encodeURIComponent(code)}/exports`}
      body={{ format: 'pdf' }}
      ready={!includeVersions || versions.data !== undefined}
      back={
        <Link
          to="/grievances/$code"
          params={{ code: grievance.code }}
          className="inline-flex items-center gap-1 font-medium text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> {grievance.code}
        </Link>
      }
      options={
        <>
          <label className="flex items-center gap-2">
            <Checkbox checked={includeAutomatic} onChange={(event) => setIncludeAutomatic(event.target.checked)} />{' '}
            Include automatic entries
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeVersions}
              disabled={grievance.version === 1}
              onChange={(event) => setIncludeVersions(event.target.checked)}
            />{' '}
            Include earlier versions
          </label>
        </>
      }
      notice={
        versions.isError && (
          <p className="mx-auto max-w-[50rem] px-6 pb-3 text-bad">
            Could not load the earlier versions. {versions.error.message}
          </p>
        )
      }
    >
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
          <Fact label="Version">
            {grievance.version === 1 ? '1, as recorded' : `${grievance.version}, edited since it was recorded`}
          </Fact>
        </dl>
      </Row>

      <Row>
        <Heading>Grievance</Heading>
        <RichTextView html={grievance.bodyHtml} />
      </Row>

      {shown.map((entry, i) => (
        <Row key={entry.id} className={i === 0 ? 'pt-6' : undefined}>
          <Entry
            entry={entry}
            kindLabel={grievanceEntryKindLabel(entry.kind)}
            heading={i === 0 ? <Heading>Timeline</Heading> : undefined}
          />
        </Row>
      ))}

      {files.length > 0 && (
        <Row>
          <FileTable
            files={files}
            where={(file) => (file.entrySeq === null ? null : `with ${grievanceEntryCode(file.entrySeq)}`)}
          />
        </Row>
      )}

      {includeVersions &&
        versions.data?.map((version, i) => (
          <Row key={version.version} className={i === 0 ? 'pt-6' : undefined}>
            <Version
              version={version}
              heading={i === 0 ? <Heading>Earlier versions, the latest first</Heading> : undefined}
            />
          </Row>
        ))}
    </Printout>
  )
}
