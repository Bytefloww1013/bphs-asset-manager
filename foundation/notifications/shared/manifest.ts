import { defineSharedManifest } from '#shared/modules.ts'

/**
 * The Inbox, the bell and the Notices page, and `notify()`, the one writer of notifications. Its kinds are the notices it sends
 * itself and the kernel's account changes: the kernel has no manifest of its own.
 */
export default defineSharedManifest({
  id: 'notifications',
  tier: 'foundation',
  label: 'Notifications',
  dependsOn: [],
  confidential: false,
  notificationKinds: {
    account_password_reset: 'Password reset',
    account_access_changed: 'Access change',
    account_unlocked: 'Account unlocked',
    account_employee_linked: 'Linked employee change',
    notice: 'Notice',
  },
  auditEntityTypes: ['notice'],
  routePrefix: '/me',
})
