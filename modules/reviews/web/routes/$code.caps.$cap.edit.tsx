import { employeesQuery } from '#foundation/employees/web/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/feedback.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { reviewCapCode, reviewCapSeq, reviewCapStatusLabel } from '../../shared/constants.ts'
import { CapForm } from '../cap-form.tsx'
import { ReviewLoadError } from '../load-error.tsx'
import { useReviewPageTitle } from '../page-title.ts'
import { ensureReviewToManage, reviewCapsQuery, reviewQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/reviews/$code/caps/$cap/edit')({
  loader: ({ context, params }) =>
    Promise.all([
      ensureReviewToManage(context, params.code),
      context.queryClient.ensureQueryData(reviewCapsQuery(params.code)),
      context.queryClient.ensureQueryData(employeesQuery),
    ]),
  errorComponent: ReviewLoadError,
  component: EditCapPage,
})

function EditCapPage() {
  const { code, cap: named } = Route.useParams()
  const { data: review } = useQuery(reviewQuery(code))
  const { data: caps } = useQuery(reviewCapsQuery(code))
  const cap = caps?.find((one) => one.seq === reviewCapSeq(named))
  useReviewPageTitle(
    `Edit ${cap ? reviewCapCode(cap.seq) : named.toUpperCase()} of ${review?.code ?? code.toUpperCase()}`,
  )
  // The form starts from the CAP once. Reloading after someone else's change starts it again from what is there now.
  const [round, setRound] = useState(0)
  if (!review || !caps) return null
  // The page says why before anything is typed; the server refuses the same whatever the page shows.
  const refused = !cap
    ? `${review.code} has no CAP with that number.`
    : review.status === 'voided'
      ? `${review.code} has been voided. It is kept as a record and cannot be changed.`
      : review.status === 'completed'
        ? `${review.code} is Completed. Reopen it to change a CAP.`
        : cap.status === 'completed' || cap.status === 'cancelled'
          ? `${reviewCapCode(cap.seq)} is ${reviewCapStatusLabel(cap.status)}. Reopen it before editing it.`
          : null

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        {cap ? (
          <Link
            to="/reviews/$code/caps/$cap"
            params={{ code: review.code, cap: reviewCapCode(cap.seq) }}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden /> {reviewCapCode(cap.seq)}
          </Link>
        ) : (
          <Link
            to="/reviews/$code"
            params={{ code: review.code }}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden /> {review.code}
          </Link>
        )}
        <div className="mt-3">
          <PageHeader
            title="Edit CAP"
            description="Change what the CAP says, who is responsible or when it is due. The review's history records each field that changed, with what it said before."
          />
        </div>
      </div>
      {refused || !cap ? (
        <Alert tone="warn" title="This CAP cannot be edited">
          {refused}
        </Alert>
      ) : (
        <CapForm key={round} review={review} cap={cap} onReload={() => setRound((n) => n + 1)} />
      )}
    </div>
  )
}
