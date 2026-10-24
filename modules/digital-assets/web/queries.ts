import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'
import type { DigitalAssetDetail, DigitalAssetRow, DigitalAssetTypeRow, DigitalLookups } from '../shared/index.ts'

/** `/api/lookups`, as the digital forms read it: the assets module's pickers and the digital asset types this module adds. */
export const digitalLookupsQuery = queryOptions({
  queryKey: ['lookups'],
  queryFn: () => api.get<DigitalLookups>('/lookups'),
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
