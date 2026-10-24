import { employeesQuery } from '#foundation/employees/web/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/feedback.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { canManageGrievance } from '../../shared/permissions.ts'
import { GrievanceForm } from '../form.tsx'
import { GrievanceLoadError } from '../load-error.tsx'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceCategoriesQuery, grievanceQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/grievances/$code/edit')({
  loader: async ({ context, params }) => {
    const [grievance] = await Promise.all([
      context.queryClient.ensureQueryData(grievanceQuery(params.code)),
      context.queryClient.ensureQueryData(employeesQuery),
      context.queryClient.ensureQueryData(grievanceCategoriesQuery),
    ])
    // Only the owner or someone with Edit access to Grievances may change it; to anyone else the page doesn't exist (issue #27).
    if (!canManageGrievance(context.user, grievance.owner.id)) throw notFound()
  },
  errorComponent: GrievanceLoadError,
  component: EditGrievancePage,
})

function EditGrievancePage() {
  const { code } = Route.useParams()
  const { data: grievance } = useQuery(grievanceQuery(code))
  useGrievancePageTitle(`Edit ${grievance?.code ?? code.toUpperCase()}`)
  // The form starts from the grievance once. Reloading after someone else's edit starts it again from what is there now.
  const [round, setRound] = useState(0)
  if (!grievance) return null
  // A grievance that is voided or closed says why before anything is typed; the server refuses the same whatever the page shows.
  const refused =
    grievance.status === 'voided'
      ? `${grievance.code} has been voided. It is kept as a record and cannot be changed.`
      : grievance.status === 'closed'
        ? `${grievance.code} is Closed. Reopen it before editing it.`
        : null

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
            title="Edit grievance"
            description="Change what the grievance says or who is named on it. What it said before is kept as a version, and the timeline records which fields changed and why."
          />
        </div>
      </div>
      {refused ? (
        <Alert tone="warn" title="This grievance cannot be edited">
          {refused}
        </Alert>
      ) : (
        <GrievanceForm key={round} grievance={grievance} onReload={() => setRound((n) => n + 1)} />
      )}
    </div>
  )
}
