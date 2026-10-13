import { grievanceStatusLabel, type GrievanceStatus } from '@shared/constants.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'

const tones: Record<GrievanceStatus, Tone> = { open: 'accent', in_progress: 'warn', resolved: 'ok', closed: 'neutral', voided: 'bad' }

export function GrievanceStatusBadge({ status }: { status: GrievanceStatus }) {
  return <Badge tone={tones[status]}>{grievanceStatusLabel(status)}</Badge>
}
