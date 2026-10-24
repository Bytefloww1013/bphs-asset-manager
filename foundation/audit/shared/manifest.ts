import { defineSharedManifest } from '#shared/modules.ts'

/**
 * The central audit log, `writeAudit()`, its one writer, and the Audit log page. Its entity type is the kernel's accounts: the
 * kernel has no manifest of its own. The Grievance and Review Audit Logs are their modules' own, and nothing of theirs is written here.
 */
export default defineSharedManifest({
  id: 'audit',
  tier: 'foundation',
  label: 'Audit log',
  dependsOn: [],
  confidential: false,
  auditEntityTypes: ['user'],
  routePrefix: '/audit',
})
