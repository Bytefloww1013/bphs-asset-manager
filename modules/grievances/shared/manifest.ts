import { SHARED_LEVELS } from '#shared/levels.ts'
import { defineSharedManifest } from '#shared/modules.ts'

/**
 * Grievances: each case with its timeline, files and earlier versions, the categories they are filed under, and a Grievance
 * Audit Log of its own. Confidential, so it never notifies, shows no counts and writes nothing to the Audit Log.
 */
export default defineSharedManifest({
  id: 'grievances',
  tier: 'feature',
  label: 'Grievances',
  dependsOn: ['employees', 'audit'],
  confidential: true,
  resources: [
    {
      key: 'grievances',
      label: 'Grievances',
      levels: SHARED_LEVELS,
      help: {
        none: 'The Grievances workspace is hidden.',
        read: "See every grievance, with its timeline, files and earlier versions, and the Grievance Audit Log. Print the case file and download files. The account linked to a grievance's owner can also edit that grievance, change its status and give it to another owner.",
        edit: 'Also create grievances; add actions, events, corrections and files; edit any grievance and change its status or owner; and add or rename categories.',
        full: 'Also void a grievance, withdraw a file and delete a category.',
      },
      workspace: true,
      order: 20,
    },
  ],
  routePrefix: '/grievances',
})
