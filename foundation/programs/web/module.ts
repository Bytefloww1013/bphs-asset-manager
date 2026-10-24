import { defineWebModule } from '@/modules.ts'
import { programImporter } from '../shared/index.ts'
import manifest from '../shared/manifest.ts'
import { programsExport } from './exports.ts'

/** The Programs export and importer. Its page is `routes/route.tsx`; its nav entry is the assets module's. */
export default defineWebModule({
  manifest,
  exports: [programsExport],
  importers: [programImporter],
})
