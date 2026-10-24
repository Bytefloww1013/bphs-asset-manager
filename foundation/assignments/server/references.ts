// What custody has to do with employees and programs (the `employee.references` and `program.references` hooks): what each holds
// of each kind, and whether they ever held anything. History, of any kind, is never deleted, so it keeps the holder too.
import type { EmployeeFigures, EmployeeReferences } from '#foundation/employees/server/index.ts'
import type { ProgramReferences } from '#foundation/programs/server/index.ts'
import { canUseWorkspace } from '#shared/permissions.ts'
import type { Blocker } from '#kernel/modules.ts'
import { heldBy, type HeldCounts } from './custody.ts'
import { custodyKinds } from './kinds.ts'

const everHeld = (counts: HeldCounts) => [...counts.values()].some((count) => count.total > 0)

/** The first kind, in registry order, the holder still has some of: why it can't be archived or deactivated yet. */
function stillHolds(counts: HeldCounts, before: 'archiving' | 'deactivating'): Blocker | undefined {
  for (const kind of custodyKinds()) {
    const held = counts.get(kind.kind)?.held ?? 0
    if (held > 0)
      return { code: 'holds_assets', reason: `still ${kind.holding(held)}. ${kind.release} them before ${before}.` }
  }
  return undefined
}

/** Someone who can't see a kind's workspace sees none of its figures, but still can't archive a holder. */
export const custodyEmployeeReferences: EmployeeReferences = (db, viewer, ids) => {
  const seen = custodyKinds().filter((kind) => canUseWorkspace(viewer, kind.workspace))
  return new Map(
    [...heldBy(db, 'employee', ids)].map(([id, counts]) => {
      const history = everHeld(counts)
      let figures: Partial<EmployeeFigures> | undefined
      if (seen.length > 0) {
        figures = { hasHistory: seen.some((kind) => (counts.get(kind.kind)?.total ?? 0) > 0) }
        for (const kind of seen)
          figures[kind.heldFigure] = (figures[kind.heldFigure] ?? 0) + (counts.get(kind.kind)?.held ?? 0)
      }
      return [
        id,
        {
          figures,
          deleteBlocker: history
            ? { code: 'has_history', reason: 'Has assignment history. Archive instead; history is never deleted.' }
            : undefined,
          archiveBlocker: stillHolds(counts, 'archiving'),
        },
      ]
    }),
  )
}

export const custodyProgramReferences: ProgramReferences = (db, ids) =>
  new Map(
    [...heldBy(db, 'program', ids)].map(([id, counts]) => {
      const history = everHeld(counts)
      return [
        id,
        {
          figures: {
            assetsHeld: [...counts.values()].reduce((sum, count) => sum + count.held, 0),
            hasHistory: history,
          },
          // Deleting is only for a program entered by mistake: one that has ever held an asset keeps its place in the history.
          deleteBlocker: history
            ? { code: 'has_history', reason: 'Has assignment history. Deactivate instead; history is never deleted.' }
            : undefined,
          deactivateBlocker: stillHolds(counts, 'deactivating'),
        },
      ]
    }),
  )
