import { House, LayoutGrid, UserRound, type LucideIcon } from 'lucide-react'
import { workspacesOf, type Grantee } from '@shared/permissions.ts'
import { HOME_GROUPS, type NavGroupEntry, type NavPage, type RoutePath } from '@/modules.ts'
import { navPages, workspaces } from '@/registry.ts'
import { once } from './once.ts'
import { WORKSPACE_LABEL, type Area, type Workspace } from './workspace.ts'

// The one nav model: the rail, the pages panel, the phone drawer and the quick switcher all read it, so they never disagree.
// Each module declares its workspaces and pages (`web/module.ts`); Home and its own pages are the kernel's.

/** A page the sidebar links to. A pin can only ever be one of `navPaths()`. */
export type NavPath = RoutePath

/** Home's own pages; modules add the rest of Home's through the registry. */
const HOME_PAGES: readonly NavPage[] = [
  { workspace: 'me', group: 'start', order: 10, label: 'My Dashboard', icon: LayoutGrid, soon: 'Coming later' },
  { workspace: 'me', group: 'mine', order: 20, to: '/me/profile', label: 'Profile', icon: UserRound },
]

const pages = once(() => [...HOME_PAGES, ...navPages()])

/** Every page the sidebar links to, whoever is signed in. */
export const navPaths = once((): readonly NavPath[] => pages().flatMap((page) => (page.to ? [page.to] : [])))

export const isNavPath = (value: unknown): value is NavPath => navPaths().includes(value as NavPath)

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
  groups: readonly NavGroupEntry[]
}

/** The areas in rail order. Home belongs to the person signed in and needs no access grant. */
export const areas = once((): readonly NavArea[] => [
  { id: 'me', name: 'Home', label: 'Home', icon: House, home: '/me/inbox', confidential: false, groups: HOME_GROUPS },
  ...workspaces().map(({ id, label, icon, home, confidential, groups = [{ id: '' }] }) => ({
    id: id as Workspace,
    name: WORKSPACE_LABEL[id as Workspace],
    label,
    icon,
    home,
    confidential,
    groups,
  })),
])

export const areaById = (id: Area): NavArea => areas().find((area) => area.id === id) ?? areas()[0]!

/** Home, then each workspace the account can read, in rail order. */
export function areasFor(user: Grantee): NavArea[] {
  const usable: readonly Area[] = workspacesOf(user)
  return areas().filter((area) => area.id === 'me' || usable.includes(area.id))
}

export interface NavEntry {
  /** Left out only for an entry that cannot be opened yet. */
  to?: NavPath
  label: string
  icon: LucideIcon
  /** Why the page would turn the account away. Shown, greyed out, with a lock and this under its name, but is not a link. */
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

/** Each area's pages by group id, in order. A page that names no group is in its area's first. */
const byGroup = once(() => {
  const sorted = [...pages()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const groups = new Map<string, NavPage[]>()
  for (const page of sorted) {
    const key = `${page.workspace} ${page.group ?? areaById(page.workspace as Area).groups[0]?.id}`
    groups.set(key, [...(groups.get(key) ?? []), page])
  }
  return groups
})

/** The panel's page groups for an area. Nothing from one area appears in another, and a group with no page shown is left out. */
export function navFor(area: Area, user: Grantee, unread?: number): NavGroup[] {
  const { groups, confidential } = areaById(area)
  return groups.flatMap(({ id, heading }) => {
    const items = (byGroup().get(`${area} ${id}`) ?? [])
      .filter((page) => page.visible?.(user) ?? true)
      .map((page): NavEntry => ({
        to: page.to,
        label: page.label,
        icon: page.icon,
        lock: page.lock?.(user),
        soon: page.soon,
        count: page.badge === 'unread' && !confidential ? unread : undefined,
      }))
    return items.length ? [{ heading, items }] : []
  })
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
