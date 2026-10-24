// The `program.references` hook (issue #23): what other modules have to do with a program. The Programs page shows it,
// and deleting and deactivating ask it, so this module never counts another module's tables.
import { sql, type SQL } from 'drizzle-orm'
import type { DbLike } from '#kernel/db/client.ts'
import type { Blocker } from '#kernel/modules.ts'
import type { ProgramRow } from '../shared/index.ts'

/** The figures on a program's row that other modules give: what the program holds, and whether it ever held anything. */
export type ProgramFigures = Pick<ProgramRow, 'assetsHeld' | 'hasHistory'>

/** What one module says about one program. */
export interface ProgramReference {
  figures?: Partial<ProgramFigures>
  /** Something of the module points at it, so it can't be deleted. */
  deleteBlocker?: Blocker
  /** Something of the module needs it active, so it can't be deactivated yet. Its reason reads after its name. */
  deactivateBlocker?: Blocker
}

/**
 * One module's answer, for a batch of programs (all of them, with `ids` left out). A program the module has nothing on can be
 * left out of the map. Modules are asked in registry order, and the first blocker found is the one given.
 */
export type ProgramReferences = (db: DbLike, ids?: readonly number[]) => ReadonlyMap<number, ProgramReference>

/** The `where` of a query over `programs p`: every program, or these. */
export const programsWhere = (ids?: readonly number[]): SQL =>
  ids
    ? sql`where p.id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``
