import { importRecord, rowProblem, type Importer, type ImportType } from '../../shared/importers.ts'
import type { ImportInput } from '../../shared/schemas.ts'
import type { ImportPreview, ImportRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import { employees, programs } from '../db/schema.ts'
import { writeAudit, type Actor } from '../lib/audit.ts'

type Fields = Record<string, string>

/** The part of an import that touches the database: which keys are taken, and how one record is written. */
interface Store {
  existingKeys(db: DbLike): string[]
  create(tx: DbLike, actor: Actor, record: Fields): void
}

const STORES: Record<ImportType, Store> = {
  employees: {
    existingKeys: (db) => db.select({ code: employees.code }).from(employees).all().map((row) => row.code),
    create(tx, actor, record) {
      const row = tx
        .insert(employees)
        .values({
          code: record.code!,
          firstName: record.firstName!,
          lastName: record.lastName!,
          department: record.department || null,
          jobTitle: record.jobTitle || null,
        })
        .returning({ id: employees.id })
        .get()
      writeAudit(tx, actor, { action: 'import', entityType: 'employee', entityId: row.id, details: `employee_id=${record.code}` })
    },
  },
  programs: {
    existingKeys: (db) => db.select({ code: programs.code }).from(programs).all().map((row) => row.code),
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
  },
}

interface Analysis {
  preview: ImportPreview
  creates: Fields[]
}

/** Judge every row against the rules and against what is already there. A key repeated in the file counts once: the first row wins. */
function analyse(db: DbLike, importer: Importer, input: ImportInput): Analysis {
  const key = importer.fields.find((field) => field.key === importer.duplicateKey)!
  const known = new Set(STORES[importer.type as ImportType].existingKeys(db).map((value) => value.toLowerCase()))
  const inFile = new Set<string>()
  const rows: ImportRow[] = []
  const creates: Fields[] = []
  const summary = { read: 0, create: 0, duplicates: 0, errors: 0 }

  for (const { row, values } of input.rows) {
    const record = importRecord(importer, values)
    const id = record[key.key]!.toLowerCase()
    summary.read += 1
    const problem = rowProblem(importer, record)
    if (problem) {
      summary.errors += 1
      rows.push({ row, values: record, result: 'error', message: `Row ${row}: ${problem}` })
    } else if (known.has(id) || inFile.has(id)) {
      summary.duplicates += 1
      const message = inFile.has(id) ? `Skip: ${key.label} appears earlier in this file` : `Skip: ${key.label} already exists`
      rows.push({ row, values: record, result: 'duplicate', message })
    } else {
      inFile.add(id)
      summary.create += 1
      creates.push(record)
      rows.push({ row, values: record, result: 'new', message: 'Create' })
    }
  }
  return { preview: { rows, summary }, creates }
}

export function previewImport(db: DbLike, importer: Importer, input: ImportInput): ImportPreview {
  return analyse(db, importer, input).preview
}

/**
 * Rows are judged again here, inside the transaction that writes them, so what was true at the preview does not have to
 * be. Existing records are skipped, never updated; one Audit Log entry per record created.
 */
export function runImport(db: Db, actor: Actor, importer: Importer, input: ImportInput): ImportPreview {
  return db.transaction((tx) => {
    const { preview, creates } = analyse(tx, importer, input)
    const store = STORES[importer.type as ImportType]
    for (const record of creates) store.create(tx, actor, record)
    return { ...preview, created: creates.length }
  })
}
