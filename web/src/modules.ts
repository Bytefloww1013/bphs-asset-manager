// The module contract, website side (issue #23): what `<tier>/<name>/web/module.ts` gives the website.
// The website reads it through `web/src/registry.ts`. This file never imports the registry, so a module can import it without a cycle.
// Pages are not listed here: each module's `web/routes/` folder is mounted by the router (`routePrefix` in the shared manifest).
// Data: a module's `web/queries.ts` holds its `queryOptions`, keyed under its own resource or id (never `me`, which
// `refreshData` leaves alone), and its `web/api.ts` its writes, each a function over `api` (`@/lib/api.ts`) that a page runs
// through `useWrite` (`@/lib/hooks.ts`), which refreshes every query after it. Session: `@/lib/session.ts`.
import type { EmployeeRow } from '#foundation/employees/shared/index.ts'
import type { ProgramRow } from '#foundation/programs/shared/index.ts'
import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Importer } from '@shared/importers.ts'
import type { SharedManifest } from '@shared/modules.ts'
import type { Grantee } from '@shared/permissions.ts'
import type { Dataset } from './lib/exports.ts'
import type { FileRouteTypes } from './routeTree.gen.ts'

/** A page address that needs no parameters: what the rail and the panel can link to. Checked against the route tree. */
export type RoutePath = Exclude<FileRouteTypes['to'], `${string}$${string}`>

/** A group of pages in a panel. */
export interface NavGroupEntry {
  /** What a nav page names to sit in it. */
  id: string
  /** Left out for a group drawn under a divider, or first, with no heading. */
  heading?: string
}

/**
 * A workspace: a place on the rail with its own pages. Its id is a permission resource of the same module, marked as a
 * workspace, and that resource's label is its full name.
 */
export interface WorkspaceEntry {
  id: string
  /** The short label under the rail icon. */
  label: string
  icon: LucideIcon
  /** The page the rail link opens. The pages at and under it are in this workspace; the one at `/` holds the rest. */
  home: RoutePath
  /** Its place on the rail: lower first, after Home. Ties keep registry order. */
  order?: number
  /** No count or badge ever shows for it. A confidential module's workspaces always are; this marks one in a module that isn't. */
  confidential?: boolean
  /** The panel's groups, in order. Left out: one group, with no heading. */
  groups?: readonly NavGroupEntry[]
}

/** Home (`me`): every account's own area, which needs no access grant. A module puts pages in it by naming one of these groups. */
export const HOME_GROUPS = [{ id: 'start' }, { id: 'mine' }] as const satisfies readonly NavGroupEntry[]

/** A page in a panel: a workspace's, or Home's. */
export interface NavPage {
  /** A workspace id, or `me` for Home. */
  workspace: string
  /** One of that workspace's groups; left out, its first. */
  group?: string
  /** Its place in the group: lower first. Ties keep registry order. */
  order?: number
  /** Left out only for a page that can't be opened yet, with `soon` saying why. */
  to?: RoutePath
  label: string
  icon: LucideIcon
  soon?: string
  /** Left out: listed for everyone who can open the workspace. A page the account may not open is left out, never shown locked (issue #27). */
  visible?: (user: Grantee) => boolean
  /** The Inbox's unread count. Never on a confidential workspace's page. */
  badge?: 'unread'
}

/** What each slot passes to the components drawn in it. */
export interface SlotProps {
  'employee.detail': { employeeId: number }
  /** Buttons beside an employee's More actions menu on the Employees page. */
  'employee.actions': { employee: EmployeeRow }
  /** Sections of an employee's "What they hold" sheet. */
  'employee.holdings': { employee: EmployeeRow }
  /** Buttons beside a program's More actions menu on the Programs page. */
  'program.actions': { program: ProgramRow }
  'home.widgets': Record<string, never>
  /** Drawn once beside every page of the app: the sheets a module opens from the address (`SheetSearch` in `routes/_app.tsx`). */
  'app.overlays': Record<string, never>
}

export type SlotName = keyof SlotProps

export interface SlotEntry<P> {
  id: string
  component: ComponentType<P>
  /** Left out: drawn for everyone who can see the slot. */
  visible?(user: Grantee): boolean
}

/** An export on the Import/Export page: a `Dataset` (`@/lib/exports.ts`), whatever its rows are. */
export type ExportEntry = Pick<Dataset<unknown>, 'label' | 'description' | 'filename' | 'order' | 'fetchAndSave'>

/** A lookup list's editor on the Lookup lists page: a panel that reads and changes its own list. */
export interface ListEditor {
  key: string
  component: ComponentType
  /** Left out: the page's main column. `side`: the narrower one beside it. */
  column?: 'side'
  /** Fetches what the editor shows before the page opens (the route loader). */
  load?(queryClient: QueryClient): Promise<unknown>
}

export interface WebModule {
  manifest: SharedManifest
  workspaces?: readonly WorkspaceEntry[]
  nav?: readonly NavPage[]
  slots?: { readonly [K in SlotName]?: readonly SlotEntry<SlotProps[K]>[] }
  /** The Import/Export page's Export tab (by each one's `order`). */
  exports?: readonly ExportEntry[]
  /** The Import page's record types, in order; the first is the one it opens on. The server registers each one's store too. */
  importers?: readonly Importer[]
  lists?: readonly ListEditor[]
  /** Fetches what its overlays need before the app opens, for this account (the `_app` loader); undefined when none. */
  preload?(queryClient: QueryClient, user: Grantee): Promise<unknown> | undefined
}

/** An entry may read the kernel and the modules its module depends on as it loads: the registry never imports the modules (`main.tsx` installs them). */
export const defineWebModule = <const M extends WebModule>(module: M): M => module
