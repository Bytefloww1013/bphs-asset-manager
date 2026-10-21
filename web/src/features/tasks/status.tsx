import { taskStatusLabel, type TaskStatus } from '@shared/constants.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'

const tones: Record<TaskStatus, Tone> = {
  scheduled: 'neutral',
  outstanding: 'accent',
  past_due: 'bad',
  awaiting_approval: 'warn',
  completed: 'ok',
  cancelled: 'neutral',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={tones[status]}>{taskStatusLabel(status)}</Badge>
}
