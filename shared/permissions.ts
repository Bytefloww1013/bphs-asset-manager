import {
  ACCESS_LEVEL_LABEL,
  ACCESS_LEVELS,
  SECTION_LABEL,
  SECTIONS,
  WORKSPACES,
  type Access,
  type AccessLevel,
  type Section,
  type Workspace,
} from './constants.ts'
import type { PermissionResource } from './modules.ts'
import { permissionResources } from './registry.ts'

/** What decides what an account may do: a level in each section, or Super Admin, which is Full in every section there is or will be. */
export interface Grantee {
  access: Access
  superAdmin: boolean
  /** Who the account is, which Reviews needs. Left out where only the saved levels are judged, as while access is being set. */
  employeeId?: number | null
  /** The account made on first run, the one account that need not be linked to an employee. */
  firstAccount?: boolean
}

const isSection = (key: string): key is Section => (SECTIONS as readonly string[]).includes(key)

/**
 * The grants in sections some module declares. A removed module's grants can stay in `users.access`; the API never shows
 * them, as the access schema would refuse them on the way back and the Users page could not save the account.
 */
export const declaredAccess = (access: Access): Access =>
  Object.fromEntries(Object.entries(access).filter(([key]) => isSection(key)))

/** `next`, keeping the grants `stored` has in sections no module declares, so a save changes only what the form shows. */
export const keepUndeclared = (stored: Access, next: Access): Access => ({
  ...Object.fromEntries(Object.entries(stored).filter(([key]) => !isSection(key))),
  ...next,
})

/** The resources some accounts can't hold, whatever they were given: Reviews, for an account that is nobody (R9). */
const AVAILABLE = new Map<string, NonNullable<PermissionResource['available']>>(
  permissionResources().flatMap((resource) => (resource.available ? [[resource.key, resource.available]] : [])),
)

export function levelOf(user: Grantee | undefined | null, section: Section): AccessLevel {
  if (!user) return 'none'
  if (AVAILABLE.get(section)?.(user) === false) return 'none'
  return user.superAdmin ? 'full' : (user.access[section] ?? 'none')
}

export function canAt(user: Grantee | undefined | null, section: Section, level: AccessLevel): boolean {
  return ACCESS_LEVELS.indexOf(levelOf(user, section)) >= ACCESS_LEVELS.indexOf(level)
}

/** The workspaces an account works in: those it can at least read. A person sees nothing of any other. */
export const workspacesOf = (user: Grantee): Workspace[] =>
  WORKSPACES.filter((workspace) => canAt(user, workspace, 'read'))

export const canUseWorkspace = (user: Grantee | undefined | null, workspace: Workspace) =>
  canAt(user, workspace, 'read')

/** What someone without enough access is told, on the page and by the server. */
export const needsAccess = (section: Section, level: AccessLevel) =>
  level === 'read'
    ? `Your account does not have access to ${SECTION_LABEL[section]}.`
    : `You need ${ACCESS_LEVEL_LABEL[level]} access to ${SECTION_LABEL[section]} for this.`

/** An account's access in words: "Super Admin", or "Assets: Edit · Employees: Read Only". */
export function describeAccess(user: Grantee): string {
  if (user.superAdmin) return 'Super Admin'
  const granted = SECTIONS.filter((section) => user.access[section]).map(
    (section) => `${SECTION_LABEL[section]}: ${ACCESS_LEVEL_LABEL[user.access[section]!]}`,
  )
  return granted.join(' · ') || 'No access'
}
