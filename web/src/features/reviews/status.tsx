import { reviewStatusLabel, type ReviewStatus } from '@shared/constants.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'

const tones: Record<ReviewStatus, Tone> = { open: 'accent', in_progress: 'warn', completed: 'ok', voided: 'bad' }

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={tones[status]}>{reviewStatusLabel(status)}</Badge>
}
