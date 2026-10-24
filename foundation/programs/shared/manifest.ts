import { defineSharedManifest } from '#shared/modules.ts'

/**
 * The programs assets are issued to: the Programs page, its importer and export, and the reference checks other modules
 * answer. It has no resource of its own: its pages and records go with Assets (`assets`), as they do today.
 */
export default defineSharedManifest({
  id: 'programs',
  tier: 'foundation',
  label: 'Programs',
  dependsOn: [],
  confidential: false,
  auditEntityTypes: ['program'],
  routePrefix: '/programs',
})
