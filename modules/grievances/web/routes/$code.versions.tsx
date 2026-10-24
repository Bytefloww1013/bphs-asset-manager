import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, History } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { formatDateTime } from '@/lib/format.ts'
import type { GrievanceVersion } from '../../shared/types.ts'
import { GrievanceLoadError } from '../load-error.tsx'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceQuery, grievanceVersionsQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/grievances/$code/versions')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(grievanceQuery(params.code)),
      context.queryClient.ensureQueryData(grievanceVersionsQuery(params.code)),
    ]),
  errorComponent: GrievanceLoadError,
  component: VersionsPage,
})

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** The people as they were named then: a name and an Employee ID as text, whatever has become of the employee since. */
function Names({ people }: { people: GrievanceVersion['employees'] }) {
  return (
    <ul className="flex flex-col gap-1">
      {people.map((person) => (
        <li key={person.code}>
          {person.name} <Mono className="text-xs text-ink-3">{person.code}</Mono>
        </li>
      ))}
    </ul>
  )
}

function VersionsPage() {
  const { code } = Route.useParams()
  const { data: grievance } = useQuery(grievanceQuery(code))
  const { data: versions } = useQuery(grievanceVersionsQuery(code))
  useGrievancePageTitle(`Versions of ${grievance?.code ?? code.toUpperCase()}`)
  if (!grievance || !versions) return null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to="/grievances/$code"
          params={{ code: grievance.code }}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> {grievance.code}
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Earlier versions"
            description={`What ${grievance.code} said before each edit, the latest first. It now stands at version ${grievance.version}; these are kept as they were and cannot be changed.`}
          />
        </div>
      </div>

      {versions.length === 0 ? (
        <Panel>
          <EmptyState
            icon={History}
            title="This grievance has not been edited"
            description="It still says what it said when it was recorded, so there is no earlier version to show."
          />
        </Panel>
      ) : (
        versions.map((version) => (
          <Panel key={version.version} aria-label={`Version ${version.version}`}>
            <PanelHeader
              title={`Version ${version.version}`}
              description={`Replaced ${formatDateTime(version.changedAt)} by ${version.changedBy}`}
              className="border-b border-line"
            />
            <div className="flex flex-col gap-5 px-5 py-5">
              <Fact label="Reason for the change that replaced it">{version.reason}</Fact>
              <dl className="grid gap-5 sm:grid-cols-2">
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
              <div>
                <div className="text-xs text-ink-3">Grievance</div>
                <RichTextView html={version.bodyHtml} className="mt-1 max-w-[75ch]" />
              </div>
            </div>
          </Panel>
        ))
      )}
    </div>
  )
}
