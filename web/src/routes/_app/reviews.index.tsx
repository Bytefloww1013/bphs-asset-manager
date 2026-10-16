import { createFileRoute } from '@tanstack/react-router'
import { ClipboardCheck } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { PageHeader } from '@/components/ui/layout.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'

export const Route = createFileRoute('/_app/reviews/')({ component: ReviewsPage })

function ReviewsPage() {
  useReviewPageTitle()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reviews" description="Administrative reviews of employees, with their corrective action plans." />
      <EmptyState icon={ClipboardCheck} title="No reviews yet" description="Administrative reviews recorded here will be listed on this page." />
    </div>
  )
}
