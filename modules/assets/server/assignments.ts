import {
  assignments,
  issue,
  openFor,
  requireHolder,
  returnItem,
  type CustodyKind,
} from '#foundation/assignments/server/index.ts'
import { writeAudit } from '#foundation/audit/server/index.ts'
import { employeeRef, employees, fullName } from '#foundation/employees/server/index.ts'
import { accountOf, notify, sectionTeam } from '#foundation/notifications/server/index.ts'
import { programRef, programs } from '#foundation/programs/server/index.ts'
import { and, eq, sql } from 'drizzle-orm'
import type { Db, DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, notFound, rowFailure } from '#kernel/lib/errors.ts'
import { daysBetween } from '#kernel/lib/time.ts'
import {
  type AssignmentRow,
  type IssueInput,
  OVERDUE_DAYS,
  RATING_ATTENTION_BELOW,
  type ReturnBulkInput,
  type ReturnBulkResult,
  type ReturnInput,
} from '../shared/index.ts'
import { assetTypes, assets, conditions } from './schema.ts'
import { assessorFor, requireActiveRating } from './refs.ts'

interface OpenRow {
  id: number
  assetId: number
  assetTag: string
  assetType: string
  assetBrand: string
  assetModel: string | null
  assetEntraObjectId: string | null
  issuedAt: number
  eId: number | null
  eCode: string | null
  eFirst: string | null
  eLast: string | null
  eDept: string | null
  pId: number | null
  pCode: string | null
  pName: string | null
  issueRating: string | null
  issuedByEmail: string
}

const OPEN_SQL = sql`
  select a.id as id, a.item_id as assetId, s.tag as assetTag, t.name as assetType,
         b.name as assetBrand, s.model as assetModel, s.entra_object_id as assetEntraObjectId, a.issued_at as issuedAt,
         e.id as eId, e.code as eCode, e.first_name as eFirst, e.last_name as eLast, e.department as eDept,
         p.id as pId, p.code as pCode, p.name as pName,
         r.name as issueRating, u.email as issuedByEmail
  from assignments a
  join assets s on s.id = a.item_id
  join asset_types t on t.id = s.type_id
  join asset_brands b on b.id = s.brand_id
  left join employees e on e.id = a.employee_id
  left join programs p on p.id = a.program_id
  join users u on u.id = a.issued_by_id
  left join conditions c on c.assignment_id = a.id and c.kind = 'issue'
  left join condition_ratings r on r.id = c.rating_id
  where a.kind = 'asset' and a.returned_at is null`

function toRow(row: OpenRow, now: Date): AssignmentRow {
  const issuedAt = new Date(row.issuedAt)
  return {
    id: row.id,
    assetId: row.assetId,
    assetTag: row.assetTag,
    assetType: row.assetType,
    assetBrand: row.assetBrand,
    assetModel: row.assetModel,
    assetEntraObjectId: row.assetEntraObjectId,
    employee:
      row.eId === null
        ? null
        : { id: row.eId, code: row.eCode!, name: fullName(row.eFirst!, row.eLast!), department: row.eDept },
    program: row.pId === null ? null : { id: row.pId, code: row.pCode!, name: row.pName! },
    issuedAt: issuedAt.toISOString(),
    issueRating: row.issueRating,
    daysOut: daysBetween(issuedAt, now),
    issuedBy: row.issuedByEmail,
  }
}

/** Why an asset can't be issued now, in the words the Issue sheet shows. */
const retiredBlocker = (asset: { tag: string; status: string }) =>
  asset.status === 'retired' ? { code: 'asset_retired', reason: `${asset.tag} is retired and cannot be issued.` } : null

/** Physical assets in the custody ledger: an employee or a program holds them, and the issue and return sheets give them out. */
export const assetCustody: CustodyKind = {
  kind: 'asset',
  label: 'asset',
  holders: ['employee', 'program'],
  workspace: 'assets',
  heldFigure: 'assetsHeld',
  holding: (count) => `holds ${count} asset(s)`,
  release: 'Return',
  issueBlocked(db, itemId) {
    const asset = db.select({ tag: assets.tag, status: assets.status }).from(assets).where(eq(assets.id, itemId)).get()
    if (!asset) throw notFound('Asset')
    return retiredBlocker(asset)
  },
}

/** How the audit log names a holder: an Employee ID as it is, a Program ID marked as one. */
const holderCode = (employee: { code: string } | null, program: { code: string } | null) =>
  employee ? employee.code : `program ${program?.code ?? ''}`

/** Open Assignments, longest-out first. */
export function listOpenAssignments(db: DbLike): AssignmentRow[] {
  const now = new Date()
  return db.all<OpenRow>(sql`${OPEN_SQL} order by a.issued_at asc, a.id asc`).map((row) => toRow(row, now))
}

export function getAssignment(db: DbLike, id: number): AssignmentRow | null {
  const now = new Date()
  const row = db.all<OpenRow>(sql`${OPEN_SQL} and a.id = ${id}`)[0]
  return row ? toRow(row, now) : null
}

/**
 * Issue an asset to an employee, or assign it to a program, inside an already-open transaction. Returns the new Assignment id.
 * The holder's account is told, unless `notifyHolder` is false: a pasted import would flood the inboxes.
 */
export function issueInTx(tx: DbLike, actor: Actor, input: IssueInput, now = new Date(), notifyHolder = true): number {
  const found = tx
    .select({ asset: assets, type: assetTypes.name })
    .from(assets)
    .innerJoin(assetTypes, eq(assetTypes.id, assets.typeId))
    .where(eq(assets.id, input.assetId))
    .get()
  if (!found) throw notFound('Asset')
  const { asset } = found
  const retired = retiredBlocker(asset)
  if (retired) throw conflict(retired.code, retired.reason)

  const holder = requireHolder(tx, assetCustody.kind, input)
  const { employee, program } = holder
  const rating = requireActiveRating(tx, input.conditionRatingId)
  const assessedById = assessorFor(tx, input.assessedById, actor)

  const open = openFor(tx, assetCustody.kind, [asset.id]).get(asset.id)
  if (open) {
    const holderName = open.program?.name ?? open.employee?.name ?? ''
    throw conflict('asset_already_assigned', `${asset.tag} is already assigned to ${holderName}.`, {
      assignmentId: open.id,
    })
  }

  const assignment = { id: issue(tx, actor, { kind: assetCustody.kind, itemId: asset.id, holder, issuedAt: now }) }
  tx.insert(conditions)
    .values({
      assetId: asset.id,
      assignmentId: assignment.id,
      kind: 'issue',
      ratingId: rating.id,
      assessedById,
      notes: input.notes ?? null,
      recordedById: actor.id,
      recordedAt: now,
    })
    .run()
  writeAudit(tx, actor, {
    action: 'issue',
    entityType: 'assignment',
    entityId: assignment.id,
    details: `${asset.tag} → ${holderCode(employee, program)} · ${rating.name}`,
    at: now,
  })
  if (notifyHolder && employee) {
    notify(
      tx,
      actor,
      {
        recipients: accountOf(tx, employee.id),
        kind: 'asset_issued',
        sourceKey: `asset:${asset.id}`,
        title: `${asset.tag} was issued to you`,
        body: `${found.type}, issued by ${actor.name}.`,
        link: `/assets/${asset.tag}`,
      },
      now,
    )
  }
  return assignment.id
}

export function issueAsset(db: Db, actor: Actor, input: IssueInput): AssignmentRow {
  const id = db.transaction((tx) => issueInTx(tx, actor, input))
  return getAssignment(db, id)!
}

/** Close an Assignment inside an open transaction. */
export function returnInTx(tx: DbLike, actor: Actor, assignmentId: number, input: ReturnInput, now = new Date()) {
  const found = tx
    .select({ assignment: assignments, asset: assets, employee: employees, program: programs })
    .from(assignments)
    .innerJoin(assets, eq(assets.id, assignments.itemId))
    .leftJoin(employees, eq(employees.id, assignments.employeeId))
    .leftJoin(programs, eq(programs.id, assignments.programId))
    .where(and(eq(assignments.id, assignmentId), eq(assignments.kind, assetCustody.kind)))
    .get()
  if (!found) throw notFound('Assignment')
  const { assignment, asset, employee, program } = found

  // Refuses one already returned. Closed before the checks below: one that fails takes the return back with the transaction.
  returnItem(tx, actor, { kind: assetCustody.kind, assignmentId: assignment.id, name: asset.tag }, now)
  const rating = requireActiveRating(tx, input.conditionRatingId)
  const assessedById = assessorFor(tx, input.assessedById, actor)

  tx.insert(conditions)
    .values({
      assetId: asset.id,
      assignmentId: assignment.id,
      kind: 'return',
      ratingId: rating.id,
      assessedById,
      notes: input.notes ?? null,
      recordedById: actor.id,
      recordedAt: now,
    })
    .run()
  writeAudit(tx, actor, {
    action: 'return',
    entityType: 'assignment',
    entityId: assignment.id,
    details: `${asset.tag} ← ${holderCode(employee, program)} · ${rating.name}`,
    at: now,
  })
  const poor: PoorReturn | null =
    rating.score < RATING_ATTENTION_BELOW
      ? { assignmentId: assignment.id, assetId: asset.id, tag: asset.tag, rating: rating.name }
      : null
  return {
    assetTag: asset.tag,
    employee: employee ? employeeRef(employee) : null,
    program: program ? programRef(program) : null,
    poor,
  }
}

interface PoorReturn {
  assignmentId: number
  assetId: number
  tag: string
  rating: string
}

// A year-end return can bring back hundreds: the Overview lists the rest.
const POOR_TAGS_LISTED = 10

/** Tells the Assets team about returns rated in the attention band: one notification however many came back together. */
function notifyPoorReturns(db: DbLike, actor: Actor, returns: PoorReturn[]) {
  const [first] = returns
  if (!first) return
  const recipients = sectionTeam(db, 'assets')
  if (returns.length === 1) {
    notify(db, actor, {
      recipients,
      kind: 'asset_returned_poor',
      sourceKey: `asset:${first.assetId}`,
      title: `${first.tag} came back rated ${first.rating}`,
      link: `/assets/${first.tag}`,
    })
  } else {
    // The Overview's condition watch lists them all.
    notify(db, actor, {
      recipients,
      kind: 'asset_returned_poor',
      sourceKey: `return-bulk:${first.assignmentId}`,
      title: `${returns.length} assets came back in poor condition`,
      body: [
        ...returns.slice(0, POOR_TAGS_LISTED).map((item) => `${item.tag} (${item.rating})`),
        ...(returns.length > POOR_TAGS_LISTED ? [`and ${returns.length - POOR_TAGS_LISTED} more`] : []),
      ].join(', '),
      link: '/',
    })
  }
}

export function returnAssignment(db: Db, actor: Actor, id: number, input: ReturnInput) {
  return db.transaction((tx) => {
    const { poor, ...returned } = returnInTx(tx, actor, id, input)
    if (poor) notifyPoorReturns(tx, actor, [poor])
    return returned
  })
}

/** Each Assignment is returned on its own so one stale row never blocks the rest. */
export function returnMany(db: Db, actor: Actor, input: ReturnBulkInput): ReturnBulkResult {
  const result: ReturnBulkResult = { returned: [], failed: [] }
  const log = { done: false }
  const poor: PoorReturn[] = []
  for (const id of input.ids) {
    try {
      const returned = db.transaction((tx) => returnInTx(tx, actor, id, input))
      if (returned.poor) poor.push(returned.poor)
      result.returned.push(id)
    } catch (error) {
      result.failed.push({ id, message: rowFailure(error, log) })
    }
  }
  // Sent after the loop, in a transaction of its own, so a bulk return makes one notification and not one per row.
  // The returns have already gone through, so a failure here is logged rather than reported as theirs.
  try {
    db.transaction((tx) => notifyPoorReturns(tx, actor, poor))
  } catch (error) {
    console.error(error)
  }
  return result
}

/**
 * Tells each employee holding an asset past OVERDUE_DAYS, once per assignment. Runs on the 6-hourly timer.
 * shortcut: a reminder is sent again once the first one is purged a year on; keep a sent-at column if that matters.
 */
export function sendOverdueReminders(db: DbLike, now = new Date()) {
  const open = db.all<{ id: number; tag: string; employeeId: number; issuedAt: number }>(sql`
    select a.id as id, s.tag as tag, a.employee_id as employeeId, a.issued_at as issuedAt
    from assignments a join assets s on s.id = a.item_id
    where a.kind = 'asset' and a.returned_at is null and a.employee_id is not null
      and not exists (select 1 from notifications n where n.kind = 'asset_overdue' and n.source_key = 'assignment:' || a.id)`)
  for (const row of open) {
    const days = daysBetween(new Date(row.issuedAt), now)
    // The same rule as the Overview's overdue count.
    if (days <= OVERDUE_DAYS) continue
    notify(
      db,
      null,
      {
        recipients: accountOf(db, row.employeeId),
        kind: 'asset_overdue',
        sourceKey: `assignment:${row.id}`,
        title: `${row.tag} is overdue`,
        body: `It has been issued to you for ${days} days.`,
        link: `/assets/${row.tag}`,
      },
      now,
    )
  }
}
