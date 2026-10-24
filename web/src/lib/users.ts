import { queryOptions } from '@tanstack/react-query'
import type { UserRow } from '@shared/types.ts'
import { api } from './api.ts'

/** Every account: the Users page, and the people a notice can be sent to. */
export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: () => api.get<UserRow[]>('/users'),
})
