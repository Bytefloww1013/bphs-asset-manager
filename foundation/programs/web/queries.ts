// The programs module's queries, keyed under its own id (the convention is in web/src/modules.ts).
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import type { ProgramRow } from '../shared/index.ts'

export const programsQuery = queryOptions({
  queryKey: ['programs'],
  queryFn: () => api.get<ProgramRow[]>('/programs'),
})
