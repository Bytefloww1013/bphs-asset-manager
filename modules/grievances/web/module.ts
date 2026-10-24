import { Scale, ScrollText, Tags, Users } from 'lucide-react'
import { canAt, type Grantee } from '@shared/permissions.ts'
import { defineWebModule } from '@/modules.ts'
import manifest from '../shared/manifest.ts'

// The employee list stays readable to every picker; the page itself needs Employees.
const employees = (user: Grantee) => canAt(user, 'employees', 'read')

/** The Grievances workspace, last on the rail and confidential: no counts, no notifications. Its pages are in `routes/`. */
export default defineWebModule({
  manifest,
  workspaces: [
    {
      id: 'grievances',
      label: 'Grievances',
      icon: Scale,
      home: '/grievances',
      order: 50,
      confidential: true,
      groups: [{ id: 'cases' }, { id: 'admin', heading: 'Administration' }],
    },
  ],
  nav: [
    { workspace: 'grievances', to: '/grievances', label: 'Grievances', icon: Scale },
    { workspace: 'grievances', to: '/grievances/employees', label: 'Employees', icon: Users, visible: employees },
    { workspace: 'grievances', group: 'admin', to: '/grievances/categories', label: 'Categories', icon: Tags },
    { workspace: 'grievances', group: 'admin', to: '/grievances/audit', label: 'Audit log', icon: ScrollText },
  ],
})
