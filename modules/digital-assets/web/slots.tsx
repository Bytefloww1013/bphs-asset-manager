// What the digital assets module draws on the Employees page: the seats an employee holds.
import type { EmployeeRow } from '#foundation/employees/shared/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Mono } from '@/components/ui/layout.tsx'
import { formatDate } from '@/lib/format.ts'
import { digitalAssetsQuery } from './queries.ts'

/** The seats issued to an employee, on their "What they hold" sheet, after the physical assets. */
export function HeldSeats({ employee }: { employee: EmployeeRow }) {
  const { data: seats, isPending: seatsPending } = useQuery(digitalAssetsQuery)
  const digital = (seats ?? []).filter((seat) => seat.employee?.id === employee.id)
  return (
    <section aria-labelledby="held-digital">
      <h3 id="held-digital" className="text-sm font-semibold">
        Digital assets <span className="font-normal text-ink-3">{seatsPending ? '' : digital.length}</span>
      </h3>
      {digital.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{seatsPending ? 'Loading…' : 'None.'}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-control border border-line">
          {digital.map((seat) => (
            <li key={seat.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
              <Mono className="font-medium">{seat.code}</Mono>
              <span className="min-w-0">
                <span className="block truncate">{seat.type}</span>
                <span className="block truncate text-xs text-ink-3">{seat.account}</span>
              </span>
              <span className="text-xs text-ink-3">since {formatDate(seat.issuedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
