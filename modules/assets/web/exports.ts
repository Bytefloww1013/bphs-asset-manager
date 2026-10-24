// The physical assets' exports, on the Import/Export page and the pages that list them.
import { defineDataset } from '@/lib/exports.ts'
import { formatDate, formatDateTime } from '@/lib/format.ts'
import type { AssetRow, AssignmentRow } from '../shared/index.ts'
import { assetsQuery, assignmentsQuery } from './queries.ts'
import { stateLabel } from './status.tsx'

export const assetsExport = defineDataset<AssetRow>({
  label: 'Physical Assets',
  description: 'Every device on the register, with its current holder and latest condition.',
  filename: 'physical-assets',
  order: 10,
  headers: [
    'Asset tag',
    'Type',
    'Brand',
    'Model',
    'Entra ObjectId',
    'Serial',
    'Status',
    'Assigned to',
    'Employee ID',
    'Department',
    'Condition',
    'Days out',
    'Created',
  ],
  row: (a) => [
    a.tag,
    a.type,
    a.brand,
    a.model,
    a.entraObjectId,
    a.serial,
    stateLabel(a.state),
    (a.holder ?? a.program)?.name,
    a.holder?.code,
    a.holder?.department,
    a.condition?.rating,
    a.daysOut,
    formatDate(a.createdAt),
  ],
  load: (queryClient) => queryClient.fetchQuery({ ...assetsQuery, staleTime: 0 }),
})

export const assignmentsExport = defineDataset<AssignmentRow>({
  label: 'Active Assignments',
  description: 'Every asset that is out now, and the employee or program holding it.',
  filename: 'active-assignments',
  order: 50,
  headers: [
    'Asset tag',
    'Type',
    'Brand',
    'Model',
    'Entra ObjectId',
    'Holder type',
    'Holder',
    'Holder ID',
    'Department',
    'Issued',
    'Condition at issue',
    'Days out',
  ],
  row: (r) => {
    // An assignment always has one holder: an employee or a program.
    const holder = (r.employee ?? r.program)!
    return [
      r.assetTag,
      r.assetType,
      r.assetBrand,
      r.assetModel,
      r.assetEntraObjectId,
      r.program ? 'Program' : 'Employee',
      holder.name,
      holder.code,
      r.employee?.department,
      formatDateTime(r.issuedAt),
      r.issueRating,
      r.daysOut,
    ]
  },
  load: (queryClient) => queryClient.fetchQuery({ ...assignmentsQuery, staleTime: 0 }),
})
