// The `employee.references` hook (issue #23): what other modules have to do with an employee. The Employees page shows it,
// and deleting and archiving ask it, so this module never counts another module's tables.
import { sql, type SQL } from 'drizzle-orm'
import type { Grantee } from '#shared/permissions.ts'
import type { DbLike } from '#kernel/db/client.ts'
import type { Blocker } from '#kernel/modules.ts'
import type { EmployeeRow } from '../shared/index.ts'

/** The figures on an employee's row that other modules give: what the employee holds, owns or has to do there. */
export type EmployeeFigures = Pick<
  EmployeeRow,
  'assetsHeld' | 'digitalHeld' | 'hasHistory' | 'openGrievancesOwned' | 'openReviewsReviewing' | 'openCapsResponsible'
>

/** Who is asking. An answer leaves out what this account may not see: a review about themselves. */
export type EmployeeViewer = Grantee & { employeeId: number | null }

/** What one module says about one employee. */
export interface EmployeeReference {
  figures?: Partial<EmployeeFigures>
  /** Something of the module points at them, so they can't be deleted. */
  deleteBlocker?: Blocker
  /** Something of the module needs them here, so they can't be archived yet. Its reason reads after their name. */
  archiveBlocker?: Blocker
}

/**
 * One module's answer, for a batch of employees (all of them, with `ids` left out). An employee the module has nothing on can
 * be left out of the map. Modules are asked in registry order, and the first blocker found is the one given.
 */
export type EmployeeReferences = (
  db: DbLike,
  viewer: EmployeeViewer,
  ids?: readonly number[],
) => ReadonlyMap<number, EmployeeReference>

/** The `where` of a query over `employees e`: every employee, or these. */
export const employeesWhere = (ids?: readonly number[]): SQL =>
  ids
    ? sql`where e.id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``

/** Why delete is refused, to someone who can't see every workspace: the reason itself could name any of them, or an account. */
export const HIDDEN_BLOCK = 'Has records you cannot see. Archive instead; history is never deleted.'
