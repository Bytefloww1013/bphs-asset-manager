import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type {
  AssetDetail,
  AssetRow,
  AssetTypeRow,
  AssignmentRow,
  AuditPage,
  ConditionRatingRow,
  DashboardData,
  DigitalAssetDetail,
  DigitalAssetRow,
  DigitalAssetTypeRow,
  EmployeeRow,
  GrievanceCategoryRow,
  Lookups,
  ProgramRow,
  SessionUser,
  UserRow,
} from '@shared/types.ts'
import { ApiError, api, qs } from './api.ts'
import { startOfLocalDay } from './format.ts'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async ({ client }): Promise<SessionUser | null> => {
    try {
      return (await api.get<{ user: SessionUser }>('/auth/me')).user
    } catch (error) {
      // Signed out: nobody. But a tab that was signed in keeps who it was, as an error, so the page stays up while it asks for the
      // password again (handleAuthFailure in router.tsx). The API still answers /auth/me for a user who must change their password.
      if (error instanceof ApiError && error.status === 401 && !client.getQueryData(['me'])) return null
      throw error
    }
  },
  retry: false,
})

export const lookupsQuery = queryOptions({
  queryKey: ['lookups'],
  queryFn: () => api.get<Lookups>('/lookups'),
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

export const programsQuery = queryOptions({
  queryKey: ['programs'],
  queryFn: () => api.get<ProgramRow[]>('/programs'),
})

export const assetTypesQuery = queryOptions({
  queryKey: ['asset-types'],
  queryFn: () => api.get<AssetTypeRow[]>('/asset-types'),
})

export const grievanceCategoriesQuery = queryOptions({
  queryKey: ['grievances', 'categories'],
  queryFn: () => api.get<GrievanceCategoryRow[]>('/grievances/categories'),
})

export const digitalAssetsQuery = queryOptions({
  queryKey: ['digital-assets'],
  queryFn: () => api.get<DigitalAssetRow[]>('/digital-assets'),
})

export const digitalAssetDetailQuery = (id: number) =>
  queryOptions({
    queryKey: ['digital-asset', id],
    queryFn: () => api.get<DigitalAssetDetail>(`/digital-assets/${id}`),
  })

export const digitalAssetTypesQuery = queryOptions({
  queryKey: ['digital-asset-types'],
  queryFn: () => api.get<DigitalAssetTypeRow[]>('/digital-asset-types'),
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
