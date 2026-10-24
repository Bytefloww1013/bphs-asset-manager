// The programs module's writes. A page runs each through `useWrite` (`@/lib/hooks.ts`), which refreshes every query.
import { api } from '@/lib/api.ts'
import type { ProgramRow } from '../shared/index.ts'

/** What the add and edit forms send: each field as typed, empty for none. The server trims and checks them. */
export interface ProgramBody {
  name: string
  code: string
  address: string
}

export const createProgram = (body: ProgramBody) => api.post<ProgramRow>('/programs', body)
export const updateProgram = (id: number, body: ProgramBody) => api.patch<ProgramRow>(`/programs/${id}`, body)
export const deactivateProgram = (id: number) => api.post(`/programs/${id}/deactivate`)
export const reactivateProgram = (id: number) => api.post(`/programs/${id}/reactivate`)
export const deleteProgram = (id: number) => api.delete(`/programs/${id}`)
