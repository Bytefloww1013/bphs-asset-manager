// What the assets module draws on the Employees and Programs pages: the Issue buttons and what an employee holds.
import type { EmployeeRow } from '#foundation/employees/shared/index.ts'
import type { ProgramRow } from '#foundation/programs/shared/index.ts'
import { useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { useCan } from '@/lib/session.ts'
import { useWorkspace } from '@/lib/workspace.ts'
import { useSheetActions } from './open.ts'
import { assetsQuery } from './queries.ts'
import { AssetTagLink } from './status.tsx'

export function IssueToEmployee({ employee }: { employee: EmployeeRow }) {
  const sheets = useSheetActions()
  const canIssue = useCan('assets', 'edit')
  // In Grievances, an employee is a person to name, not someone who holds equipment. An account that cannot issue assets
  // is not shown the button; one that can is told why an archived employee takes none (issue #27).
  if (useWorkspace() !== 'assets' || !canIssue) return null
  return (
    <Button
      size="sm"
      icon={<Send className="size-3.5" />}
      disabledReason={employee.state === 'archived' ? 'Archived employees cannot be issued assets.' : undefined}
      onClick={() => sheets.issue(undefined, employee.id)}
    >
      Issue to
    </Button>
  )
}

/** The physical assets out with an employee, on their "What they hold" sheet. */
export function HeldAssets({ employee }: { employee: EmployeeRow }) {
  const { data: assets, isPending: assetsPending } = useQuery(assetsQuery)
  const physical = (assets ?? []).filter((asset) => asset.holder?.id === employee.id)
  return (
    <section aria-labelledby="held-physical">
      <h3 id="held-physical" className="text-sm font-semibold">
        Physical assets <span className="font-normal text-ink-3">{assetsPending ? '' : physical.length}</span>
      </h3>
      {physical.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{assetsPending ? 'Loading…' : 'None.'}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-control border border-line">
          {physical.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <AssetTagLink tag={asset.tag} />
              <span className="min-w-0 truncate text-ink-2">
                {asset.type} · {[asset.brand, asset.model].filter(Boolean).join(' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AssignToProgram({ program }: { program: ProgramRow }) {
  const sheets = useSheetActions()
  // Not drawn for an account that cannot assign assets; a deactivated program keeps it, disabled with the rule (issue #27).
  if (!useCan('assets', 'edit')) return null
  return (
    <Button
      size="sm"
      icon={<Send className="size-3.5" />}
      disabledReason={program.isActive ? undefined : 'A deactivated program cannot be assigned assets.'}
      onClick={() => sheets.issueToProgram(undefined, program.id)}
    >
      Assign to
    </Button>
  )
}
