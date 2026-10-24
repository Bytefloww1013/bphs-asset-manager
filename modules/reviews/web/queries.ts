// The reviews module's queries, keyed under its resource (the convention is in web/src/modules.ts).
import { logCsvUrl, logQuery, type AuditParams } from '#foundation/audit/web/index.ts'
import { queryOptions } from '@tanstack/react-query'
import { api, qs } from '@/lib/api.ts'
import type { ReviewStatus } from '../shared/constants.ts'
import type {
  ReviewActionItem,
  ReviewAttachment,
  ReviewAuditPage,
  ReviewCap,
  ReviewDetail,
  ReviewEntry,
  ReviewList,
} from '../shared/types.ts'

export interface ReviewListParams {
  status?: ReviewStatus | 'all'
  reviewer?: number
  employee?: number
  from?: string
  to?: string
  q?: string
}

export const reviewsQuery = (params: ReviewListParams) =>
  queryOptions({
    queryKey: ['reviews', 'list', params],
    queryFn: () => api.get<ReviewList>(`/reviews${qs({ ...params })}`),
    placeholderData: (previous) => previous,
  })

export const reviewQuery = (code: string) =>
  queryOptions({
    queryKey: ['reviews', 'detail', code.toUpperCase()],
    queryFn: () => api.get<ReviewDetail>(`/reviews/${encodeURIComponent(code)}`),
  })

/** Every entry on one review's history, under the review's own key like a grievance's. */
export const reviewEntriesQuery = (code: string) =>
  queryOptions({
    queryKey: ['reviews', 'detail', code.toUpperCase(), 'entries'],
    queryFn: () => api.get<ReviewEntry[]>(`/reviews/${encodeURIComponent(code)}/entries`),
  })

/** Every CAP of one review, in number order. A CAP's page reads its CAP from here, as an entry's page reads its entry. */
export const reviewCapsQuery = (code: string) =>
  queryOptions({
    queryKey: ['reviews', 'detail', code.toUpperCase(), 'caps'],
    queryFn: () => api.get<ReviewCap[]>(`/reviews/${encodeURIComponent(code)}/caps`),
  })

/** Every file on one review and its CAPs, withdrawn ones too, in the order they were added. */
export const reviewAttachmentsQuery = (code: string) =>
  queryOptions({
    queryKey: ['reviews', 'detail', code.toUpperCase(), 'attachments'],
    queryFn: () => api.get<ReviewAttachment[]>(`/reviews/${encodeURIComponent(code)}/attachments`),
  })

export const reviewActionItemsQuery = queryOptions({
  queryKey: ['reviews', 'action-items'],
  queryFn: () => api.get<ReviewActionItem[]>('/reviews/action-items'),
})

export const reviewAuditQuery = (params: AuditParams) => logQuery<ReviewAuditPage>('reviews/audit', params)
export const reviewAuditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) => logCsvUrl('reviews/audit', params)
