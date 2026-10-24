// The grievances module's queries, keyed under its resource (the convention is in web/src/modules.ts).
import { logCsvUrl, logQuery, type AuditParams } from '#foundation/audit/web/index.ts'
import { queryOptions } from '@tanstack/react-query'
import { api, qs } from '@/lib/api.ts'
import type { GrievanceStatus } from '../shared/constants.ts'
import type {
  GrievanceAttachment,
  GrievanceAuditPage,
  GrievanceCategoryRow,
  GrievanceDetail,
  GrievanceEntry,
  GrievanceList,
  GrievanceVersion,
} from '../shared/types.ts'

export const grievanceCategoriesQuery = queryOptions({
  queryKey: ['grievances', 'categories'],
  queryFn: () => api.get<GrievanceCategoryRow[]>('/grievances/categories'),
})

export interface GrievanceListParams {
  status?: GrievanceStatus | 'all'
  owner?: number
  category?: number
  from?: string
  to?: string
  q?: string
}

export const grievancesQuery = (params: GrievanceListParams) =>
  queryOptions({
    queryKey: ['grievances', 'list', params],
    queryFn: () => api.get<GrievanceList>(`/grievances${qs({ ...params })}`),
    placeholderData: (previous) => previous,
  })

export const grievanceQuery = (code: string) =>
  queryOptions({
    queryKey: ['grievances', 'detail', code.toUpperCase()],
    queryFn: () => api.get<GrievanceDetail>(`/grievances/${encodeURIComponent(code)}`),
  })

/** The employees an account that can sign in is linked to: the owners who can change their own grievances. */
export const grievanceAccountHoldersQuery = queryOptions({
  queryKey: ['grievances', 'account-holders'],
  queryFn: () => api.get<number[]>('/grievances/account-holders'),
})

/** Every entry on one grievance's timeline. Kept under the grievance's own key, so whatever refreshes the grievance refreshes these. */
export const grievanceEntriesQuery = (code: string) =>
  queryOptions({
    queryKey: ['grievances', 'detail', code.toUpperCase(), 'entries'],
    queryFn: () => api.get<GrievanceEntry[]>(`/grievances/${encodeURIComponent(code)}/entries`),
  })

export const grievanceAttachmentsQuery = (code: string) =>
  queryOptions({
    queryKey: ['grievances', 'detail', code.toUpperCase(), 'attachments'],
    queryFn: () => api.get<GrievanceAttachment[]>(`/grievances/${encodeURIComponent(code)}/attachments`),
  })

/** What a grievance said before each edit, the latest first. Under the grievance's own key, like its entries. */
export const grievanceVersionsQuery = (code: string) =>
  queryOptions({
    queryKey: ['grievances', 'detail', code.toUpperCase(), 'versions'],
    queryFn: () => api.get<GrievanceVersion[]>(`/grievances/${encodeURIComponent(code)}/versions`),
  })

export const grievanceAuditQuery = (params: AuditParams) => logQuery<GrievanceAuditPage>('grievances/audit', params)
export const grievanceAuditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) =>
  logCsvUrl('grievances/audit', params)
