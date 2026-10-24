// The tasks module's public API, shared side: what other modules and the kernel may import from it.
export { TASK_OPEN, TASK_STATUSES, taskStatusLabel } from './constants.ts'
export type { TaskStatus } from './constants.ts'
export { canAssignTasks, canViewEmployeeTasks } from './permissions.ts'
export { taskStatus } from './tasks.ts'
export type { AccountRef, TaskDetail, TaskRow } from './types.ts'
