import { eq, sql } from 'drizzle-orm'
import type { EmployeeCreateInput, EmployeeUpdateInput } from '../../shared/schemas.ts'
import type { ImportColumn, ImportPreview, ImportRow, EmployeeRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, users } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { parseCsv } from '../lib/csv.ts'
import { conflict, notFound } from '../lib/errors.ts'
import { fullName } from './refs.ts'

interface RawEmployee {
  id: number
  code: string
  firstName: string
  lastName: string
  department: string | null
  jobTitle: string | null
  archivedAt: number | null
  createdAt: number
  held: number
  total: number
}

function toRow(row: RawEmployee): EmployeeRow {
  return {
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    name: fullName(row.firstName, row.lastName),
    department: row.department,
    jobTitle: row.jobTitle,
    state: row.archivedAt ? 'archived' : 'active',
    assetsHeld: row.held,
    hasHistory: row.total > 0,
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

export function listEmployees(db: DbLike, id?: number): EmployeeRow[] {
  return db
    .all<RawEmployee>(sql`
      select e.id as id, e.code as code, e.first_name as firstName, e.last_name as lastName,
             e.department as department, e.job_title as jobTitle, e.archived_at as archivedAt, e.created_at as createdAt,
             coalesce(sum(case when a.id is not null and a.returned_at is null then 1 else 0 end), 0) as held,
             count(a.id) as total
      from employees e left join assignments a on a.employee_id = e.id
      ${id ? sql`where e.id = ${id}` : sql``}
      group by e.id
      order by e.last_name collate nocase, e.first_name collate nocase`)
    .map(toRow)
}

function getEmployee(db: DbLike, id: number): EmployeeRow {
  const row = listEmployees(db, id)[0]
  if (!row) throw notFound('Employee')
  return row
}

function assertCodeFree(db: DbLike, code: string, exceptId?: number) {
  const dup = db.select({ id: employees.id }).from(employees).where(sql`${employees.code} = ${code} collate nocase`).get()
  if (dup && dup.id !== exceptId) {
    throw conflict('duplicate_employee', `Employee ID ${code} already exists.`, { field: 'code' })
  }
}

export function createEmployee(db: Db, actor: Actor, input: EmployeeCreateInput): EmployeeRow {
  const id = db.transaction((tx) => {
    assertCodeFree(tx, input.code)
    const row = tx
      .insert(employees)
      .values({
        code: input.code,
        firstName: input.firstName,
        lastName: input.lastName,
        department: input.department ?? null,
        jobTitle: input.jobTitle ?? null,
      })
      .returning({ id: employees.id })
      .get()
    writeAudit(tx, actor, { action: 'create', entityType: 'employee', entityId: row.id, details: `employee_id=${input.code}` })
    return row.id
  })
  return getEmployee(db, id)
}

export function updateEmployee(db: Db, actor: Actor, id: number, input: EmployeeUpdateInput): EmployeeRow {
  db.transaction((tx) => {
    const current = tx.select().from(employees).where(eq(employees.id, id)).get()
    if (!current) throw notFound('Employee')
    const patch: Partial<typeof employees.$inferInsert> = {}
    const changes: string[] = []
    const track = <K extends 'code' | 'firstName' | 'lastName' | 'department' | 'jobTitle'>(key: K, label: string) => {
      const next = input[key]
      if (next === undefined) return
      const value = (next ?? null) as string | null
      if (value === current[key]) return
      patch[key] = value as never
      changes.push(`${label}: ${current[key] ?? '—'} → ${value ?? '—'}`)
    }
    if (input.code !== undefined && input.code !== current.code) assertCodeFree(tx, input.code, id)
    track('code', 'employee_id')
    track('firstName', 'first_name')
    track('lastName', 'last_name')
    track('department', 'department')
    track('jobTitle', 'job_title')
    if (changes.length === 0) return
    tx.update(employees).set(patch).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, { action: 'update', entityType: 'employee', entityId: id, details: changes.join('; ') })
  })
  return getEmployee(db, id)
}

export function setEmployeeArchived(db: Db, actor: Actor, id: number, archived: boolean): EmployeeRow {
  db.transaction((tx) => {
    const current = getEmployee(tx, id)
    if ((current.state === 'archived') === archived) return
    if (archived && current.assetsHeld > 0) {
      throw conflict('holds_assets', `${current.name} still holds ${current.assetsHeld} asset(s). Return them before archiving.`)
    }
    tx.update(employees).set({ archivedAt: archived ? new Date() : null }).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'employee',
      entityId: id,
      details: `employee_id=${current.code} · ${archived ? 'archived' : 'restored'}`,
    })
  })
  return getEmployee(db, id)
}

export function deleteEmployee(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const current = getEmployee(tx, id)
    const linkedUser = tx.select({ id: users.id }).from(users).where(eq(users.employeeId, id)).get()
    const assessed = tx.get<{ n: number }>(sql`select count(*) as n from conditions where assessed_by_id = ${id}`)
    if (current.hasHistory || linkedUser || (assessed?.n ?? 0) > 0) {
      throw conflict('has_history', `${current.name} has history. Archive them instead; history is never deleted.`)
    }
    tx.delete(employees).where(eq(employees.id, id)).run()
    writeAudit(tx, actor, { action: 'delete', entityType: 'employee', entityId: id, details: `employee_id=${current.code}` })
  })
}

// ---- CSV import ---------------------------------------------------------------

const COLUMNS = [
  { name: 'employee_id', required: true },
  { name: 'first_name', required: true },
  { name: 'last_name', required: true },
  { name: 'department', required: false },
  { name: 'job_title', required: false },
] as const

const normalise = (header: string) => header.trim().toLowerCase().replace(/[\s-]+/g, '_')

interface Parsed {
  preview: ImportPreview
  creates: { code: string; firstName: string; lastName: string; department: string; jobTitle: string }[]
}

function analyse(db: DbLike, csv: string): Parsed {
  const table = parseCsv(csv)
  const header = (table[0] ?? []).map(normalise)
  const columns: ImportColumn[] = COLUMNS.map((column) => {
    const at = header.indexOf(column.name)
    return { name: column.name, required: column.required, found: at === -1 ? null : at + 1 }
  })
  const missing = columns.filter((column) => column.required && column.found === null).map((column) => column.name)
  const empty = { read: 0, create: 0, duplicates: 0, errors: 0 }
  if (missing.length > 0) {
    return {
      preview: { columns, rows: [], summary: empty, headerError: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.` },
      creates: [],
    }
  }

  const index = Object.fromEntries(columns.map((column) => [column.name, column.found === null ? -1 : column.found - 1]))
  const cell = (row: string[], name: string) => (row[index[name]!] ?? '').trim()
  const known = new Set(db.select({ code: employees.code }).from(employees).all().map((row) => row.code.toLowerCase()))
  const rows: ImportRow[] = []
  const creates: Parsed['creates'] = []
  const summary = { ...empty }

  table.slice(1).forEach((raw, i) => {
    if (raw.every((value) => value.trim() === '')) return
    const row = i + 2 // the header is row 1
    const record = {
      code: cell(raw, 'employee_id'),
      firstName: cell(raw, 'first_name'),
      lastName: cell(raw, 'last_name'),
      department: cell(raw, 'department'),
      jobTitle: cell(raw, 'job_title'),
    }
    summary.read += 1
    const lacking = [
      !record.code && 'employee_id',
      !record.firstName && 'first_name',
      !record.lastName && 'last_name',
    ].filter(Boolean)
    if (lacking.length > 0) {
      summary.errors += 1
      rows.push({ row, ...record, result: 'error', message: `Row ${row}: missing ${lacking.join(', ')}` })
    } else if (known.has(record.code.toLowerCase())) {
      summary.duplicates += 1
      rows.push({ row, ...record, result: 'duplicate', message: 'Skip: employee_id already exists' })
    } else {
      known.add(record.code.toLowerCase())
      summary.create += 1
      creates.push(record)
      rows.push({ row, ...record, result: 'new', message: 'Create' })
    }
  })
  return { preview: { columns, rows, summary, headerError: null }, creates }
}

export function previewImport(db: DbLike, csv: string): ImportPreview {
  return analyse(db, csv).preview
}

/** Existing Employees are skipped, never updated; one Audit Log entry per Employee created. */
export function runImport(db: Db, actor: Actor, csv: string): ImportPreview {
  return db.transaction((tx) => {
    const { preview, creates } = analyse(tx, csv)
    for (const record of creates) {
      const row = tx
        .insert(employees)
        .values({
          code: record.code,
          firstName: record.firstName,
          lastName: record.lastName,
          department: record.department || null,
          jobTitle: record.jobTitle || null,
        })
        .returning({ id: employees.id })
        .get()
      writeAudit(tx, actor, { action: 'import', entityType: 'employee', entityId: row.id, details: `employee_id=${record.code}` })
    }
    return { ...preview, created: creates.length }
  })
}
