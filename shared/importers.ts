import type { ZodType } from 'zod'
import type { Section } from './constants.ts'
import { describeRowProblem } from './rows.ts'

export interface ImportField {
  /** The record's own name for the field; the server reads a row's values by it. */
  key: string
  /** What the screens call it, and the header the template is written with. */
  label: string
  required: boolean
  /** Other headers a file might use for the same thing. */
  aliases: readonly string[]
  example: string
}

/**
 * A spreadsheet importer. A module registers it twice: with its store on the server (`hooks('importers')`) and on the website
 * (`importers`). Records that hang off others (assets, assignments, digital assets) have none on purpose: an import never issues anything.
 */
export interface Importer {
  type: string
  /** Plural, as the screens name the record type. */
  label: string
  singular: string
  /** The section the records belong to: importing them needs Edit there. */
  section: Section
  fields: readonly ImportField[]
  /** The field that makes a row a duplicate, compared without regard to case. */
  duplicateKey: string
  /** The same rules the record's Add dialog follows. */
  schema: ZodType
}

// "Employee ID", "employee_id" and "EmployeeId" are one header.
const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * Which column of the file each field most likely comes from: the column's position, or null when nothing matches.
 * A field's own name is tried on every column before any alias, and a column is never given to two fields.
 */
export function autoMap(importer: Importer, headers: readonly string[]): Record<string, number | null> {
  const names = headers.map(normalise)
  const taken = new Set<number>()
  const mapping: Record<string, number | null> = {}
  const claim = (field: ImportField, candidates: readonly string[]) => {
    if (mapping[field.key] != null) return
    for (const candidate of candidates) {
      const at = names.findIndex((name, i) => name !== '' && name === normalise(candidate) && !taken.has(i))
      if (at === -1) continue
      taken.add(at)
      mapping[field.key] = at
      return
    }
  }
  for (const field of importer.fields) mapping[field.key] = null
  for (const field of importer.fields) claim(field, [field.label, field.key])
  for (const field of importer.fields) claim(field, field.aliases)
  return mapping
}

/** A row's values with every field present and trimmed, whatever was sent. */
export function importRecord(importer: Importer, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(importer.fields.map((field) => [field.key, (values[field.key] ?? '').trim()]))
}

/** What stops a row from being created, or null. Empty required cells are named together; the rest must fit the Add dialog. */
export function rowProblem(importer: Importer, record: Record<string, string>): string | null {
  const lacking = importer.fields.filter((field) => field.required && !record[field.key]).map((field) => field.label)
  if (lacking.length > 0) return `missing ${lacking.join(', ')}`
  const checked = importer.schema.safeParse(record)
  if (checked.success) return null
  return describeRowProblem(checked.error, Object.fromEntries(importer.fields.map((field) => [field.key, field.label])))
}
