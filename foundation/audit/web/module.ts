import { defineWebModule } from '@/modules.ts'
import manifest from '../shared/manifest.ts'

/**
 * The Audit Log page, in `routes/`. Its nav entry is the assets module's, under Assets; the log
 * component (`audit-log.tsx`) also draws the Grievance and Review Audit Logs.
 */
export default defineWebModule({ manifest })
