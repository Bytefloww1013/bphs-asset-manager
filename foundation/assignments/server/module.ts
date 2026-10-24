import { defineServerModule } from '#kernel/modules.ts'
import manifest from '../shared/manifest.ts'
import { custodyEmployeeReferences, custodyProgramReferences } from './references.ts'
import * as schema from './schema.ts'

/** The custody ledger. No routes of its own: each kind's module issues and returns its items through `custody.ts`. */
export default defineServerModule({
  manifest,
  schema,
  hooks: {
    'employee.references': [custodyEmployeeReferences],
    'program.references': [custodyProgramReferences],
  },
})
