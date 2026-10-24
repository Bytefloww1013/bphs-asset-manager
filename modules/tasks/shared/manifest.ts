import { ACCESS_LEVELS } from '#shared/levels.ts'
import { defineSharedManifest } from '#shared/modules.ts'

/**
 * Employee Tasks: a task sent to one account, worked to the end in Home's My tasks, with its history and files. The only
 * resource that offers Assign. Its pages are at `/tasks` and `/me/tasks`, so its `web/routes/` mounts at the root.
 */
export default defineSharedManifest({
  id: 'tasks',
  tier: 'feature',
  label: 'Employee Tasks',
  dependsOn: ['notifications'],
  confidential: false,
  resources: [
    {
      key: 'tasks',
      label: 'Employee Tasks',
      levels: ACCESS_LEVELS,
      help: {
        none: 'The Employee Tasks workspace is hidden. Tasks sent to this account are still in Home.',
        read: "See every account's tasks, with their history.",
        assign: 'Also assign tasks, and edit or cancel the tasks this account assigned.',
        edit: "Also edit or cancel anyone's task, except one a Super Admin assigned, and approve or send back completed tasks.",
        full: 'Also delete tasks, and edit or cancel tasks a Super Admin assigned.',
      },
      workspace: true,
      order: 50,
      aboutAccounts: true,
    },
  ],
  notificationKinds: {
    task_assigned: 'Task assigned',
    task_updated: 'Task updated',
    task_completed: 'Task completed',
    task_approval_requested: 'Task awaiting approval',
    task_approved: 'Task approved',
    task_sent_back: 'Task sent back',
    task_past_due: 'Task past due',
    task_cancelled: 'Task cancelled',
  },
  routePrefix: '',
})
