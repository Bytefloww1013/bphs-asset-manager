import { defineWebModule } from '@/modules.ts'
import { employeeImporter } from '../shared/index.ts'
import manifest from '../shared/manifest.ts'
import { employeesExport } from './exports.ts'

/** The Employees export and importer. Its pages are in `routes/`; each workspace's module lists it in its own nav. */
export default defineWebModule({
  manifest,
  exports: [employeesExport],
  importers: [employeeImporter],
})
