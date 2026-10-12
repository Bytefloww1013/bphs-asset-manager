import type { QueryClient } from '@tanstack/react-query'
import type { AssetRow, AssignmentRow, DigitalAssetRow, EmployeeRow, ProgramRow } from '@shared/types.ts'
import { stateLabel } from '@/features/common/status.tsx'
import { digitalStateLabel } from '@/features/digital-assets/digital-parts.tsx'
import { formatDate, formatDateTime } from './format.ts'
import { assetsQuery, assignmentsQuery, digitalAssetsQuery, employeesQuery, programsQuery } from './queries.ts'
import { downloadTable, type FileFormat, type SheetCell } from './spreadsheet.ts'

interface Spec<T> {
  /** What the screens call the records, and the name of the sheet in a workbook. */
  label: string
  description: string
  /** The file's name, without its extension. */
  filename: string
  headers: string[]
  row: (item: T) => SheetCell[]
  load: (queryClient: QueryClient) => Promise<T[]>
}

export interface Dataset<T> extends Spec<T> {
  /** Save rows the page already has. */
  save: (items: T[], format: FileFormat) => Promise<void>
  /** Fetch every record as it is now, and save that. */
  fetchAndSave: (queryClient: QueryClient, format: FileFormat) => Promise<number>
}

function define<T>(spec: Spec<T>): Dataset<T> {
  const save = (items: T[], format: FileFormat) => downloadTable(format, spec.filename, spec.headers, items.map(spec.row), spec.label)
  return {
    ...spec,
    save,
    async fetchAndSave(queryClient, format) {
      const items = await spec.load(queryClient)
      await save(items, format)
      return items.length
    },
  }
}

const employeeState = { active: 'Active', archived: 'Archived' } as const

/**
 * One definition per export, so a file is the same wherever it is downloaded from. An export shows who holds what; nothing
 * here can be imported back to change that.
 */
export const EXPORTS = {
  assets: define<AssetRow>({
    label: 'Physical Assets',
    description: 'Every device on the register, with its current holder and latest condition.',
    filename: 'physical-assets',
    headers: ['Asset tag', 'Type', 'Serial', 'Status', 'Assigned to', 'Employee ID', 'Department', 'Condition', 'Days out', 'Created'],
    row: (a) => [a.tag, a.type, a.serial, stateLabel(a.state), (a.holder ?? a.program)?.name, a.holder?.code, a.holder?.department, a.condition?.rating, a.daysOut, formatDate(a.createdAt)],
    load: (queryClient) => queryClient.fetchQuery({ ...assetsQuery, staleTime: 0 }),
  }),
  digitalAssets: define<DigitalAssetRow>({
    label: 'Digital Assets',
    description: 'Every license and account seat, and the employee it is issued to.',
    filename: 'digital-assets',
    headers: ['Asset ID', 'Type', 'License/Account', 'Assigned Employee', 'Employee ID', 'Status', 'Issue Date'],
    row: (row) => [row.code, row.type, row.account, row.employee?.name, row.employee?.code, digitalStateLabel(row.state), row.issuedAt ? formatDate(row.issuedAt) : ''],
    load: (queryClient) => queryClient.fetchQuery({ ...digitalAssetsQuery, staleTime: 0 }),
  }),
  employees: define<EmployeeRow>({
    label: 'Employees',
    description: 'Everyone who can hold equipment, archived employees included, with how much each holds now.',
    filename: 'employees',
    headers: ['Employee ID', 'First name', 'Last name', 'Department', 'Job title', 'Status', 'Physical assets held', 'Digital assets held'],
    row: (e) => [e.code, e.firstName, e.lastName, e.department, e.jobTitle, employeeState[e.state], e.assetsHeld, e.digitalHeld],
    load: (queryClient) => queryClient.fetchQuery({ ...employeesQuery, staleTime: 0 }),
  }),
  programs: define<ProgramRow>({
    label: 'Programs',
    description: 'Every program, deactivated ones included, with how many assets each holds now.',
    filename: 'programs',
    headers: ['Program ID', 'Program name', 'Program address', 'Status', 'Physical assets held'],
    row: (p) => [p.code, p.name, p.address, p.isActive ? 'Active' : 'Deactivated', p.assetsHeld],
    load: (queryClient) => queryClient.fetchQuery({ ...programsQuery, staleTime: 0 }),
  }),
  assignments: define<AssignmentRow>({
    label: 'Active Assignments',
    description: 'Every asset that is out now, and the employee or program holding it.',
    filename: 'active-assignments',
    headers: ['Asset tag', 'Type', 'Holder type', 'Holder', 'Holder ID', 'Department', 'Issued', 'Condition at issue', 'Days out'],
    row: (r) => {
      // An assignment always has one holder: an employee or a program.
      const holder = (r.employee ?? r.program)!
      return [r.assetTag, r.assetType, r.program ? 'Program' : 'Employee', holder.name, holder.code, r.employee?.department, formatDateTime(r.issuedAt), r.issueRating, r.daysOut]
    },
    load: (queryClient) => queryClient.fetchQuery({ ...assignmentsQuery, staleTime: 0 }),
  }),
}

export type ExportKey = keyof typeof EXPORTS
