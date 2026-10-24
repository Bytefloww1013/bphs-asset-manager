// The physical assets' badges and cells: ratings, states, tags, holders and days out.
import type { EmployeeRef } from '#foundation/employees/shared/index.ts'
import type { ProgramRef } from '#foundation/programs/shared/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { PersonCell, Stacked } from '@/components/status.tsx'
import { Badge, type Tone } from '@/components/ui/badge.tsx'
import { cn } from '@/lib/cn.ts'
import { formatDays } from '@/lib/format.ts'
import { type AssetRow, type AssetState, OVERDUE_DAYS, ratingBand, type RatingBand } from '../shared/index.ts'
import { ratingsQuery } from './queries.ts'

const bandTone: Record<RatingBand, Tone> = { new: 'accent', good: 'ok', worn: 'warn', attention: 'bad' }

/** Colour follows the rating's score, in fixed bands, so a renamed or added rating is coloured like any other. */
export const ratingTone = (score: number): Tone => bandTone[ratingBand(score)]

/**
 * Rows carry a rating's name only, so the badge finds the score in the full list, which includes deactivated ratings.
 * It is neutral until that list has loaded.
 */
export function RatingBadge({ name }: { name: string | null | undefined }) {
  const { data: ratings } = useQuery(ratingsQuery)
  if (!name) return <span className="text-ink-3">—</span>
  const rating = ratings?.find((item) => item.name === name)
  return <Badge tone={rating ? ratingTone(rating.score) : 'neutral'}>{name}</Badge>
}

const stateMeta: Record<AssetState, { label: string; tone: Tone }> = {
  assigned: { label: 'Assigned', tone: 'accent' },
  in_storage: { label: 'In storage', tone: 'ok' },
  retired: { label: 'Retired', tone: 'neutral' },
}

export const stateLabel = (state: AssetState) => stateMeta[state].label
export const stateTone = (state: AssetState) => stateMeta[state].tone
export const AssetStateBadge = ({ state }: { state: AssetState }) => (
  <Badge tone={stateMeta[state].tone}>{stateMeta[state].label}</Badge>
)

/** Asset tags are identifiers, so they are set as data and link to the asset's record. */
export function AssetTagLink({ tag, className }: { tag: string; className?: string }) {
  return (
    <Link
      to="/assets/$tag"
      params={{ tag }}
      className={cn(
        'rounded-[4px] font-mono text-[0.8125rem] font-medium tabular-nums text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent',
        className,
      )}
    >
      {tag}
    </Link>
  )
}

/** Whoever holds an asset. A program is named as one, since it sits where a person usually does; it has no department. */
export function HolderCell({ employee, program }: { employee: EmployeeRef | null; program: ProgramRef | null }) {
  if (program) return <Stacked primary={program.name} secondary={`Program · ${program.code}`} />
  return <PersonCell person={employee} />
}

export const isOverdue = (days: number | null | undefined) => days !== null && days !== undefined && days > OVERDUE_DAYS

export function DaysOut({ days, className }: { days: number | null | undefined; className?: string }) {
  const overdue = isOverdue(days)
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1.5 tabular-nums',
        overdue ? 'font-semibold text-warn' : 'text-ink-2',
        className,
      )}
    >
      {overdue && <AlertTriangle className="size-3.5" aria-hidden />}
      {formatDays(days)}
      {overdue && <span className="sr-only"> (out over a year)</span>}
    </span>
  )
}

export function assetSearchText(asset: AssetRow): string {
  return [
    asset.tag,
    asset.type,
    asset.brand,
    asset.model,
    asset.entraObjectId,
    asset.serial,
    asset.holder?.name,
    asset.holder?.code,
    asset.holder?.department,
    asset.program?.name,
    asset.program?.code,
    asset.condition?.rating,
    stateLabel(asset.state),
  ]
    .filter(Boolean)
    .join(' ')
}
