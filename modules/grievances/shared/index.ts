// The grievances module's public API, shared side: what other modules and the kernel may import from it.
export { GRIEVANCE_STATUSES, grievanceCode, grievanceStatusLabel } from './constants.ts'
export type { GrievanceStatus } from './constants.ts'
export { canManageGrievance } from './permissions.ts'
export type { GrievanceDetail, GrievanceRow } from './types.ts'
