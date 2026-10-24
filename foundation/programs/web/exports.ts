// The Programs export, on the Import/Export page and the Programs page alike.
import { defineDataset } from '@/lib/exports.ts'
import type { ProgramRow } from '../shared/index.ts'
import { programsQuery } from './queries.ts'

export const programsExport = defineDataset<ProgramRow>({
  label: 'Programs',
  description: 'Every program, deactivated ones included, with how many assets each holds now.',
  filename: 'programs',
  order: 40,
  headers: ['Program ID', 'Program name', 'Program address', 'Status', 'Physical assets held'],
  row: (p) => [p.code, p.name, p.address, p.isActive ? 'Active' : 'Deactivated', p.assetsHeld],
  load: (queryClient) => queryClient.fetchQuery({ ...programsQuery, staleTime: 0 }),
})
