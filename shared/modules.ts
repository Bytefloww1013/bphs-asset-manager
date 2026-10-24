// The module contract, shared side (issue #23): what a module says about itself in `<tier>/<name>/shared/manifest.ts`.
// Plain data, so the server, the website and `scripts/gen-modules.ts` (plain Node) can all read it. The generated registry
// (`shared/modules.gen.ts`, read through `shared/registry.ts`) lists every module's manifest; this file never imports it.
// A manifest imports only this file and `shared/levels.ts`: shared/constants.ts and shared/permissions.ts read the registry as
// they load, so a manifest that imports either is an ESM cycle, and fails to load.
import type { AccessLevel } from './levels.ts'
import type { Grantee } from './permissions.ts'

/** Foundation modules never depend on a feature module; feature modules are listed in `app.modules.ts`, which sets their order. */
export type ModuleTier = 'foundation' | 'feature'

/** Something an account is given a level in on the Users page. The first resources are today's sections, so `users.access` is unchanged. */
export interface PermissionResource {
  /** The key in `users.access`. */
  key: string
  label: string
  /** The levels the access form offers, `none` first. */
  levels: readonly AccessLevel[]
  /** What each of those levels allows here, one line each, as the Users page's "i" button and the Profile page say it. */
  help: Readonly<Partial<Record<AccessLevel, string>>>
  /** A line under its name on the Users page's access form. */
  hint?: string
  /** A workspace has its own place on the rail and its own pages; any other resource (Employees) is only a level. */
  workspace: boolean
  /** Its place on the access form, among the workspaces or among the rest: lower first. Ties keep registry order. */
  order?: number
  /** Whether the account can hold this resource at all, whatever it was given (Reviews, R9: not an account that is nobody). */
  available?: (user: Grantee) => boolean
  /** A workspace whose records belong to accounts, not employees (Employee Tasks): nothing about an employee is kept there. */
  aboutAccounts?: boolean
}

export interface SharedManifest {
  /** The folder name: `foundation/<id>` or `modules/<id>`. */
  id: string
  tier: ModuleTier
  label: string
  /** The modules this one uses. The generator puts them first, and refuses unknown, disabled or cyclic ones. */
  dependsOn: readonly string[]
  /** Grievances and Reviews: never notifies and never shows a count. The generator refuses its notification kinds; lint rule (e) its notifications imports. */
  confidential: boolean
  resources?: readonly PermissionResource[]
  /** The notification kinds this module sends, with their labels. */
  notificationKinds?: Readonly<Record<string, string>>
  /** Those of its kinds that tell an account about the employee linked to it (an asset issued to them). They go when the link changes. */
  employeeNotificationKinds?: readonly string[]
  /** The entity types this module writes to the central audit log. */
  auditEntityTypes?: readonly string[]
  /** Where this module's `web/routes/` folder mounts (`''` is the root). It lives here, not in the web module, because `vite.config.ts` can't import website code. */
  routePrefix?: string
}

/** Write `confidential: true` as a literal: lint rule (e) finds confidential modules by reading the file. */
export const defineSharedManifest = <const M extends SharedManifest>(manifest: M): M => manifest
