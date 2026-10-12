import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type {
  AssetDetail,
  AssetRow,
  AssetTypeRow,
  AssignmentRow,
  AuditPage,
  ConditionRatingRow,
  DashboardData,
  EmployeeRow,
  Lookups,
  SessionUser,
  UserRow,
} from '@shared/types.ts'
import { ApiError, api, qs } from './api.ts'
import { startOfLocalDay } from './format.ts'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<SessionUser | null> => {
    try {
      return (await api.get<{ user: SessionUser }>('/auth/me')).user
    } catch (error) {
      // Signed out, or signed in but must change the password first (the API still answers /auth/me then).
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 60_000,
  retry: false,
})

export const lookupsQuery = queryOptions({
  queryKey: ['lookups'],
  queryFn: () => api.get<Lookups>('/lookups'),
  staleTime: 5 * 60_000,
})

export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: () => api.get<DashboardData>('/dashboard'),
})

export const assetsQuery = queryOptions({
  queryKey: ['assets'],
  queryFn: () => api.get<AssetRow[]>('/assets'),
})

export const assetDetailQuery = (tag: string) =>
  queryOptions({
    queryKey: ['asset', tag.toUpperCase()],
    queryFn: () => api.get<AssetDetail>(`/assets/tag/${encodeURIComponent(tag)}`),
  })

export const assignmentsQuery = queryOptions({
  queryKey: ['assignments'],
  queryFn: () => api.get<AssignmentRow[]>('/assignments'),
})

export const employeesQuery = queryOptions({
  queryKey: ['employees'],
  queryFn: () => api.get<EmployeeRow[]>('/employees'),
})

export const assetTypesQuery = queryOptions({
  queryKey: ['asset-types'],
  queryFn: () => api.get<AssetTypeRow[]>('/asset-types'),
})

export const ratingsQuery = queryOptions({
  queryKey: ['condition-ratings'],
  queryFn: () => api.get<ConditionRatingRow[]>('/condition-ratings'),
})

export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: () => api.get<UserRow[]>('/users'),
})

export interface AuditParams {
  action?: string
  /** The first and last day to show, as `YYYY-MM-DD` in the viewer's time zone, the way the date inputs hold them. */
  from?: string
  to?: string
  q?: string
  limit: number
  offset: number
}

/** The server filters by instants. Entries are shown in the viewer's time zone, so their days start where the viewer's do. */
const auditRange = ({ from, to }: Pick<AuditParams, 'from' | 'to'>) => ({
  from: from ? startOfLocalDay(from) : undefined,
  // The last day is shown whole, so the range ends where the next day starts.
  to: to ? startOfLocalDay(to, 1) : undefined,
})

export const auditQuery = (params: AuditParams) =>
  queryOptions({
    queryKey: ['audit', params],
    queryFn: () => api.get<AuditPage>(`/audit${qs({ ...params, ...auditRange(params) })}`),
    placeholderData: (previous) => previous,
  })

export const auditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) => `/api/audit.csv${qs({ ...params, ...auditRange(params) })}`

/** After any write, refresh everything that could have changed. The data set is small; correctness beats cleverness. */
export function refreshData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
}
