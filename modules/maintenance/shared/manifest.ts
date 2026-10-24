import { SHARED_LEVELS } from '#shared/levels.ts'
import { defineSharedManifest } from '#shared/modules.ts'

/** Maintenance requests: from the Zoho form's webhook or entered by hand, dispatched to an employee and worked to the end. */
export default defineSharedManifest({
  id: 'maintenance',
  tier: 'feature',
  label: 'Maintenance',
  dependsOn: ['employees', 'audit', 'notifications'],
  confidential: false,
  resources: [
    {
      key: 'maintenance',
      label: 'Maintenance',
      levels: SHARED_LEVELS,
      help: {
        none: 'The Maintenance workspace is hidden.',
        read: 'See every request and its timeline.',
        edit: 'Also enter requests, dispatch them, change their status and add notes.',
        full: 'Also delete a request.',
      },
      workspace: true,
      order: 30,
    },
  ],
  notificationKinds: {
    maintenance_dispatched: 'Maintenance dispatched',
    maintenance_changed: 'Maintenance update',
  },
  // Both tell the employee a request is dispatched to, through the account linked to them.
  employeeNotificationKinds: ['maintenance_dispatched', 'maintenance_changed'],
  auditEntityTypes: ['maintenance_request'],
  routePrefix: '/maintenance',
})
