import { auditActionLabel, type AuditAction } from '#foundation/audit/shared/index.ts'
import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { cn } from '@/lib/cn.ts'

/** Two-line identity cell: the primary value, then a quieter line beneath. */
export function Stacked({
  primary,
  secondary,
  mono,
}: {
  primary: React.ReactNode
  secondary?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="min-w-0 leading-5">
      <div className={cn('truncate', mono && 'font-mono text-[0.8125rem]')}>{primary}</div>
      {secondary && <div className="truncate text-xs text-ink-3">{secondary}</div>}
    </div>
  )
}

export function PersonCell({ person }: { person: EmployeeRef | null }) {
  if (!person) return <span className="text-ink-3">—</span>
  return <Stacked primary={person.name} secondary={[person.code, person.department].filter(Boolean).join(' · ')} />
}

export { Mono }

const actionTone: Record<AuditAction, Tone> = {
  issue: 'accent',
  return: 'ok',
  create: 'accent',
  update: 'warn',
  delete: 'bad',
  import: 'neutral',
  lock: 'bad',
  sign_in: 'neutral',
}
export const ActionBadge = ({ action }: { action: AuditAction }) => (
  <Badge tone={actionTone[action]}>{auditActionLabel(action)}</Badge>
)
