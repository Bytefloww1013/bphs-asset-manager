import type { ReviewPerson } from '@shared/types.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Mono } from '@/components/ui/layout.tsx'

/** As on a grievance, someone who has been archived keeps their place on the review and is marked. */
export function Person({ person }: { person: ReviewPerson }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>{person.name}</span>
      <Mono className="text-xs font-normal text-ink-3">{person.code}</Mono>
      {person.archived && (
        <Badge tone="neutral" dot={false}>
          archived
        </Badge>
      )}
    </span>
  )
}
