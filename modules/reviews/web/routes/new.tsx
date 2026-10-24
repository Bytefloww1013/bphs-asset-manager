import { employeesQuery } from '#foundation/employees/web/index.ts'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/ui/layout.tsx'
import { ReviewForm } from '../form.tsx'
import { useReviewPageTitle } from '../page-title.ts'

export const Route = createFileRoute('/_app/reviews/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(employeesQuery),
  component: NewReviewPage,
})

function NewReviewPage() {
  useReviewPageTitle('New review')
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New review"
        description="Record an administrative review. What follows from it is added afterwards, as updates."
      />
      <ReviewForm />
    </div>
  )
}
