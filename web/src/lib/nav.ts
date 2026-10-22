import {
  AppWindow,
  ArrowDownUp,
  Building2,
  ClipboardCheck,
  ClipboardList,
  House,
  Inbox,
  Laptop,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  ListPlus,
  ListTodo,
  Megaphone,
  Package,
  PackageCheck,
  Scale,
  ScrollText,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { canAssignTasks, canAt, canSendNotices, workspacesOf, type Grantee } from '@shared/permissions.ts'
import { WORKSPACE_HOME, WORKSPACE_LABEL, type Area } from './workspace.ts'

// The one nav model: the rail, the pages panel, the phone drawer and the quick switcher all read it, so they never disagree.

/** Every page the sidebar links to. A pin can only ever be one of these. */
export const NAV_PATHS = [
  '/me/inbox',
  '/me/tasks',
  '/me/profile',
  '/me/notices',
  '/',
  '/assignments',
  '/available',
  '/assets',
  '/digital-assets',
  '/employees',
  '/programs',
  '/lists',
  '/import-export',
  '/audit',
  '/users',
  '/grievances',
  '/grievances/employees',
  '/grievances/categories',
  '/grievances/audit',
  '/maintenance',
  '/reviews',
  '/reviews/actions',
  '/reviews/employees',
  '/reviews/audit',
  '/tasks',
  '/tasks/new',
] as const
export type NavPath = (typeof NAV_PATHS)[number]

export const isNavPath = (value: unknown): value is NavPath => NAV_PATHS.includes(value as NavPath)

export interface NavArea {
  id: Area
  /** The full name, which is also the rail link's accessible name. */
  name: string
  /** The short label shown under the rail icon. */
  label: string
  icon: LucideIcon
  /** The page the rail link opens. */
  home: NavPath
  /** Grievances and Administrative Reviews: no count or badge ever shows for them. */
  confidential: boolean
}

/** The areas in rail order. Home belongs to the person signed in and needs no access grant. */
export const AREAS: readonly NavArea[] = [
  { id: 'me', name: 'Home', label: 'Home', icon: House, home: '/me/inbox', confidential: false },
  {
    id: 'assets',
    name: WORKSPACE_LABEL.assets,
    label: 'Assets',
    icon: Package,
    home: WORKSPACE_HOME.assets,
    confidential: false,
  },
  {
    id: 'maintenance',
    name: WORKSPACE_LABEL.maintenance,
    label: 'Maintenance',
    icon: Wrench,
    home: WORKSPACE_HOME.maintenance,
    confidential: false,
  },
  {
    id: 'tasks',
    name: WORKSPACE_LABEL.tasks,
    label: 'Tasks',
    icon: ListTodo,
    home: WORKSPACE_HOME.tasks,
    confidential: false,
  },
  {
    id: 'reviews',
    name: WORKSPACE_LABEL.reviews,
    label: 'Reviews',
    icon: ClipboardCheck,
    home: WORKSPACE_HOME.reviews,
    confidential: true,
  },
  {
    id: 'grievances',
    name: WORKSPACE_LABEL.grievances,
    label: 'Grievances',
    icon: Scale,
    home: WORKSPACE_HOME.grievances,
    confidential: true,
  },
]

export const areaById = (id: Area): NavArea => AREAS.find((area) => area.id === id) ?? AREAS[0]!

/** Home, then each workspace the account can read, in rail order. */
export function areasFor(user: Grantee): NavArea[] {
  const usable: readonly Area[] = workspacesOf(user)
  return AREAS.filter((area) => area.id === 'me' || usable.includes(area.id))
}

export interface NavEntry {
  /** Left out only for an entry that cannot be opened yet. */
  to?: NavPath
  label: string
  icon: LucideIcon
  /** Why the page will turn the account away: the entry stays a link, with a lock and this as its screen-reader text. */
  lock?: string
  /** Why the entry cannot be opened yet. It is shown, greyed out, but is not a link. */
  soon?: string
  /** Unread notifications. Only Home's Inbox ever carries one. */
  count?: number
}

export interface NavGroup {
  /** Left out for a group drawn under a divider, or first, with no heading. */
  heading?: string
  items: NavEntry[]
}

/** The panel's page groups for an area. Nothing from one area appears in another. */
export function navFor(area: Area, user: Grantee, unread?: number): NavGroup[] {
  // The employee list stays readable to every picker; the page itself needs Employees.
  const employees = canAt(user, 'employees', 'read')
  const only = <T>(when: boolean, entry: T): T[] => (when ? [entry] : [])
  switch (area) {
    case 'me':
      return [
        {
          items: [
            { label: 'My Dashboard', icon: LayoutGrid, soon: 'Coming later' },
            { to: '/me/inbox', label: 'Inbox', icon: Inbox, count: unread },
          ],
        },
        {
          items: [
            { to: '/me/tasks', label: 'My tasks', icon: ListTodo },
            { to: '/me/profile', label: 'Profile', icon: UserRound },
            ...only(canSendNotices(user), { to: '/me/notices', label: 'Notices', icon: Megaphone } as const),
          ],
        },
      ]
    case 'maintenance':
      return [{ items: [{ to: '/maintenance', label: 'Requests', icon: ClipboardList }] }]
    case 'tasks':
      return [
        {
          items: [
            { to: '/tasks', label: 'All tasks', icon: ListTodo },
            {
              to: '/tasks/new',
              label: 'Assign task',
              icon: ListPlus,
              lock: canAssignTasks(user) ? undefined : 'Needs Assign access',
            },
          ],
        },
      ]
    case 'reviews':
      return [
        {
          items: [
            { to: '/reviews', label: 'Reviews', icon: ClipboardCheck },
            { to: '/reviews/actions', label: 'Action items', icon: ListChecks },
            ...only(employees, { to: '/reviews/employees', label: 'Employees', icon: Users } as const),
          ],
        },
        { heading: 'Administration', items: [{ to: '/reviews/audit', label: 'Audit log', icon: ScrollText }] },
      ]
    case 'grievances':
      return [
        {
          items: [
            { to: '/grievances', label: 'Grievances', icon: Scale },
            ...only(employees, { to: '/grievances/employees', label: 'Employees', icon: Users } as const),
          ],
        },
        {
          heading: 'Administration',
          items: [
            { to: '/grievances/categories', label: 'Categories', icon: Tags },
            { to: '/grievances/audit', label: 'Audit log', icon: ScrollText },
          ],
        },
      ]
    case 'assets':
      return [
        {
          heading: 'Work',
          items: [
            { to: '/', label: 'Overview', icon: LayoutDashboard },
            { to: '/assignments', label: 'Assignments', icon: ClipboardList },
            { to: '/available', label: 'Available', icon: PackageCheck },
          ],
        },
        {
          heading: 'Records',
          items: [
            { to: '/assets', label: 'Physical Assets', icon: Laptop },
            { to: '/digital-assets', label: 'Digital Assets', icon: AppWindow },
            ...only(employees, { to: '/employees', label: 'Employees', icon: Users } as const),
            { to: '/programs', label: 'Programs', icon: Building2 },
          ],
        },
        {
          heading: 'Administration',
          items: [
            { to: '/lists', label: 'Lists', icon: ListChecks },
            { to: '/import-export', label: 'Import/Export', icon: ArrowDownUp },
            { to: '/audit', label: 'Audit log', icon: ScrollText },
            { to: '/users', label: 'Users', icon: ShieldCheck, lock: user.superAdmin ? undefined : 'Super Admin only' },
          ],
        },
      ]
  }
}

/** The height of one rail item (icon over its label), which the rail draws and `fitRail` counts with. */
export const RAIL_ITEM_HEIGHT = 56

/**
 * Which areas fit in a rail list `height` pixels tall, by index, and which go under "More". Overflowing, the More button takes
 * a slot too, and the active area always stays in view, taking the place of the last one shown.
 */
export function fitRail(count: number, height: number, activeIndex: number): { shown: number[]; overflow: number[] } {
  const all = [...Array(count).keys()]
  if (count * RAIL_ITEM_HEIGHT <= height) return { shown: all, overflow: [] }
  const slots = Math.max(1, Math.floor(height / RAIL_ITEM_HEIGHT) - 1)
  const shown = all.slice(0, slots)
  if (activeIndex >= slots && activeIndex < count) shown[slots - 1] = activeIndex
  return { shown, overflow: all.filter((index) => !shown.includes(index)) }
}

export interface JumpEntry {
  area: Area
  /** The area's full name, shown beside the page. */
  areaName: string
  group?: string
  label: string
  to: NavPath
}

/**
 * Everything the quick switcher can jump to: the sidebar pages of each area the account can read. It never holds a record,
 * a count, or an entry the account cannot open (coming later, or locked).
 */
export function jumpIndex(user: Grantee): JumpEntry[] {
  return areasFor(user).flatMap((area) =>
    navFor(area.id, user).flatMap((group) =>
      group.items.flatMap((item) =>
        item.to && !item.soon && !item.lock
          ? [{ area: area.id, areaName: area.name, group: group.heading, label: item.label, to: item.to }]
          : [],
      ),
    ),
  )
}
