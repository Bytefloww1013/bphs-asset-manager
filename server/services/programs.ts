import { eq, sql } from 'drizzle-orm'
import type { ProgramCreateInput, ProgramUpdateInput } from '../../shared/schemas.ts'
import type { ProgramRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { programs } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'
import { conflict, notFound } from '../lib/errors.ts'

interface RawProgram {
  id: number
  code: string
  name: string
  address: string | null
  isActive: number
  createdAt: number
  held: number
  total: number
}

/** Deleting is only for a program entered by mistake: one that has ever held an asset keeps its place in the history. */
const deleteBlocked = (row: RawProgram) =>
  row.total > 0 ? 'Has assignment history. Deactivate instead; history is never deleted.' : null

function toRow(row: RawProgram): ProgramRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    isActive: !!row.isActive,
    assetsHeld: row.held,
    hasHistory: row.total > 0,
    deleteBlocked: deleteBlocked(row),
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

const listRaw = (db: DbLike, id?: number) =>
  db.all<RawProgram>(sql`
    select p.id as id, p.code as code, p.name as name, p.address as address, p.is_active as isActive, p.created_at as createdAt,
           coalesce(sum(case when a.id is not null and a.returned_at is null then 1 else 0 end), 0) as held,
           count(a.id) as total
    from programs p left join assignments a on a.program_id = p.id
    ${id ? sql`where p.id = ${id}` : sql``}
    group by p.id
    order by p.name collate nocase, p.code collate nocase`)

export function listPrograms(db: DbLike, id?: number): ProgramRow[] {
  return listRaw(db, id).map(toRow)
}

function getProgram(db: DbLike, id: number): ProgramRow {
  const row = listPrograms(db, id)[0]
  if (!row) throw notFound('Program')
  return row
}

function assertCodeFree(db: DbLike, code: string, exceptId?: number) {
  const dup = db
    .select({ id: programs.id })
    .from(programs)
    .where(sql`${programs.code} = ${code} collate nocase`)
    .get()
  if (dup && dup.id !== exceptId) {
    throw conflict('duplicate_program', `Program ID ${code} already exists.`, { field: 'code' })
  }
}

export function createProgram(db: Db, actor: Actor, input: ProgramCreateInput): ProgramRow {
  const id = db.transaction((tx) => {
    assertCodeFree(tx, input.code)
    const row = tx
      .insert(programs)
      .values({ code: input.code, name: input.name, address: input.address ?? null })
      .returning({ id: programs.id })
      .get()
    writeAudit(tx, actor, {
      action: 'create',
      entityType: 'program',
      entityId: row.id,
      details: `program_id=${input.code} · ${input.name}`,
    })
    return row.id
  })
  return getProgram(db, id)
}

export function updateProgram(db: Db, actor: Actor, id: number, input: ProgramUpdateInput): ProgramRow {
  db.transaction((tx) => {
    const current = tx.select().from(programs).where(eq(programs.id, id)).get()
    if (!current) throw notFound('Program')
    const patch: Partial<typeof programs.$inferInsert> = {}
    const changes: string[] = []
    const track = <K extends 'code' | 'name' | 'address'>(key: K, label: string) => {
      const next = input[key]
      if (next === undefined) return
      const value = next ?? null
      if (value === current[key]) return
      patch[key] = value as never
      changes.push(`${label}: ${current[key] ?? '—'} → ${value ?? '—'}`)
    }
    // A change of letter case alone is still this program's own ID.
    if (input.code !== undefined && input.code !== current.code) assertCodeFree(tx, input.code, id)
    track('code', 'program_id')
    track('name', 'name')
    track('address', 'address')
    if (changes.length === 0) return
    tx.update(programs).set(patch).where(eq(programs.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'program',
      entityId: id,
      details: `program_id=${patch.code ?? current.code} · ${changes.join('; ')}`,
    })
  })
  return getProgram(db, id)
}

export function setProgramActive(db: Db, actor: Actor, id: number, active: boolean): ProgramRow {
  db.transaction((tx) => {
    const current = getProgram(tx, id)
    if (current.isActive === active) return
    if (!active && current.assetsHeld > 0) {
      throw conflict(
        'holds_assets',
        `${current.name} still holds ${current.assetsHeld} asset(s). Return them before deactivating.`,
      )
    }
    tx.update(programs).set({ isActive: active }).where(eq(programs.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'program',
      entityId: id,
      details: `program_id=${current.code} · ${active ? 'reactivated' : 'deactivated'}`,
    })
  })
  return getProgram(db, id)
}

export function deleteProgram(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const raw = listRaw(tx, id)[0]
    if (!raw) throw notFound('Program')
    const blocked = deleteBlocked(raw)
    if (blocked) throw conflict('has_history', `${raw.name} cannot be deleted. ${blocked}`)
    tx.delete(programs).where(eq(programs.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'program',
      entityId: id,
      details: `program_id=${raw.code} · ${raw.name}`,
    })
  })
}
