import { grievanceStatusLabel, type GrievanceAuditAction, type GrievanceStatus } from '@shared/constants.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'

const tones: Record<GrievanceStatus, Tone> = { open: 'accent', in_progress: 'warn', resolved: 'ok', closed: 'neutral', voided: 'bad' }

export function GrievanceStatusBadge({ status }: { status: GrievanceStatus }) {
  return <Badge tone={tones[status]}>{grievanceStatusLabel(status)}</Badge>
}

const actionTones: Record<GrievanceAuditAction, Tone> = {
  create: 'accent',
  update: 'warn',
  delete: 'bad',
  status: 'warn',
  owner: 'warn',
  void: 'bad',
  entry: 'accent',
  attach: 'accent',
  withdraw: 'bad',
  download: 'neutral',
  export: 'neutral',
}

export const GrievanceActionBadge = ({ action }: { action: GrievanceAuditAction }) => <Badge tone={actionTones[action]}>{action}</Badge>
