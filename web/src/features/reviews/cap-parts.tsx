import { Link } from '@tanstack/react-router'
import { reviewCapCode } from '@shared/constants.ts'
import type { ReviewCap } from '@shared/types.ts'
import { Mono } from '@/components/ui/layout.tsx'
import { ReviewCapStatusBadge } from '@/features/reviews/status.tsx'
import { formatDate } from '@/lib/format.ts'

/** A CAP's number, linked to its page. As a chip, it marks an entry on the history as being about that CAP. */
export function CapLink({ code, seq, chip }: { code: string; seq: number; chip?: boolean }) {
  return (
    <Link
      to="/reviews/$code/caps/$cap"
      params={{ code, cap: reviewCapCode(seq) }}
      className={
        chip
          ? 'rounded-md border border-line-strong bg-sunken px-1.5 text-xs text-ink-2 hover:border-accent-line hover:bg-accent-soft hover:text-accent'
          : 'font-medium text-accent hover:underline'
      }
    >
      <Mono>{reviewCapCode(seq)}</Mono>
    </Link>
  )
}

/** What the timeline shows of a CAP beside its number: its status, who is responsible, and its dates. */
export function CapFacts({ cap }: { cap: ReviewCap }) {
  return (
    <>
      <ReviewCapStatusBadge status={cap.status} />
      <span className="text-xs text-ink-3">
        Responsible: <span className="text-ink-2">{cap.responsible.name}</span>
        {cap.dueDate && (
          <>
            {' '}
            · Due <Mono>{cap.dueDate}</Mono>
          </>
        )}
        {cap.completedAt && (
          <>
            {' '}
            · Completed <Mono>{formatDate(cap.completedAt)}</Mono>
          </>
        )}
      </span>
    </>
  )
}
