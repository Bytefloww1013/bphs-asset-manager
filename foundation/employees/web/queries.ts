// The employees module's queries, keyed under its resource (the convention is in web/src/modules.ts).
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import type { EmployeeRow } from '../shared/index.ts'

export const employeesQuery = queryOptions({
  queryKey: ['employees'],
  queryFn: () => api.get<EmployeeRow[]>('/employees'),
})
