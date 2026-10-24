// The Employees export, on the Import/Export page and the Employees page alike.
import { defineDataset } from '@/lib/exports.ts'
import type { EmployeeRow } from '../shared/index.ts'
import { employeesQuery } from './queries.ts'

const employeeState = { active: 'Active', archived: 'Archived' } as const

export const employeesExport = defineDataset<EmployeeRow>({
  label: 'Employees',
  description: 'Everyone who can hold equipment, archived employees included, with how much each holds now.',
  filename: 'employees',
  order: 30,
  headers: [
    'Employee ID',
    'First name',
    'Last name',
    'Department',
    'Job title',
    'Status',
    'Physical assets held',
    'Digital assets held',
  ],
  row: (e) => [
    e.code,
    e.firstName,
    e.lastName,
    e.department,
    e.jobTitle,
    employeeState[e.state],
    e.assetsHeld,
    e.digitalHeld,
  ],
  load: (queryClient) => queryClient.fetchQuery({ ...employeesQuery, staleTime: 0 }),
})
