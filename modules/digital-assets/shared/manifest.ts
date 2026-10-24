import { defineSharedManifest } from '#shared/modules.ts'

/** Digital assets: licence and account seats, each issued to one employee at a time. They use the `assets` resource. */
export default defineSharedManifest({
  id: 'digital-assets',
  tier: 'feature',
  label: 'Digital assets',
  dependsOn: ['employees', 'assignments', 'audit', 'notifications', 'assets'],
  confidential: false,
  notificationKinds: {
    digital_issued: 'Digital asset issued',
  },
  // It tells the employee a seat is issued to, through the account linked to them.
  employeeNotificationKinds: ['digital_issued'],
  auditEntityTypes: ['digitalasset', 'digitalassettype'],
  routePrefix: '/digital-assets',
})
