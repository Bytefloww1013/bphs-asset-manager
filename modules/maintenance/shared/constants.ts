/** A maintenance request is Not Started until someone is dispatched to it. */
export const MAINTENANCE_STATUSES = ['not_started', 'dispatched', 'on_hold', 'rejected', 'finished'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]
/** The statuses on the Open tab: everything still to be done. */
export const MAINTENANCE_OPEN: readonly MaintenanceStatus[] = ['not_started', 'dispatched', 'on_hold']
const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  not_started: 'Not Started',
  dispatched: 'Dispatched',
  on_hold: 'On Hold',
  rejected: 'Rejected',
  finished: 'Finished',
}
export const maintenanceStatusLabel = (status: MaintenanceStatus) => MAINTENANCE_STATUS_LABELS[status]
/** A maintenance request's ID, from its row id, as in MR-0042. */
export const maintenanceCode = (id: number) => `MR-${String(id).padStart(4, '0')}`
/** The longest note on a request's timeline. */
export const MAINTENANCE_NOTE_MAX = 5000
/** The longest description a request keeps: far more than the form produces. */
export const MAINTENANCE_DESCRIPTION_MAX = 50_000
