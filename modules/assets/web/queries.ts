import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import type {
  AssetBrandRow,
  AssetDetail,
  AssetRow,
  AssetTypeRow,
  AssignmentRow,
  ConditionRatingRow,
  DashboardData,
  Lookups,
} from '../shared/index.ts'

/** What the forms pick from: asset types, brands and ratings, employees and programs, and what other modules add (`lookups`). */
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

export const assetTypesQuery = queryOptions({
  queryKey: ['asset-types'],
  queryFn: () => api.get<AssetTypeRow[]>('/asset-types'),
})

export const assetBrandsQuery = queryOptions({
  queryKey: ['asset-brands'],
  queryFn: () => api.get<AssetBrandRow[]>('/asset-brands'),
})

export const ratingsQuery = queryOptions({
  queryKey: ['condition-ratings'],
  queryFn: () => api.get<ConditionRatingRow[]>('/condition-ratings'),
})
