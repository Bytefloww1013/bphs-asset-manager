// The `custody.kinds` hook (issue #23): each module whose items are issued registers a kind, with what the ledger needs to know
// of it. The module's own service checks its rules first, in its own words; `issue()` and `returnItem()` hold them again.
import type { Workspace } from '#shared/constants.ts'
import type { DbLike } from '#kernel/db/client.ts'
import { invalid } from '#kernel/lib/errors.ts'
import type { Blocker } from '#kernel/modules.ts'
import { hooks } from '#kernel/registry.ts'

export type Holder = 'employee' | 'program'

/** A kind of item held through the ledger. */
export interface CustodyKind {
  /** What `assignments.kind` says for its rows, as `asset`. Never changed once there are rows: migrations name it. */
  kind: string
  /** Its name in a sentence, as `digital asset`. */
  label: string
  /** Who may hold one. */
  holders: readonly Holder[]
  /** The workspace whose readers see, on an employee's row, how many they hold. */
  workspace: Workspace
  /** That figure on the employee's row. */
  heldFigure: 'assetsHeld' | 'digitalHeld'
  /** What a holder still has, after their name, as `holds 2 asset(s)`. */
  holding(count: number): string
  /** The word that gives one back, as `Return`. */
  release: string
  /** Why the item can't be issued now (retired, inactive), or null. A 404 when there is no such item. */
  issueBlocked(db: DbLike, itemId: number): Blocker | null
}

/** Every registered kind, in registry order. */
export const custodyKinds = (): readonly CustodyKind[] => hooks('custody.kinds')

export function custodyKind(kind: string): CustodyKind {
  const found = custodyKinds().find((candidate) => candidate.kind === kind)
  if (!found) throw new Error(`No module registers the custody kind "${kind}".`)
  return found
}

/** Refuses a holder the kind doesn't allow (a program holding a digital asset). */
export function allowHolder(kind: CustodyKind, holder: Holder) {
  if (!kind.holders.includes(holder)) {
    throw invalid(`A ${holder} can't hold a ${kind.label}.`, {
      field: holder === 'program' ? 'programId' : 'employeeId',
    })
  }
}
