import {
  ArrowDownUp,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Laptop,
  ListChecks,
  Package,
  PackageCheck,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { defineWebModule } from '@/modules.ts'
import { canAt, canUseWorkspace, type Grantee } from '@shared/permissions.ts'
import manifest from '../shared/manifest.ts'
import { assetsExport, assignmentsExport } from './exports.ts'
import { IssueSheet } from './issue-sheet.tsx'
import { assetBrandsEditor, assetTypesEditor, conditionRatingsEditor } from './lists.tsx'
import { lookupsQuery } from './queries.ts'
import { ReturnSheet } from './return-sheet.tsx'
import { AssignToProgram, HeldAssets, IssueToEmployee } from './slots.tsx'

// The employee list stays readable to every picker; the page itself needs Employees.
const employees = (user: Grantee) => canAt(user, 'employees', 'read')
// The Issue and Return sheets change Assets; an account that cannot is never shown them.
const issues = (user: Grantee) => canAt(user, 'assets', 'edit')

/**
 * The Assets workspace: first on the rail, with the Overview at `/`. Its pages are in `routes/`. Digital Assets is its
 * own module's page. The panel also lists the pages every workspace shares, which have no workspace of their own: the
 * employees and programs (foundation modules), the Audit log, and the kernel's Lists, Import/Export and Users.
 */
export default defineWebModule({
  manifest,
  workspaces: [
    {
      id: 'assets',
      label: 'Assets',
      icon: Package,
      home: '/',
      order: 10,
      groups: [
        { id: 'work', heading: 'Work' },
        { id: 'records', heading: 'Records' },
        { id: 'admin', heading: 'Administration' },
      ],
    },
  ],
  nav: [
    { workspace: 'assets', group: 'work', to: '/', label: 'Overview', icon: LayoutDashboard },
    { workspace: 'assets', group: 'work', to: '/assignments', label: 'Assignments', icon: ClipboardList },
    { workspace: 'assets', group: 'work', to: '/available', label: 'Available', icon: PackageCheck },
    { workspace: 'assets', group: 'records', to: '/assets', label: 'Physical Assets', icon: Laptop },
    // After Digital Assets, which its own module adds.
    {
      workspace: 'assets',
      group: 'records',
      order: 10,
      to: '/employees',
      label: 'Employees',
      icon: Users,
      visible: employees,
    },
    { workspace: 'assets', group: 'records', order: 10, to: '/programs', label: 'Programs', icon: Building2 },
    { workspace: 'assets', group: 'admin', to: '/lists', label: 'Lists', icon: ListChecks },
    { workspace: 'assets', group: 'admin', to: '/import-export', label: 'Import/Export', icon: ArrowDownUp },
    { workspace: 'assets', group: 'admin', to: '/audit', label: 'Audit log', icon: ScrollText },
    {
      workspace: 'assets',
      group: 'admin',
      to: '/users',
      label: 'Users',
      icon: ShieldCheck,
      visible: (user) => user.superAdmin,
    },
  ],
  slots: {
    'employee.actions': [{ id: 'assets.issue', component: IssueToEmployee }],
    'employee.holdings': [{ id: 'assets.held', component: HeldAssets }],
    'program.actions': [{ id: 'assets.assign', component: AssignToProgram }],
    'app.overlays': [
      { id: 'assets.issue-sheet', component: IssueSheet, visible: issues },
      { id: 'assets.return-sheet', component: ReturnSheet, visible: issues },
    ],
  },
  // The sheets' pickers, fetched once, up front, for an account that can open Assets.
  preload: (queryClient, user) =>
    canUseWorkspace(user, 'assets') ? queryClient.ensureQueryData(lookupsQuery) : undefined,
  exports: [assetsExport, assignmentsExport],
  lists: [assetTypesEditor, assetBrandsEditor, conditionRatingsEditor],
})
