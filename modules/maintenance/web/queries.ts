// The maintenance module's queries, keyed under its resource (the convention is in web/src/modules.ts).
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import type { MaintenanceDetail, MaintenanceRow } from '../shared/index.ts'

export const maintenanceQuery = queryOptions({
  queryKey: ['maintenance', 'list'],
  queryFn: () => api.get<MaintenanceRow[]>('/maintenance'),
})

export const maintenanceRequestQuery = (id: number) =>
  queryOptions({
    queryKey: ['maintenance', 'detail', id],
    queryFn: () => api.get<MaintenanceDetail>(`/maintenance/${id}`),
  })
