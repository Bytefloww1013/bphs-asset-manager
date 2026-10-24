// The notifications module's queries. Everything about the Inbox is keyed under `notifications`, so a change anywhere refreshes the
// bell, its popover and the Inbox together.
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, qs } from '@/lib/api.ts'
import type { NoticeRow, NoticeText, NotificationPage, NotificationView } from '../shared/index.ts'

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
