// The audit module's queries, and the paging and day range every audit log shares: the Grievance and Review Audit Logs use them too.
import { queryOptions } from '@tanstack/react-query'
import { api, qs } from '@/lib/api.ts'
import { startOfLocalDay } from '@/lib/format.ts'
import type { AuditPage } from '../shared/index.ts'

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
export const logQuery = <T>(log: string, params: AuditParams) =>
  queryOptions({
    queryKey: [log, params],
    queryFn: () => api.get<T>(`/${log}${qs({ ...params, ...auditRange(params) })}`),
    placeholderData: (previous) => previous,
  })
export const logCsvUrl = (log: string, params: Omit<AuditParams, 'limit' | 'offset'>) =>
  `/api/${log}.csv${qs({ ...params, ...auditRange(params) })}`

export const auditQuery = (params: AuditParams) => logQuery<AuditPage>('audit', params)
export const auditCsvUrl = (params: Omit<AuditParams, 'limit' | 'offset'>) => logCsvUrl('audit', params)
