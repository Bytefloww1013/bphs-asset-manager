import type { Importer } from '#shared/importers.ts'
import { programCreateSchema } from './schemas.ts'

/** Programs from a spreadsheet, on the Import & export page. Importing them needs Edit in Assets, which they belong to. */
export const programImporter = {
  type: 'programs',
  label: 'Programs',
  singular: 'program',
  section: 'assets',
  duplicateKey: 'code',
  schema: programCreateSchema,
  fields: [
    {
      key: 'code',
      label: 'Program ID',
      required: true,
      aliases: ['program_id', 'program code', 'program number', 'code', 'id'],
      example: 'PRG-014',
    },
    {
      key: 'name',
      label: 'Program name',
      required: true,
      aliases: ['program_name', 'program', 'name'],
      example: 'Riverside Day Program',
    },
    {
      key: 'address',
      label: 'Program address',
      required: false,
      aliases: ['program_address', 'address', 'location', 'site'],
      example: '12 Mill Road',
    },
  ],
} as const satisfies Importer
