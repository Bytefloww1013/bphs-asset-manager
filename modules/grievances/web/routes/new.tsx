import { employeesQuery } from '#foundation/employees/web/index.ts'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { canAt } from '@shared/permissions.ts'
import { PageHeader } from '@/components/ui/layout.tsx'
import { GrievanceForm } from '../form.tsx'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceAccountHoldersQuery, grievanceCategoriesQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/grievances/new')({
  // Recording a grievance needs Edit access to Grievances; to anyone else the page doesn't exist (issue #27).
  beforeLoad: ({ context }) => {
    if (!canAt(context.user, 'grievances', 'edit')) throw notFound()
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(employeesQuery),
      context.queryClient.ensureQueryData(grievanceCategoriesQuery),
      context.queryClient.ensureQueryData(grievanceAccountHoldersQuery),
    ]),
  component: NewGrievancePage,
})

function NewGrievancePage() {
  useGrievancePageTitle('New grievance')
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New grievance"
        description="Record a grievance as it was made. What was done about it is added afterwards, as actions and events."
      />
      <GrievanceForm />
    </div>
  )
}
