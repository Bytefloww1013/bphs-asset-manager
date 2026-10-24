import type { Importer } from '#shared/importers.ts'
import { employeeCreateSchema } from './schemas.ts'

/** Employees from a spreadsheet, on the Import & export page. A duplicate is a row whose Employee ID is already taken. */
export const employeeImporter = {
  type: 'employees',
  label: 'Employees',
  singular: 'employee',
  section: 'employees',
  duplicateKey: 'code',
  schema: employeeCreateSchema,
  fields: [
    {
      key: 'code',
      label: 'Employee ID',
      required: true,
      aliases: ['employee_id', 'employee number', 'employee no', 'emp id', 'staff id', 'id'],
      example: 'E-2051',
    },
    {
      key: 'firstName',
      label: 'First name',
      required: true,
      aliases: ['first_name', 'given name', 'forename', 'first'],
      example: 'Dana',
    },
    {
      key: 'lastName',
      label: 'Last name',
      required: true,
      aliases: ['last_name', 'surname', 'family name', 'last'],
      example: 'Whitfield',
    },
    { key: 'department', label: 'Department', required: false, aliases: ['dept', 'team'], example: 'Finance' },
    {
      key: 'jobTitle',
      label: 'Job title',
      required: false,
      aliases: ['job_title', 'title', 'position', 'role'],
      example: 'Accounts Clerk',
    },
  ],
} as const satisfies Importer
