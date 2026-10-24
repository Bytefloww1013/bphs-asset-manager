import { AppWindow } from 'lucide-react'
import { defineWebModule } from '@/modules.ts'
import manifest from '../shared/manifest.ts'
import { digitalAssetsExport } from './exports.ts'
import { digitalAssetTypesEditor } from './lists.tsx'
import { HeldSeats } from './slots.tsx'

/** The Digital Assets page, in the Assets workspace's records after Physical Assets. Its page is `routes/route.tsx`. */
export default defineWebModule({
  manifest,
  nav: [{ workspace: 'assets', group: 'records', to: '/digital-assets', label: 'Digital Assets', icon: AppWindow }],
  slots: { 'employee.holdings': [{ id: 'digital-assets.held', component: HeldSeats }] },
  exports: [digitalAssetsExport],
  lists: [digitalAssetTypesEditor],
})
