import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, History, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GrievancePerson } from '@shared/types.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { RichTextView } from '@/components/ui/rich-text.tsx'
import { GrievanceLoadError } from '@/features/grievances/load-error.tsx'
import { useGrievancePageTitle } from '@/features/grievances/page-title.ts'
import { GrievanceStatusBadge } from '@/features/grievances/status.tsx'
import { formatDateTime } from '@/lib/format.ts'
import { grievanceQuery } from '@/lib/queries.ts'

export const Route = createFileRoute('/_app/grievances/$code/')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(grievanceQuery(params.code)),
  errorComponent: GrievanceLoadError,
  component: GrievancePage,
})

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

/** People keep their place on a grievance after they leave; one who has been archived is marked, not removed. */
function People({ people }: { people: GrievancePerson[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {people.map((person) => (
        <li key={person.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{person.name}</span>
          <Mono className="text-xs font-normal text-ink-3">{person.code}</Mono>
          {person.archived && (
            <Badge tone="neutral" dot={false}>
              archived
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}

function GrievancePage() {
  const { code } = Route.useParams()
  const { data: grievance } = useQuery(grievanceQuery(code))
  useGrievancePageTitle(grievance?.code ?? code.toUpperCase())
  if (!grievance) return null
  // A grievance that is finished takes nothing more on its timeline; the server refuses it whatever the page shows.
  const sealed = grievance.status === 'closed' || grievance.status === 'voided'

  return (
    <div className="flex flex-col gap-6">
      {/* The workspace is named by the rail, or by the top bar on a narrow screen, and by this link; the header does not repeat it. */}
      <div>
        <Link to="/grievances" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Grievances
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Mono className="text-sm font-medium text-ink-2">{grievance.code}</Mono>
          <GrievanceStatusBadge status={grievance.status} />
          <span className="text-sm text-ink-3">{grievance.category.name}</span>
        </div>
        <h1 className="mt-1.5 max-w-[40ch] text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">{grievance.title}</h1>
        <p className="mt-1.5 max-w-[75ch] text-sm text-ink-2 [overflow-wrap:anywhere]">{grievance.shortDescription}</p>
      </div>

      <Panel aria-label="Facts">
        <dl className="grid divide-line max-sm:divide-y sm:grid-cols-2 lg:grid-cols-5 lg:divide-x">
          <Fact label="Date made">
            <Mono>{grievance.dateMade}</Mono>
          </Fact>
          <Fact label="Owner">
            <People people={[grievance.owner]} />
          </Fact>
          <Fact label="Employees involved">
            <People people={grievance.employees} />
          </Fact>
          <Fact label="Management involved">
            <People people={grievance.management} />
          </Fact>
          <Fact label="Recorded">
            {grievance.recordedBy ?? 'A removed account'}
            <div className="mt-0.5 text-xs font-normal text-ink-3">{formatDateTime(grievance.createdAt)}</div>
          </Fact>
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="Grievance" description="As it was recorded." className="border-b border-line" />
        <RichTextView html={grievance.bodyHtml} className="max-w-[75ch] px-5 py-5" />
      </Panel>

      <Panel>
        <PanelHeader
          title="Timeline"
          description="Actions taken and events, in the order they happened."
          className="border-b border-line"
          actions={
            sealed ? null : (
              <Link to="/grievances/$code/entries/new" params={{ code: grievance.code }} className={buttonStyles('secondary')}>
                <Plus className="size-4" aria-hidden /> Add action or event
              </Link>
            )
          }
        />
        <EmptyState icon={History} title="Nothing on the timeline yet" description="What is done about this grievance will be recorded here." />
      </Panel>
    </div>
  )
}
