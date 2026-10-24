import { ClipboardCheck, ListChecks, ScrollText, Users } from 'lucide-react'
import { defineWebModule } from '@/modules.ts'
import { canAt, type Grantee } from '@shared/permissions.ts'
import manifest from '../shared/manifest.ts'

// The employee list stays readable to every picker; the page itself needs Employees.
const employees = (user: Grantee) => canAt(user, 'employees', 'read')

/** The Administrative Reviews workspace, confidential: no counts, no notifications. Its pages are in `routes/`. */
export default defineWebModule({
  manifest,
  workspaces: [
    {
      id: 'reviews',
      label: 'Reviews',
      icon: ClipboardCheck,
      home: '/reviews',
      order: 40,
      confidential: true,
      groups: [{ id: 'cases' }, { id: 'admin', heading: 'Administration' }],
    },
  ],
  nav: [
    { workspace: 'reviews', to: '/reviews', label: 'Reviews', icon: ClipboardCheck },
    { workspace: 'reviews', to: '/reviews/actions', label: 'Action items', icon: ListChecks },
    { workspace: 'reviews', to: '/reviews/employees', label: 'Employees', icon: Users, visible: employees },
    { workspace: 'reviews', group: 'admin', to: '/reviews/audit', label: 'Audit log', icon: ScrollText },
  ],
})
