import { employeesQuery } from '#foundation/employees/web/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { Alert } from '@/components/ui/feedback.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { CapForm } from '../cap-form.tsx'
import { ReviewLoadError } from '../load-error.tsx'
import { useReviewPageTitle } from '../page-title.ts'
import { ensureReviewToManage, reviewQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/reviews/$code/caps/new')({
  loader: ({ context, params }) =>
    Promise.all([ensureReviewToManage(context, params.code), context.queryClient.ensureQueryData(employeesQuery)]),
  errorComponent: ReviewLoadError,
  component: NewCapPage,
})

// As on New review, nothing typed here is kept in browser storage.
function NewCapPage() {
  const { code } = Route.useParams()
  const { data: review } = useQuery(reviewQuery(code))
  useReviewPageTitle(`Add a CAP to ${review?.code ?? code.toUpperCase()}`)
  if (!review) return null
  // The server refuses the same whatever the page shows. The page is not found by an account that may not change the review.
  const refused =
    review.status === 'voided'
      ? `${review.code} has been voided. Nothing more can be added to it.`
      : review.status === 'completed'
        ? `${review.code} is Completed. Reopen it to add a CAP.`
        : null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          to="/reviews/$code"
          params={{ code: review.code }}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> {review.code}
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Add a CAP"
            description="One corrective action plan: what is to be done and who sees it through. It starts as Not started, and its progress is recorded as updates."
          />
        </div>
      </div>
      {refused ? (
        <Alert tone="warn" title="No CAP can be added">
          {refused}
        </Alert>
      ) : (
        <CapForm review={review} />
      )}
    </div>
  )
}
