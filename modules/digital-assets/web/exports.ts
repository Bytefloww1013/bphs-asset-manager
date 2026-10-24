// The digital assets' export, on the Import/Export page and the Digital Assets page.
import { defineDataset } from '@/lib/exports.ts'
import { formatDate } from '@/lib/format.ts'
import type { DigitalAssetRow } from '../shared/index.ts'
import { digitalStateLabel } from './digital-parts.tsx'
import { digitalAssetsQuery } from './queries.ts'

/** Shows who holds which seat; nothing here can be imported back to change that. */
export const digitalAssetsExport = defineDataset<DigitalAssetRow>({
  label: 'Digital Assets',
  description: 'Every license and account seat, and the employee it is issued to.',
  filename: 'digital-assets',
  order: 20,
  headers: ['Asset ID', 'Type', 'License/Account', 'Assigned Employee', 'Employee ID', 'Status', 'Issue Date'],
  row: (row) => [
    row.code,
    row.type,
    row.account,
    row.employee?.name,
    row.employee?.code,
    digitalStateLabel(row.state),
    row.issuedAt ? formatDate(row.issuedAt) : '',
  ],
  load: (queryClient) => queryClient.fetchQuery({ ...digitalAssetsQuery, staleTime: 0 }),
})
