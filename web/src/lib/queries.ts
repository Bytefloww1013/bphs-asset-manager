import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query'
import type {
  AssetBrandRow,
  AssetDetail,
  AssetRow,
  AssetTypeRow,
  AssignmentRow,
  AuditPage,
  GrievanceAuditPage,
  ConditionRatingRow,
  DashboardData,
  DigitalAssetDetail,
  DigitalAssetRow,
  DigitalAssetTypeRow,
  EmployeeRow,
  GrievanceCategoryRow,
  GrievanceAttachment,
  GrievanceDetail,
  GrievanceEntry,
  GrievanceList,
  GrievanceVersion,
  Lookups,
  MaintenanceDetail,
  MaintenanceRow,
  NoticeRow,
  NoticeText,
  NotificationPage,
  ProgramRow,
  ReviewAuditPage,
  ReviewDetail,
  ReviewActionItem,
  ReviewAttachment,
  ReviewCap,
  ReviewEntry,
  ReviewList,
  SessionUser,
  AccountRef,
  TaskDetail,
  TaskRow,
  UserRow,
} from '@shared/types.ts'
import type { GrievanceStatus, NotificationView, ReviewStatus } from '@shared/constants.ts'
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

export const assetBrandsQuery = queryOptions({
  queryKey: ['asset-brands'],
  queryFn: () => api.get<AssetBrandRow[]>('/asset-brands'),
})

export const maintenanceQuery = queryOptions({
  queryKey: ['maintenance', 'list'],
  queryFn: () => api.get<MaintenanceRow[]>('/maintenance'),
})

export const maintenanceRequestQuery = (id: number) =>
  queryOptions({
    queryKey: ['maintenance', 'detail', id],
    queryFn: () => api.get<MaintenanceDetail>(`/maintenance/${id}`),
  })

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

/** A page of an audit log: the Audit Log at `audit`, the Grievance Audit Log at `grievances/audit`, the Review Audit Log at `reviews/audit`. */
const logQuery = <T>(log: string, params: AuditParams) =>
  queryOptions({
    queryKey: [log, params],
    queryFn: () => api.get<T>(`/${log}${qs({ ...params, ...auditRange(params) })}`),
    placeholderData: (previous) => previous,
  })
const logCsvUrl = (log: string, params: Omit<AuditParams, 'limit' | 'offset'>) =>
  `/api/${log}.csv${qs({ ...params, ...auditRange(params) })}`

export const auditQuery = (params: AuditParams) => logQuery<AuditPage>('audit', params)
export const auditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) => logCsvUrl('audit', params)
export const grievanceAuditQuery = (params: AuditParams) => logQuery<GrievanceAuditPage>('grievances/audit', params)
export const grievanceAuditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) =>
  logCsvUrl('grievances/audit', params)
export const reviewAuditQuery = (params: AuditParams) => logQuery<ReviewAuditPage>('reviews/audit', params)
export const reviewAuditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) => logCsvUrl('reviews/audit', params)

// ---- My Space: notifications --------------------------------------------------------------

export const notificationCountQuery = queryOptions({
  queryKey: ['notifications', 'count'],
  queryFn: () => api.get<{ unread: number }>('/me/notifications/count'),
  select: (data) => data.unread,
  // Nothing is pushed: the bell asks every 30 seconds, and when the tab comes back.
  refetchInterval: 30_000,
})

/** The bell's popover: the latest few that are not archived. */
export const latestNotificationsQuery = queryOptions({
  queryKey: ['notifications', 'latest'],
  queryFn: () => api.get<NotificationPage>('/me/notifications?view=all&limit=8'),
  staleTime: 0,
})

export const notificationsQuery = (view: NotificationView) =>
  infiniteQueryOptions({
    queryKey: ['notifications', 'list', view],
    queryFn: ({ pageParam }) => api.get<NotificationPage>(`/me/notifications${qs({ view, before: pageParam })}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })

/** A notice as its recipient reads it. Fetching it marks it read. */
export const noticeQuery = (id: number) =>
  queryOptions({ queryKey: ['notice', id], queryFn: () => api.get<NoticeText>(`/me/notices/${id}`) })

/** Sent notices with their read counts: Super Admins only. */
export const noticesQuery = queryOptions({ queryKey: ['notices'], queryFn: () => api.get<NoticeRow[]>('/notices') })

// Every task, whatever its status: the list filters them in the browser, as Maintenance does.
export const tasksQuery = queryOptions({
  queryKey: ['tasks', 'list'],
  queryFn: () => api.get<TaskRow[]>('/tasks'),
})

export const taskQuery = (id: number) =>
  queryOptions({
    queryKey: ['tasks', 'detail', id],
    queryFn: () => api.get<TaskDetail>(`/tasks/${id}`),
  })

/** The active accounts a task can be sent to. Needs Assign. */
export const taskAccountsQuery = queryOptions({
  queryKey: ['tasks', 'accounts'],
  queryFn: () => api.get<AccountRef[]>('/tasks/accounts'),
})

// Keyed under 'tasks', not 'me': refreshData skips 'me' queries, and a write must refresh these.
export const myTasksQuery = (cancelled: boolean) =>
  queryOptions({
    queryKey: ['tasks', 'mine', { cancelled }],
    queryFn: () => api.get<TaskRow[]>(`/me/tasks${qs({ cancelled: cancelled ? 'true' : undefined })}`),
  })

export const myTaskQuery = (id: number) =>
  queryOptions({
    queryKey: ['tasks', 'mine', 'detail', id],
    queryFn: () => api.get<TaskDetail>(`/me/tasks/${id}`),
  })

/** After any write, refresh everything that could have changed. The data set is small; correctness beats cleverness. */
export function refreshData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
}
