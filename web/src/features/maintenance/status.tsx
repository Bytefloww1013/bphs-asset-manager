import { maintenanceStatusLabel, type MaintenanceStatus } from '@shared/constants.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'

const tones: Record<MaintenanceStatus, Tone> = { not_started: 'neutral', dispatched: 'accent', on_hold: 'warn', rejected: 'bad', finished: 'ok' }

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  return <Badge tone={tones[status]}>{maintenanceStatusLabel(status)}</Badge>
}

/** Zoho sends "No", "Yes" or whatever was typed for "Other"; anything but empty or "No" counts as urgent, and the text is the tooltip. */
export const isUrgent = (urgent: string | null) => Boolean(urgent?.trim()) && urgent!.trim().toLowerCase() !== 'no'

export function UrgentBadge({ urgent }: { urgent: string | null }) {
  if (!isUrgent(urgent)) return null
  return (
    <span title={urgent!.trim().toLowerCase() === 'yes' ? undefined : urgent!}>
      <Badge tone="bad">Urgent</Badge>
    </span>
  )
}
