import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { digitalAssetTypeList, digitalLookups } from './lists.ts'
import { digitalAssetRoutes } from './routes.ts'
import * as schema from './schema.ts'
import { digitalAssetCustody } from './service.ts'

/** The digital assets: their API, their type list, the pickers they add to `/api/lookups`, and their custody kind. */
export default defineServerModule({
  manifest,
  schema,
  routes: [{ base: '/digital-assets', create: digitalAssetRoutes }],
  seed: async (db, kit) => {
    const { seedDigitalAssets } = await import('./seed.ts')
    return `${db.transaction((tx) => seedDigitalAssets(tx, kit))} digital assets`
  },
  hooks: {
    // After the physical assets' own, from the assets module.
    'custody.kinds': [digitalAssetCustody],
    // After asset types and brands on the Lookup lists page.
    lists: [digitalAssetTypeList],
    lookups: [digitalLookups],
  },
})
