import { eq, inArray, sql, type SQL } from 'drizzle-orm'
import { GRIEVANCE_PREVIEW_LENGTH, GRIEVANCE_STATUSES, grievanceCode, grievanceStatusLabel, type GrievancePersonRole, type GrievanceStatus } from '../../shared/constants.ts'
import { canManageGrievance, grievanceManageReason } from '../../shared/permissions.ts'
import type { GrievanceCreateInput, GrievanceExportInput, GrievanceListQuery, GrievanceOwnerChangeInput, GrievanceStatusChangeInput, GrievanceVoidInput } from '../../shared/schemas.ts'
import type { GrievanceDetail, GrievanceList, GrievancePerson } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, grievanceCategories, grievancePeople, grievances } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, forbidden, invalid, notFound } from '../lib/errors.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { plainToRichText, requireRichText } from '../lib/richtext.ts'
import { appendGrievanceEntry, GRIEVANCE_RECORDED } from './grievance-entries.ts'
import { saveAttachments, type Upload } from './grievance-attachments.ts'
import { fullName } from './refs.ts'

/**
 * The next Grievance ID for the year the record is entered in (not the year of Date Made). Call inside the transaction that
 * inserts the grievance: SQLite allows one writer at a time and the unique index on (year, seq) backs it up, so two people
 * saving at once cannot be given the same ID.
 */
export function nextGrievanceCode(tx: DbLike, at: Date = new Date()): { code: string; year: number; seq: number } {
  const year = at.getFullYear()
  const seq = (tx.get<{ top: number | null }>(sql`select max(seq) as top from grievances where year = ${year}`)?.top ?? 0) + 1
  return { code: grievanceCode(year, seq), year, seq }
}

interface RawPerson {
  grievanceId: number
  role: GrievancePersonRole
  id: number
  code: string
  firstName: string
  lastName: string
  archivedAt: number | null
}

const person = (row: Pick<RawPerson, 'id' | 'code' | 'firstName' | 'lastName' | 'archivedAt'>): GrievancePerson => ({
  id: row.id,
  code: row.code,
  name: fullName(row.firstName, row.lastName),
  archived: row.archivedAt !== null,
})

/** Everyone named on these grievances, by grievance and then by role, in name order. */
export function peopleOf(db: DbLike, grievanceIds: number[]): Map<number, Record<GrievancePersonRole, GrievancePerson[]>> {
  const byGrievance = new Map<number, Record<GrievancePersonRole, GrievancePerson[]>>(grievanceIds.map((id) => [id, { employee: [], management: [] }]))
  if (grievanceIds.length === 0) return byGrievance
  const rows = db.all<RawPerson>(sql`
    select p.grievance_id as grievanceId, p.role as role, e.id as id, e.code as code, e.first_name as firstName, e.last_name as lastName,
           e.archived_at as archivedAt
    from grievance_people p join employees e on e.id = p.employee_id
    where p.grievance_id in (${sql.join(grievanceIds.map((id) => sql`${id}`), sql`, `)})
    order by e.last_name collate nocase, e.first_name collate nocase`)
  for (const row of rows) byGrievance.get(row.grievanceId)?.[row.role].push(person(row))
  return byGrievance
}

interface RawGrievance {
  id: number
  code: string
  title: string
  shortDescription: string
  bodyHtml: string
  dateMade: string
  status: GrievanceStatus
  version: number
  createdAt: number
  lastActivityAt: number
  categoryId: number
  categoryName: string
  ownerId: number
  ownerCode: string
  ownerFirstName: string
  ownerLastName: string
  ownerArchivedAt: number | null
  ownerHasAccount: number
  recordedBy: string | null
}

/** One grievance in full, found by its row id or by its Grievance ID. */
export function getGrievance(db: DbLike, key: { id: number } | { code: string }): GrievanceDetail {
  const row = db.get<RawGrievance>(sql`
    select g.id as id, g.code as code, g.title as title, g.short_description as shortDescription, g.body_html as bodyHtml,
           g.date_made as dateMade, g.status as status, g.version as version, g.created_at as createdAt, g.last_activity_at as lastActivityAt,
           c.id as categoryId, c.name as categoryName,
           o.id as ownerId, o.code as ownerCode, o.first_name as ownerFirstName, o.last_name as ownerLastName, o.archived_at as ownerArchivedAt,
           exists (select 1 from users a where a.employee_id = o.id and a.is_active = 1) as ownerHasAccount,
           u.name as recordedBy
    from grievances g
      join grievance_categories c on c.id = g.category_id
      join employees o on o.id = g.owner_id
      left join users u on u.id = g.created_by_user_id
    where ${'id' in key ? sql`g.id = ${key.id}` : sql`g.code = ${key.code} collate nocase`}`)
  if (!row) throw notFound('Grievance')
  const named = peopleOf(db, [row.id]).get(row.id)!
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    shortDescription: row.shortDescription,
    bodyHtml: row.bodyHtml,
    dateMade: row.dateMade,
    status: row.status,
    category: { id: row.categoryId, name: row.categoryName },
    owner: person({ id: row.ownerId, code: row.ownerCode, firstName: row.ownerFirstName, lastName: row.ownerLastName, archivedAt: row.ownerArchivedAt }),
    ownerHasAccount: Boolean(row.ownerHasAccount),
    employees: named.employee,
    management: named.management,
    version: row.version,
    recordedBy: row.recordedBy,
    createdAt: new Date(row.createdAt).toISOString(),
    lastActivityAt: new Date(row.lastActivityAt).toISOString(),
  }
}

type RawRow = Omit<RawGrievance, 'bodyHtml' | 'version' | 'createdAt' | 'recordedBy' | 'ownerHasAccount'> & { bodyStart: string }

/**
 * The grievances that match, most recent activity first. Each word of the search must be found somewhere: in the ID, the title,
 * the short description, the body's text, or the name of the owner or of anyone named on it. No body HTML is returned.
 */
export function listGrievances(db: DbLike, query: GrievanceListQuery): GrievanceList {
  const where: SQL[] = []
  if (query.owner) where.push(sql`g.owner_id = ${query.owner}`)
  if (query.category) where.push(sql`g.category_id = ${query.category}`)
  if (query.from) where.push(sql`g.date_made >= ${query.from}`)
  if (query.to) where.push(sql`g.date_made <= ${query.to}`)
  for (const word of (query.q ?? '').split(/\s+/).filter(Boolean)) {
    const like = `%${word.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    const name = (alias: string) => sql`${sql.raw(alias)}.first_name || ' ' || ${sql.raw(alias)}.last_name like ${like} escape '\\'`
    where.push(sql`(g.code like ${like} escape '\\' or g.title like ${like} escape '\\' or g.short_description like ${like} escape '\\'
      or g.body_text like ${like} escape '\\' or ${name('o')}
      or exists (select 1 from grievance_people p join employees e on e.id = p.employee_id where p.grievance_id = g.id and ${name('e')}))`)
  }
  const matching = db.all<RawRow>(sql`
    select g.id as id, g.code as code, g.title as title, g.short_description as shortDescription,
           substr(g.body_text, 1, ${GRIEVANCE_PREVIEW_LENGTH + 1}) as bodyStart,
           g.date_made as dateMade, g.status as status, g.last_activity_at as lastActivityAt,
           c.id as categoryId, c.name as categoryName,
           o.id as ownerId, o.code as ownerCode, o.first_name as ownerFirstName, o.last_name as ownerLastName, o.archived_at as ownerArchivedAt
    from grievances g
      join grievance_categories c on c.id = g.category_id
      join employees o on o.id = g.owner_id
    ${where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``}
    order by g.last_activity_at desc, g.id desc`)

  const counts = Object.fromEntries([['all', matching.length], ...GRIEVANCE_STATUSES.map((status) => [status, 0])]) as GrievanceList['counts']
  for (const row of matching) counts[row.status] += 1
  const shown = query.status === 'all' ? matching : matching.filter((row) => row.status === query.status)
  const named = peopleOf(db, shown.map((row) => row.id))
  const owners = db.all<Pick<RawPerson, 'id' | 'code' | 'firstName' | 'lastName' | 'archivedAt'>>(sql`
    select e.id as id, e.code as code, e.first_name as firstName, e.last_name as lastName, e.archived_at as archivedAt
    from employees e where e.id in (select owner_id from grievances)
    order by e.last_name collate nocase, e.first_name collate nocase`)
  return {
    counts,
    owners: owners.map(person),
    rows: shown.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      shortDescription: row.shortDescription,
      preview: row.bodyStart.length > GRIEVANCE_PREVIEW_LENGTH ? `${row.bodyStart.slice(0, GRIEVANCE_PREVIEW_LENGTH).trimEnd()}…` : row.bodyStart,
      dateMade: row.dateMade,
      status: row.status,
      category: { id: row.categoryId, name: row.categoryName },
      owner: person({ id: row.ownerId, code: row.ownerCode, firstName: row.ownerFirstName, lastName: row.ownerLastName, archivedAt: row.ownerArchivedAt }),
      employees: named.get(row.id)!.employee,
      management: named.get(row.id)!.management,
      lastActivityAt: new Date(row.lastActivityAt).toISOString(),
    })),
  }
}

/** Refuses anyone who is not in the directory or has been archived: a new grievance names people who are here now. */
export function requireActiveEmployees(db: DbLike, ids: number[], field: string) {
  const found = db.select({ id: employees.id, archivedAt: employees.archivedAt }).from(employees).where(inArray(employees.id, ids)).all()
  if (found.length !== ids.length) throw invalid('Someone chosen is no longer in the employee directory.', { field })
  if (found.some((row) => row.archivedAt)) throw invalid('Someone chosen has been archived. Choose active employees only.', { field })
}

/** Record a grievance, and any files that came with it in the same request. */
export function createGrievance(db: Db, actor: Actor, input: GrievanceCreateInput, uploads: Upload[] = []): GrievanceDetail {
  const body = requireRichText(input.body, 'body')
  const id = db.transaction((tx) => {
    const category = tx.select().from(grievanceCategories).where(eq(grievanceCategories.id, input.categoryId)).get()
    if (!category) throw invalid('Choose a category.', { field: 'categoryId' })
    if (!category.isActive) throw conflict('category_inactive', `The "${category.name}" category is no longer in use.`, { field: 'categoryId' })
    requireActiveEmployees(tx, [input.ownerId], 'ownerId')
    requireActiveEmployees(tx, input.employeeIds, 'employeeIds')
    requireActiveEmployees(tx, input.managementIds, 'managementIds')

    const now = new Date()
    const { code, year, seq } = nextGrievanceCode(tx, now)
    const row = tx
      .insert(grievances)
      .values({
        code,
        year,
        seq,
        title: input.title,
        shortDescription: input.shortDescription,
        bodyHtml: body.html,
        bodyText: body.text,
        dateMade: input.dateMade,
        ownerId: input.ownerId,
        categoryId: input.categoryId,
        createdByUserId: actor.id,
        createdAt: now,
        lastActivityAt: now,
      })
      .returning({ id: grievances.id })
      .get()
    tx.insert(grievancePeople)
      .values([
        ...input.employeeIds.map((employeeId) => ({ grievanceId: row.id, employeeId, role: 'employee' as const })),
        ...input.managementIds.map((employeeId) => ({ grievanceId: row.id, employeeId, role: 'management' as const })),
      ])
      .run()
    appendGrievanceEntry(tx, actor, row.id, { kind: 'system', occurredAt: now, title: GRIEVANCE_RECORDED, at: now })
    writeGrievanceAudit(tx, actor, { action: 'create', entityType: 'grievance', entityId: row.id, details: `${code} · ${input.title}`, at: now })
    saveAttachments(tx, actor, { id: row.id, code }, null, uploads, now)
    return row.id
  })
  return getGrievance(db, { id })
}

/** The employees an account that can sign in is linked to. Only one of these, as owner, can change a grievance without a Super Admin. */
export function listGrievanceAccountHolders(db: DbLike): number[] {
  return db.all<{ id: number }>(sql`select employee_id as id from users where employee_id is not null and is_active = 1 order by employee_id`).map((row) => row.id)
}

/**
 * The grievance as it stands, for a change to it. Changing a grievance is for its owner's account and for Super Admins,
 * whatever the page showed; and a voided one is a record only.
 */
export function findToManage(tx: DbLike, actor: Actor, code: string): GrievanceDetail {
  const grievance = getGrievance(tx, { code })
  if (!canManageGrievance(actor, grievance.owner.id)) throw forbidden(grievanceManageReason(grievance.owner.name))
  if (grievance.status === 'voided') throw conflict('grievance_voided', `${grievance.code} has been voided. It is kept as a record and cannot be changed.`)
  return grievance
}

interface Change {
  action: 'status' | 'owner' | 'void'
  /** What changed, as the timeline and the audit log both put it: "Status: Open → In progress". */
  summary: string
  note: string
  set: Partial<typeof grievances.$inferInsert>
}

/** One change to a grievance, with the automatic timeline entry and the audit entry that record it. */
function applyChange(tx: DbLike, actor: Actor, grievance: GrievanceDetail, change: Change) {
  const now = new Date()
  tx.update(grievances).set(change.set).where(eq(grievances.id, grievance.id)).run()
  appendGrievanceEntry(tx, actor, grievance.id, { kind: 'system', occurredAt: now, title: change.summary, body: plainToRichText(change.note), at: now })
  // The note stays on the timeline. This log names the grievance and what changed, never what was written about it.
  writeGrievanceAudit(tx, actor, { action: change.action, entityType: 'grievance', entityId: grievance.id, details: `${grievance.code} · ${grievance.title} · ${change.summary}`, at: now })
}

const statusChange = (from: GrievanceStatus, to: GrievanceStatus) => `Status: ${grievanceStatusLabel(from)} → ${grievanceStatusLabel(to)}`

/** Move a grievance between Open, In progress, Resolved and Closed, in any direction: reopening is a change like any other. */
export function changeGrievanceStatus(db: Db, actor: Actor, code: string, input: GrievanceStatusChangeInput): GrievanceDetail {
  const id = db.transaction((tx) => {
    const grievance = findToManage(tx, actor, code)
    if (grievance.status === input.status) throw conflict('status_unchanged', `${grievance.code} is already ${grievanceStatusLabel(input.status)}.`, { field: 'status' })
    applyChange(tx, actor, grievance, { action: 'status', summary: statusChange(grievance.status, input.status), note: input.note, set: { status: input.status } })
    return grievance.id
  })
  return getGrievance(db, { id })
}

/** Hand a grievance to another owner. Whoever owned it can no longer change it, unless they are a Super Admin. */
export function changeGrievanceOwner(db: Db, actor: Actor, code: string, input: GrievanceOwnerChangeInput): GrievanceDetail {
  const id = db.transaction((tx) => {
    const grievance = findToManage(tx, actor, code)
    if (grievance.status === 'closed') throw conflict('grievance_sealed', `${grievance.code} is Closed. Reopen it before changing its owner.`)
    if (grievance.owner.id === input.ownerId) throw invalid(`${grievance.owner.name} already owns ${grievance.code}.`, { field: 'ownerId' })
    requireActiveEmployees(tx, [input.ownerId], 'ownerId')
    const next = tx.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, input.ownerId)).get()!
    applyChange(tx, actor, grievance, {
      action: 'owner',
      summary: `Owner: ${grievance.owner.name} → ${fullName(next.firstName, next.lastName)}`,
      note: input.note,
      set: { ownerId: input.ownerId },
    })
    return grievance.id
  })
  return getGrievance(db, { id })
}

/** Void a grievance entered by mistake. It stays, with its timeline and the reason, and nothing about it can change again. */
export function voidGrievance(db: Db, actor: Actor, code: string, input: GrievanceVoidInput): GrievanceDetail {
  const id = db.transaction((tx) => {
    const grievance = findToManage(tx, actor, code)
    applyChange(tx, actor, grievance, { action: 'void', summary: statusChange(grievance.status, 'voided'), note: input.reason, set: { status: 'voided' } })
    return grievance.id
  })
  return getGrievance(db, { id })
}

const EXPORT_NAMES: Record<GrievanceExportInput['format'], string> = { pdf: 'PDF case file' }

/** Log an export. The browser makes the file, so it reports each one here; viewing a grievance is not logged, taking a copy is. */
export function recordGrievanceExport(db: DbLike, actor: Actor, code: string, input: GrievanceExportInput) {
  const grievance = db.get<{ id: number; code: string; title: string }>(sql`select id, code, title from grievances where code = ${code} collate nocase`)
  if (!grievance) throw notFound('Grievance')
  writeGrievanceAudit(db, actor, { action: 'export', entityType: 'grievance', entityId: grievance.id, details: `${grievance.code} · ${grievance.title} · ${EXPORT_NAMES[input.format]}` })
}
