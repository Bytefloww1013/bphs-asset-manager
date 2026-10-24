// The employees module's writes. A page runs each through `useWrite` (`@/lib/hooks.ts`), which refreshes every query.
import { api } from '@/lib/api.ts'
import type { EmployeeRow } from '../shared/index.ts'

/** What the add and edit forms send: each field as typed, empty for none. The server trims and checks them. */
export interface EmployeeBody {
  code: string
  firstName: string
  lastName: string
  department: string
  jobTitle: string
}

export const createEmployee = (body: EmployeeBody) => api.post<EmployeeRow>('/employees', body)
export const updateEmployee = (id: number, body: EmployeeBody) => api.patch<EmployeeRow>(`/employees/${id}`, body)
export const archiveEmployee = (id: number) => api.post(`/employees/${id}/archive`)
export const restoreEmployee = (id: number) => api.post(`/employees/${id}/restore`)
export const deleteEmployee = (id: number) => api.delete(`/employees/${id}`)
