import type { ReactNode } from 'react'
import type { GrievanceEntryKind } from '@shared/constants.ts'
import type { GrievanceDetail, GrievanceEntry } from '@shared/types.ts'
import { Mono } from '@/components/ui/layout.tsx'
import { GrievanceStatusBadge } from '@/features/grievances/status.tsx'
import { formatDateTime, plural } from '@/lib/format.ts'

/** The grievance at a glance. It stays beside the timeline on a wide screen while the timeline scrolls. */
export function TimelineSummary({ grievance, entries }: { grievance: GrievanceDetail; entries: GrievanceEntry[] }) {
  const count = (kind: GrievanceEntryKind) => entries.filter((entry) => entry.kind === kind).length
  const times = entries.map((entry) => entry.occurredAt).sort()
  const facts: { label: string; value: ReactNode }[] = [
    { label: 'Status', value: <GrievanceStatusBadge status={grievance.status} /> },
    { label: 'Owner', value: grievance.owner.name },
    { label: 'Grievance date', value: <Mono>{grievance.dateMade}</Mono> },
    {
      label: 'Entries',
      value: (
        <>
          {entries.length}
          <span className="block text-xs font-normal text-ink-3">
            {plural(count('action'), 'action')}, {plural(count('event'), 'event')},{' '}
            {plural(count('correction'), 'correction')}, {count('system')} automatic
          </span>
        </>
      ),
    },
    { label: 'First activity', value: <Mono>{formatDateTime(times[0])}</Mono> },
    { label: 'Latest activity', value: <Mono>{formatDateTime(times.at(-1))}</Mono> },
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 lg:grid-cols-1">
      {facts.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-ink-3">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
