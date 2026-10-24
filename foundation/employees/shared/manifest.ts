import { SHARED_LEVELS } from '#shared/levels.ts'
import { defineSharedManifest } from '#shared/modules.ts'

/** The people every workspace names: the Employees page, its importer and export, and the reference checks other modules answer. */
export default defineSharedManifest({
  id: 'employees',
  tier: 'foundation',
  label: 'Employees',
  dependsOn: [],
  confidential: false,
  resources: [
    {
      key: 'employees',
      label: 'Employees',
      levels: SHARED_LEVELS,
      help: {
        none: 'The Employees page is hidden. Employees can still be chosen in any form.',
        read: 'See the Employees page.',
        edit: 'Also add and change employees.',
        full: 'Also archive, restore and delete them.',
      },
      hint: 'None hides the Employees page. Every account can still choose employees in a form.',
      workspace: false,
    },
  ],
  auditEntityTypes: ['employee'],
  routePrefix: '/employees',
})
