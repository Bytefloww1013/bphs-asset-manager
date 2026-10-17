import { reviewCapStatusLabel, reviewStatusLabel, type ReviewCapStatus, type ReviewStatus } from '@shared/constants.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'

const tones: Record<ReviewStatus, Tone> = { open: 'accent', in_progress: 'warn', completed: 'ok', voided: 'bad' }

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={tones[status]}>{reviewStatusLabel(status)}</Badge>
}

const capTones: Record<ReviewCapStatus, Tone> = { not_started: 'neutral', in_progress: 'warn', completed: 'ok', cancelled: 'bad' }

export function ReviewCapStatusBadge({ status }: { status: ReviewCapStatus }) {
  return <Badge tone={capTones[status]}>{reviewCapStatusLabel(status)}</Badge>
}
