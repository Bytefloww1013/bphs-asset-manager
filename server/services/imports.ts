import { importRecord, rowProblem } from '../../shared/importers.ts'
import type { ImportInput } from '../../shared/schemas.ts'
import type { ImportPreview, ImportRow } from '../../shared/types.ts'
import type { Db, DbLike } from '../db/client.ts'
import type { Actor } from '../lib/actor.ts'
import type { ImportStore } from '../modules.ts'

type Fields = Record<string, string>

interface Analysis {
  preview: ImportPreview
  creates: Fields[]
}

/** Judge every row against the rules and against what is already there. A key repeated in the file counts once: the first row wins. */
function analyse(db: DbLike, store: ImportStore, input: ImportInput): Analysis {
  const { importer } = store
  const key = importer.fields.find((field) => field.key === importer.duplicateKey)!
  const known = new Set(store.existingKeys(db).map((value) => value.toLowerCase()))
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
      const message = inFile.has(id)
        ? `Skip: ${key.label} appears earlier in this file`
        : `Skip: ${key.label} already exists`
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

export function previewImport(db: DbLike, store: ImportStore, input: ImportInput): ImportPreview {
  return analyse(db, store, input).preview
}

/**
 * Rows are judged again here, inside the transaction that writes them, so what was true at the preview does not have to
 * be. Existing records are skipped, never updated; one Audit Log entry per record created.
 */
export function runImport(db: Db, actor: Actor, store: ImportStore, input: ImportInput): ImportPreview {
  return db.transaction((tx) => {
    const { preview, creates } = analyse(tx, store, input)
    for (const record of creates) store.create(tx, actor, record)
    return { ...preview, created: creates.length }
  })
}
