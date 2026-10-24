import { writeAudit } from '#foundation/audit/server/index.ts'
import { programs } from './schema.ts'
import { programImporter, type ProgramCreateInput, type ProgramRow, type ProgramUpdateInput } from '../shared/index.ts'
import { eq, sql } from 'drizzle-orm'
import type { Db, DbLike } from '#kernel/db/client.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { conflict, notFound } from '#kernel/lib/errors.ts'
import type { ImportStore } from '#kernel/modules.ts'
import { hooks } from '#kernel/registry.ts'
import { programsWhere, type ProgramFigures, type ProgramReference } from './references.ts'

interface RawProgram {
  id: number
  code: string
  name: string
  address: string | null
  isActive: number
  createdAt: number
}

/** A program no module has anything on. */
const NO_FIGURES: ProgramFigures = { assetsHeld: 0, hasHistory: false }

/** Every module's answer about these programs (all of them, with `ids` left out), by program, in registry order. */
function referencesOf(db: DbLike, ids?: readonly number[]) {
  const answers = hooks('program.references').map((references) => references(db, ids))
  return (id: number): ProgramReference[] => answers.flatMap((answer) => answer.get(id) ?? [])
}

/** Deleting is only for a program entered by mistake: anything that points at it keeps it. */
const deleteBlocker = (references: readonly ProgramReference[]) =>
  references.find((reference) => reference.deleteBlocker)?.deleteBlocker ?? null

function toRow(row: RawProgram, references: readonly ProgramReference[]): ProgramRow {
  const figures = { ...NO_FIGURES }
  for (const reference of references) Object.assign(figures, reference.figures)
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    isActive: !!row.isActive,
    ...figures,
    deleteBlocked: deleteBlocker(references)?.reason ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

const listRaw = (db: DbLike, ids?: readonly number[]) =>
  db.all<RawProgram>(sql`
    select p.id as id, p.code as code, p.name as name, p.address as address, p.is_active as isActive, p.created_at as createdAt
    from programs p ${programsWhere(ids)}
    order by p.name collate nocase, p.code collate nocase`)

export function listPrograms(db: DbLike, id?: number): ProgramRow[] {
  const ids = id ? [id] : undefined
  const references = referencesOf(db, ids)
  return listRaw(db, ids).map((row) => toRow(row, references(row.id)))
}

/** One program, and what every module has to do with it. */
function loadProgram(db: DbLike, id: number) {
  const row = listRaw(db, [id])[0]
  if (!row) throw notFound('Program')
  return { row, references: referencesOf(db, [id])(id) }
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
    const { row, references } = loadProgram(tx, id)
    if (!!row.isActive === active) return
    // Something of another module still needs it active.
    const blocker = !active && references.find((reference) => reference.deactivateBlocker)?.deactivateBlocker
    if (blocker) throw conflict(blocker.code, `${row.name} ${blocker.reason}`)
    tx.update(programs).set({ isActive: active }).where(eq(programs.id, id)).run()
    writeAudit(tx, actor, {
      action: 'update',
      entityType: 'program',
      entityId: id,
      details: `program_id=${row.code} · ${active ? 'reactivated' : 'deactivated'}`,
    })
  })
  return getProgram(db, id)
}

export function deleteProgram(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const { row: raw, references } = loadProgram(tx, id)
    const blocked = deleteBlocker(references)
    if (blocked) throw conflict(blocked.code, `${raw.name} cannot be deleted. ${blocked.reason}`)
    tx.delete(programs).where(eq(programs.id, id)).run()
    writeAudit(tx, actor, {
      action: 'delete',
      entityType: 'program',
      entityId: id,
      details: `program_id=${raw.code} · ${raw.name}`,
    })
  })
}

/** The Import page's programs: a row whose Program ID is taken is skipped, never updated. */
export const programImport: ImportStore = {
  importer: programImporter,
  existingKeys: (db) =>
    db
      .select({ code: programs.code })
      .from(programs)
      .all()
      .map((row) => row.code),
  create(tx, actor, record) {
    const row = tx
      .insert(programs)
      .values({ code: record.code!, name: record.name!, address: record.address || null })
      .returning({ id: programs.id })
      .get()
    writeAudit(tx, actor, {
      action: 'import',
      entityType: 'program',
      entityId: row.id,
      details: `program_id=${record.code} · ${record.name}`,
    })
  },
}
