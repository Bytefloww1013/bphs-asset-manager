import type { ZodType } from 'zod'
import type { Permission } from './permissions.ts'
import { describeRowProblem } from './rows.ts'
import { employeeCreateSchema, programCreateSchema } from './schemas.ts'

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

export interface Importer {
  type: string
  /** Plural, as the screens name the record type. */
  label: string
  singular: string
  permission: Permission
  fields: readonly ImportField[]
  /** The field that makes a row a duplicate, compared without regard to case. */
  duplicateKey: string
  /** The same rules the record's Add dialog follows. */
  schema: ZodType
}

/**
 * Everything that can be imported. Records that hang off others (assets, assignments, digital assets) are left out on
 * purpose: an import never issues anything.
 */
export const IMPORTERS = {
  employees: {
    type: 'employees',
    label: 'Employees',
    singular: 'employee',
    permission: 'record.write',
    duplicateKey: 'code',
    schema: employeeCreateSchema,
    fields: [
      { key: 'code', label: 'Employee ID', required: true, aliases: ['employee_id', 'employee number', 'employee no', 'emp id', 'staff id', 'id'], example: 'E-2051' },
      { key: 'firstName', label: 'First name', required: true, aliases: ['first_name', 'given name', 'forename', 'first'], example: 'Dana' },
      { key: 'lastName', label: 'Last name', required: true, aliases: ['last_name', 'surname', 'family name', 'last'], example: 'Whitfield' },
      { key: 'department', label: 'Department', required: false, aliases: ['dept', 'team'], example: 'Finance' },
      { key: 'jobTitle', label: 'Job title', required: false, aliases: ['job_title', 'title', 'position', 'role'], example: 'Accounts Clerk' },
    ],
  },
  programs: {
    type: 'programs',
    label: 'Programs',
    singular: 'program',
    permission: 'record.write',
    duplicateKey: 'code',
    schema: programCreateSchema,
    fields: [
      { key: 'code', label: 'Program ID', required: true, aliases: ['program_id', 'program code', 'program number', 'code', 'id'], example: 'PRG-014' },
      { key: 'name', label: 'Program name', required: true, aliases: ['program_name', 'program', 'name'], example: 'Riverside Day Program' },
      { key: 'address', label: 'Program address', required: false, aliases: ['program_address', 'address', 'location', 'site'], example: '12 Mill Road' },
    ],
  },
} as const satisfies Record<string, Importer>

export type ImportType = keyof typeof IMPORTERS
export const IMPORT_TYPES = Object.keys(IMPORTERS) as ImportType[]

export const importerFor = (type: string): Importer | null => (Object.hasOwn(IMPORTERS, type) ? IMPORTERS[type as ImportType] : null)

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
