import { defineSharedManifest } from '#shared/modules.ts'

/**
 * The custody ledger: who holds which item, since when, and who held it before. Each module whose items are issued registers a
 * kind (`custody.kinds`), and its own pages and words go with it. It has no resource, pages or audit types of its own: an issue
 * or a return is audited by the module whose item it is.
 */
export default defineSharedManifest({
  id: 'assignments',
  tier: 'foundation',
  label: 'Assignments',
  dependsOn: ['employees', 'programs'],
  confidential: false,
})
