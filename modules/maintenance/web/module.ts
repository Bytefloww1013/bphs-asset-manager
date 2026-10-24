import { ClipboardList, Wrench } from 'lucide-react'
import { defineWebModule } from '@/modules.ts'
import manifest from '../shared/manifest.ts'

/** The Maintenance workspace: second on the rail, with one page, Requests. Its pages are in `routes/`. */
export default defineWebModule({
  manifest,
  workspaces: [{ id: 'maintenance', label: 'Maintenance', icon: Wrench, home: '/maintenance', order: 20 }],
  nav: [{ workspace: 'maintenance', to: '/maintenance', label: 'Requests', icon: ClipboardList }],
})
