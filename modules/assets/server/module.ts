import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { assetCustody, sendOverdueReminders } from './assignments.ts'
import { assetBrandList, assetTypeList, conditionRatingList, ensureDefaultLists } from './lists.ts'
import { assetRoutes, assignmentRoutes, reportRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { conditionEmployeeReferences } from './service.ts'

const SIX_HOURS = 6 * 60 * 60 * 1000

/** The physical assets: their API, the overdue reminders, their lookup lists and what they have to do with employees. */
export default defineServerModule({
  manifest,
  schema,
  routes: [
    // `/lookups` (the forms' pickers) and `/dashboard` (the Overview).
    { base: '', create: reportRoutes },
    { base: '/assets', create: assetRoutes },
    { base: '/assignments', create: assignmentRoutes },
  ],
  jobs: [{ name: 'notifications.overdue-reminders', every: SIX_HOURS, atStart: true, run: sendOverdueReminders }],
  startup: ensureDefaultLists,
  // The fleet and the programs; the seed's code loads only for `bun run db:seed`.
  seed: async (db, kit) => `${(await import('./seed.ts')).seedAssets(db, kit)} physical assets`,
  hooks: {
    'employee.references': [conditionEmployeeReferences],
    // Physical first: an employee holding both is told about the assets first, as today.
    'custody.kinds': [assetCustody],
    // Condition ratings are the Lookup lists page's side column, so the lists keep their places there.
    lists: [assetTypeList, assetBrandList, conditionRatingList],
  },
})
