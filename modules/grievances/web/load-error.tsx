import { Link } from '@tanstack/react-router'
import { Scale } from 'lucide-react'
import { buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { ApiError } from '@/lib/api.ts'

/** What a page under one grievance shows when that grievance cannot be loaded: usually an ID nobody has. */
export function GrievanceLoadError({ error }: { error: unknown }) {
  return (
    <EmptyState
      icon={Scale}
      title={
        error instanceof ApiError && error.status === 404
          ? 'No grievance with that ID'
          : 'Could not load this grievance'
      }
      description={error instanceof Error ? error.message : undefined}
      action={
        <Link to="/grievances" className={buttonStyles('primary')}>
          Back to grievances
        </Link>
      }
    />
  )
}
