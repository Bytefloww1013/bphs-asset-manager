import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { canManageReview, reviewManageReason } from '@shared/permissions.ts'
import { Alert } from '@/components/ui/feedback.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { ReviewForm } from '@/features/reviews/form.tsx'
import { ReviewLoadError } from '@/features/reviews/load-error.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { employeesQuery, reviewQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/reviews/$code/edit')({
  loader: ({ context, params }) => Promise.all([context.queryClient.ensureQueryData(reviewQuery(params.code)), context.queryClient.ensureQueryData(employeesQuery)]),
  errorComponent: ReviewLoadError,
  component: EditReviewPage,
})

function EditReviewPage() {
  const { code } = Route.useParams()
  const user = useUser()
  const { data: review } = useQuery(reviewQuery(code))
  useReviewPageTitle(`Edit ${review?.code ?? code.toUpperCase()}`)
  // The form starts from the review once. Reloading after someone else's edit starts it again from what is there now.
  const [round, setRound] = useState(0)
  if (!review) return null
  // The page says why before anything is typed; the server refuses the same whatever the page shows.
  const refused =
    review.status === 'voided'
      ? `${review.code} has been voided. It is kept as a record and cannot be changed.`
      : !canManageReview(user, review.reviewer.id)
        ? reviewManageReason(review.reviewer.name)
        : null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/reviews/$code" params={{ code: review.code }} className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> {review.code}
        </Link>
        <div className="mt-3">
          <PageHeader title="Edit review" description="Change the review's details. Its history records each field that changed, with what it said before." />
        </div>
      </div>
      {refused ? (
        <Alert tone="warn" title="This review cannot be edited">
          {refused}
        </Alert>
      ) : (
        <ReviewForm key={round} review={review} onReload={() => setRound((n) => n + 1)} />
      )}
    </div>
  )
}
