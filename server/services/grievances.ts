import { eq, inArray, sql, type SQL } from 'drizzle-orm'
import { GRIEVANCE_PREVIEW_LENGTH, GRIEVANCE_STATUSES, grievanceCode, type GrievancePersonRole, type GrievanceStatus } from '../../shared/constants.ts'
import type { GrievanceCreateInput, GrievanceListQuery } from '../../shared/schemas.ts'
import type { GrievanceDetail, GrievanceList, GrievancePerson } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, grievanceCategories, grievancePeople, grievances } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { requireRichText } from '../lib/richtext.ts'
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
  recordedBy: string | null
}

/** One grievance in full, found by its row id or by its Grievance ID. */
export function getGrievance(db: DbLike, key: { id: number } | { code: string }): GrievanceDetail {
  const row = db.get<RawGrievance>(sql`
    select g.id as id, g.code as code, g.title as title, g.short_description as shortDescription, g.body_html as bodyHtml,
           g.date_made as dateMade, g.status as status, g.version as version, g.created_at as createdAt, g.last_activity_at as lastActivityAt,
           c.id as categoryId, c.name as categoryName,
           o.id as ownerId, o.code as ownerCode, o.first_name as ownerFirstName, o.last_name as ownerLastName, o.archived_at as ownerArchivedAt,
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
    employees: named.employee,
    management: named.management,
    version: row.version,
    recordedBy: row.recordedBy,
    createdAt: new Date(row.createdAt).toISOString(),
    lastActivityAt: new Date(row.lastActivityAt).toISOString(),
  }
}

type RawRow = Omit<RawGrievance, 'bodyHtml' | 'version' | 'createdAt' | 'recordedBy'> & { bodyStart: string }

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
function requireActiveEmployees(db: DbLike, ids: number[], field: string) {
  const found = db.select({ id: employees.id, archivedAt: employees.archivedAt }).from(employees).where(inArray(employees.id, ids)).all()
  if (found.length !== ids.length) throw invalid('Someone chosen is no longer in the employee directory.', { field })
  if (found.some((row) => row.archivedAt)) throw invalid('Someone chosen has been archived. Choose active employees only.', { field })
}

export function createGrievance(db: Db, actor: Actor, input: GrievanceCreateInput): GrievanceDetail {
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
    // The first timeline entry, "Grievance recorded", is written by the migration that adds the entries table (slice 3.1).
    writeGrievanceAudit(tx, actor, { action: 'create', entityType: 'grievance', entityId: row.id, details: `${code} · ${input.title}`, at: now })
    return row.id
  })
  return getGrievance(db, { id })
}
