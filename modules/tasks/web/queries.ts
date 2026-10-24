// The tasks module's queries, keyed under its resource (the convention is in web/src/modules.ts).
import { queryOptions } from '@tanstack/react-query'
import { api, qs } from '@/lib/api.ts'
import type { AccountRef, TaskDetail, TaskRow } from '../shared/types.ts'

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
