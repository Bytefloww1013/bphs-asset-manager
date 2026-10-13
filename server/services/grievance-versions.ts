import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { GrievanceUpdateInput } from '../../shared/schemas.ts'
import type { GrievanceDetail, GrievanceVersion } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { grievanceCategories, grievancePeople, grievanceVersions, grievances } from '../db/schema.ts'
import type { Actor } from '../lib/audit.ts'
import { conflict, invalid, notFound } from '../lib/errors.ts'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { plainToRichText, requireRichText } from '../lib/richtext.ts'
import { appendGrievanceEntry } from './grievance-entries.ts'
import { findToManage, getGrievance, requireActiveEmployees } from './grievances.ts'

// There is no update and no delete of a version in this file, and there must never be: an edit adds one and touches no other.

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * Replace a grievance's text, date, category or people. What it was is kept as a version, the timeline says which fields
 * changed and why, and the audit log says the same without the reason. The owner is not changed here.
 */
export function updateGrievance(db: Db, actor: Actor, code: string, input: GrievanceUpdateInput): GrievanceDetail {
  const body = requireRichText(input.body, 'body')
  return db.transaction((tx) => {
    const was = findToManage(tx, actor, code)
    if (was.status === 'closed') throw conflict('grievance_sealed', `${was.code} is Closed. Reopen it before editing it.`)
    if (was.version !== input.version) {
      const last = tx.select().from(grievanceVersions).where(eq(grievanceVersions.grievanceId, was.id)).orderBy(desc(grievanceVersions.version)).get()
      throw conflict('stale_version', `${was.code} was edited${last ? ` by ${last.changedByLabel}` : ''} while you had it open. Nothing has been saved.`, { version: was.version })
    }

    const named = { employee: was.employees.map((person) => person.id), management: was.management.map((person) => person.id) }
    const changed = [
      input.title !== was.title && 'Title',
      input.shortDescription !== was.shortDescription && 'Short description',
      body.html !== was.bodyHtml && 'Grievance',
      input.dateMade !== was.dateMade && 'Date made',
      input.categoryId !== was.category.id && 'Category',
      !sameSet(input.employeeIds, named.employee) && 'Employees involved',
      !sameSet(input.managementIds, named.management) && 'Management involved',
    ].filter((label) => label !== false)
    if (changed.length === 0) throw conflict('unchanged', 'Nothing has been changed, so there is nothing to save.')

    if (input.categoryId !== was.category.id) {
      const category = tx.select().from(grievanceCategories).where(eq(grievanceCategories.id, input.categoryId)).get()
      if (!category) throw invalid('Choose a category.', { field: 'categoryId' })
      if (!category.isActive) throw conflict('category_inactive', `The "${category.name}" category is no longer in use.`, { field: 'categoryId' })
    }
    // Someone already named keeps their place after they are archived; only a person being added must be here now.
    const already = [...named.employee, ...named.management]
    for (const field of ['employeeIds', 'managementIds'] as const) {
      const added = input[field].filter((id) => !already.includes(id))
      if (added.length) requireActiveEmployees(tx, added, field)
    }

    const now = new Date()
    tx.insert(grievanceVersions)
      .values({
        grievanceId: was.id,
        version: was.version,
        title: was.title,
        shortDescription: was.shortDescription,
        bodyHtml: was.bodyHtml,
        bodyText: tx.select({ bodyText: grievances.bodyText }).from(grievances).where(eq(grievances.id, was.id)).get()!.bodyText,
        dateMade: was.dateMade,
        categoryName: was.category.name,
        people: [
          ...was.employees.map((person) => ({ role: 'employee' as const, code: person.code, name: person.name })),
          ...was.management.map((person) => ({ role: 'management' as const, code: person.code, name: person.name })),
        ],
        changedByUserId: actor.id,
        changedByLabel: actor.name,
        changedAt: now,
        reason: input.reason,
      })
      .run()
    // The version is part of the condition, so a save that lost a race changes nothing; the check above is what explains it.
    tx.update(grievances)
      .set({ title: input.title, shortDescription: input.shortDescription, bodyHtml: body.html, bodyText: body.text, dateMade: input.dateMade, categoryId: input.categoryId, version: was.version + 1 })
      .where(and(eq(grievances.id, was.id), eq(grievances.version, was.version)))
      .run()
    for (const [role, ids] of [['employee', input.employeeIds], ['management', input.managementIds]] as const) {
      const gone = named[role].filter((id) => !ids.includes(id))
      if (gone.length) tx.delete(grievancePeople).where(and(eq(grievancePeople.grievanceId, was.id), eq(grievancePeople.role, role), inArray(grievancePeople.employeeId, gone))).run()
      const added = ids.filter((id) => !named[role].includes(id))
      if (added.length) tx.insert(grievancePeople).values(added.map((employeeId) => ({ grievanceId: was.id, employeeId, role }))).run()
    }

    const summary = `Edited: ${changed.join(', ')}`
    appendGrievanceEntry(tx, actor, was.id, { kind: 'system', occurredAt: now, title: summary, body: plainToRichText(input.reason), at: now })
    // Field names only: what they said, before or after, stays out of the audit log.
    writeGrievanceAudit(tx, actor, { action: 'update', entityType: 'grievance', entityId: was.id, details: `${was.code} · ${input.title} · ${summary}`, at: now })
    return getGrievance(tx, { id: was.id })
  })
}

/** Every earlier version of a grievance, the latest first. The grievance as it now stands is not one of them. */
export function listGrievanceVersions(db: DbLike, code: string): GrievanceVersion[] {
  const grievance = db.get<{ id: number }>(sql`select id from grievances where code = ${code} collate nocase`)
  if (!grievance) throw notFound('Grievance')
  const rows = db.select().from(grievanceVersions).where(eq(grievanceVersions.grievanceId, grievance.id)).orderBy(desc(grievanceVersions.version)).all()
  return rows.map((row) => {
    const of = (role: 'employee' | 'management') => row.people.filter((person) => person.role === role).map(({ code, name }) => ({ code, name }))
    return {
      version: row.version,
      title: row.title,
      shortDescription: row.shortDescription,
      bodyHtml: row.bodyHtml,
      dateMade: row.dateMade,
      category: row.categoryName,
      employees: of('employee'),
      management: of('management'),
      changedBy: row.changedByLabel,
      changedAt: row.changedAt.toISOString(),
      reason: row.reason,
    }
  })
}
