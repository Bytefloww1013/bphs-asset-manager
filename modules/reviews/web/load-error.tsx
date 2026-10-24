import { Link } from '@tanstack/react-router'
import { ClipboardCheck } from 'lucide-react'
import { buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { ApiError } from '@/lib/api.ts'

/** What a page under one review shows when that review cannot be loaded: an ID nobody has, or a review about this account. */
export function ReviewLoadError({ error }: { error: unknown }) {
  return (
    <EmptyState
      icon={ClipboardCheck}
      title={
        error instanceof ApiError && error.status === 404 ? 'No review with that ID' : 'Could not load this review'
      }
      description={error instanceof Error ? error.message : undefined}
      action={
        <Link to="/reviews" className={buttonStyles('primary')}>
          Back to reviews
        </Link>
      }
    />
  )
}
