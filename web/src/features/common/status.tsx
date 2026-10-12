import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import type { AuditAction } from '@shared/constants.ts'
import type { AssetRow, AssetState, EmployeeRef } from '@shared/types.ts'
import { Badge, type Tone } from '@/components/ui/badge.tsx'
import { Mono } from '@/components/ui/layout.tsx'
import { cn } from '@/lib/cn.ts'
import { formatDays, isOverdue } from '@/lib/format.ts'

/** Colour follows the rating's meaning; unknown (user-added) ratings stay neutral. */
export function ratingTone(name: string): Tone {
  switch (name.trim().toLowerCase()) {
    case 'new':
      return 'accent'
    case 'good':
      return 'ok'
    case 'fair':
      return 'warn'
    case 'poor':
    case 'damaged':
      return 'bad'
    default:
      return 'neutral'
  }
}

export const RatingBadge = ({ name }: { name: string | null | undefined }) =>
  name ? <Badge tone={ratingTone(name)}>{name}</Badge> : <span className="text-ink-3">—</span>

const stateMeta: Record<AssetState, { label: string; tone: Tone }> = {
  assigned: { label: 'Assigned', tone: 'accent' },
  in_storage: { label: 'In storage', tone: 'ok' },
  retired: { label: 'Retired', tone: 'neutral' },
}

export const stateLabel = (state: AssetState) => stateMeta[state].label
export const stateTone = (state: AssetState) => stateMeta[state].tone
export const AssetStateBadge = ({ state }: { state: AssetState }) => <Badge tone={stateMeta[state].tone}>{stateMeta[state].label}</Badge>

/** Asset tags are identifiers, so they are set as data and link to the asset's record. */
export function AssetTagLink({ tag, className }: { tag: string; className?: string }) {
  return (
    <Link
      to="/assets/$tag"
      params={{ tag }}
      className={cn('rounded-[4px] font-mono text-[0.8125rem] font-medium tabular-nums text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent', className)}
    >
      {tag}
    </Link>
  )
}

/** Two-line identity cell: the primary value, then a quieter line beneath. */
export function Stacked({ primary, secondary, mono }: { primary: React.ReactNode; secondary?: React.ReactNode; mono?: boolean }) {
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

export function DaysOut({ days, className }: { days: number | null | undefined; className?: string }) {
  const overdue = isOverdue(days)
  return (
    <span className={cn('inline-flex items-center justify-end gap-1.5 tabular-nums', overdue ? 'font-semibold text-warn' : 'text-ink-2', className)}>
      {overdue && <AlertTriangle className="size-3.5" aria-hidden />}
      {formatDays(days)}
      {overdue && <span className="sr-only"> (out over a year)</span>}
    </span>
  )
}

export function assetSearchText(asset: AssetRow): string {
  return [asset.tag, asset.type, asset.serial, asset.holder?.name, asset.holder?.code, asset.holder?.department, asset.condition?.rating, stateLabel(asset.state)].filter(Boolean).join(' ')
}

export { Mono }

const actionTone: Record<AuditAction, Tone> = { issue: 'accent', return: 'ok', create: 'accent', update: 'warn', delete: 'bad', import: 'neutral', lock: 'bad' }
export const ActionBadge = ({ action }: { action: AuditAction }) => <Badge tone={actionTone[action]}>{action}</Badge>
