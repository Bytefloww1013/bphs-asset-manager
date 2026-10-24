import { latestAudit } from '#foundation/audit/server/index.ts'
import type { DbLike } from '#kernel/db/client.ts'
import { type DashboardData, OVERDUE_DAYS, RATING_ATTENTION_BELOW, RATING_SCORE_MAX } from '../shared/index.ts'
import { conditionRatings } from './schema.ts'
import { listOpenAssignments } from './assignments.ts'
import { loadAssetRows } from './service.ts'

export function buildDashboard(db: DbLike): DashboardData {
  const rows = loadAssetRows(db)
  const open = listOpenAssignments(db)

  const totals = {
    total: rows.length,
    assigned: rows.filter((row) => row.state === 'assigned').length,
    inStorage: rows.filter((row) => row.state === 'in_storage').length,
    retired: rows.filter((row) => row.state === 'retired').length,
  }

  const types = new Map<number, { typeId: number; type: string; total: number; free: number }>()
  for (const row of rows) {
    if (row.state === 'retired') continue
    const entry = types.get(row.typeId) ?? { typeId: row.typeId, type: row.type, total: 0, free: 0 }
    entry.total += 1
    if (row.state === 'in_storage') entry.free += 1
    types.set(row.typeId, entry)
  }

  const holders = new Map<number, DashboardData['topHolders'][number]>()
  for (const assignment of open) {
    // Top holders are people; an asset a program holds is counted in the totals only.
    if (!assignment.employee) continue
    const entry = holders.get(assignment.employee.id) ?? { employee: assignment.employee, count: 0 }
    entry.count += 1
    holders.set(assignment.employee.id, entry)
  }

  const scores = new Map(
    db
      .select({ id: conditionRatings.id, score: conditionRatings.score })
      .from(conditionRatings)
      .all()
      .map((r) => [r.id, r.score]),
  )

  const recent = latestAudit(db, 8)

  return {
    totals,
    byType: [...types.values()].sort((a, b) => b.total - a.total),
    overdueCount: open.filter((a) => a.daysOut > OVERDUE_DAYS).length,
    longestOut: open.slice(0, 6).map((a) => ({
      assignmentId: a.id,
      assetTag: a.assetTag,
      assetType: a.assetType,
      assetBrand: a.assetBrand,
      assetModel: a.assetModel,
      employee: a.employee,
      program: a.program,
      daysOut: a.daysOut,
    })),
    topHolders: [...holders.values()]
      .sort((a, b) => b.count - a.count || a.employee.name.localeCompare(b.employee.name))
      .slice(0, 5),
    poorCondition: rows
      .filter(
        (row) =>
          row.state !== 'retired' &&
          row.condition &&
          (scores.get(row.condition.ratingId) ?? RATING_SCORE_MAX) < RATING_ATTENTION_BELOW,
      )
      .slice(0, 6)
      .map((row) => ({
        assetId: row.id,
        assetTag: row.tag,
        assetType: row.type,
        assetBrand: row.brand,
        assetModel: row.model,
        rating: row.condition!.rating,
        holder: (row.holder ?? row.program)?.name ?? null,
      })),
    recent,
  }
}
