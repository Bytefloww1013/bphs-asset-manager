import { SHARED_LEVELS } from '#shared/levels.ts'
import { defineSharedManifest } from '#shared/modules.ts'

/** Physical assets: their types, brands and condition ratings, issuing and returning them, and the Overview. */
export default defineSharedManifest({
  id: 'assets',
  tier: 'feature',
  label: 'Assets',
  dependsOn: ['employees', 'programs', 'assignments', 'audit', 'notifications'],
  confidential: false,
  resources: [
    {
      key: 'assets',
      label: 'Assets',
      levels: SHARED_LEVELS,
      help: {
        none: 'The Assets workspace is hidden.',
        read: 'See assets, digital assets, assignments, programs, lists, the Overview and the Audit Log, and export them.',
        edit: 'Also add and change all of these, issue and return assets, and import.',
        full: 'Also delete assets, digital assets, programs and list values.',
      },
      workspace: true,
      order: 10,
    },
  ],
  notificationKinds: {
    asset_issued: 'Asset issued',
    asset_returned_poor: 'Poor-condition return',
    asset_overdue: 'Overdue asset',
  },
  // Both tell the employee who holds the asset, through the account linked to them.
  employeeNotificationKinds: ['asset_issued', 'asset_overdue'],
  auditEntityTypes: ['asset', 'assettype', 'assetbrand', 'conditionrating', 'assignment'],
  routePrefix: '',
})
