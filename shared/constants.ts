import { permissionResources, type ResourceKey, type WorkspaceKey } from './registry.ts'
import type { AccessLevel } from './levels.ts'
import type { PermissionResource } from './modules.ts'

export { ACCESS_LEVEL_LABEL, ACCESS_LEVELS, SHARED_LEVELS, type AccessLevel } from './levels.ts'

// The sections are the modules' permission resources (issue #23), read from the registry as this file loads. So a
// module's shared manifest never imports this file: it would load before the registry has it, an ESM cycle (shared/levels.ts).
const RESOURCES = permissionResources()
const byKey = <T>(resources: typeof RESOURCES, value: (resource: (typeof RESOURCES)[number]) => T) =>
  Object.fromEntries(resources.map((resource) => [resource.key, value(resource)]))

/** The app is separate workspaces behind one sign-in. A person is in one at a time, never looking at a mix. */
export type Workspace = WorkspaceKey
const WORKSPACE_RESOURCES = RESOURCES.filter((resource) => resource.workspace)
export const WORKSPACES = WORKSPACE_RESOURCES.map((resource) => resource.key) as readonly Workspace[]
export const WORKSPACE_LABEL = byKey(WORKSPACE_RESOURCES, (resource) => resource.label) as Record<Workspace, string>

/** What an account is given access to: every workspace, and Employees, which serves all of them. */
export type Section = ResourceKey
export const SECTIONS = RESOURCES.map((resource) => resource.key) as readonly Section[]
export const SECTION_LABEL = byKey(RESOURCES, (resource) => resource.label) as Record<Section, string>

const LEVELS = byKey(RESOURCES, (resource) => resource.levels) as Record<Section, readonly AccessLevel[]>
/** The levels the access form offers in a section, None first: the four shared ones, and Assign as well in Tasks. */
export const levelsFor = (section: Section): readonly AccessLevel[] => LEVELS[section]
const HELP = byKey(RESOURCES, (resource) => resource.help) as Record<Section, PermissionResource['help']>
/** What a level allows in a section; `bun run modules:gen` refuses a resource that leaves one of its levels unexplained. */
export const levelHelp = (section: Section, level: AccessLevel): string => HELP[section][level] ?? ''
/** A line under the section's name on the Users page's access form, if it has one. */
export const SECTION_HINT = byKey(RESOURCES, (resource) => resource.hint) as Record<Section, string | undefined>
/** An account's level in each section. A section that is not named is None, so a section added later starts closed. */
export type Access = Partial<Record<Section, Exclude<AccessLevel, 'none'>>>

/** Wrong passwords in a row before an account locks. */
export const LOCK_THRESHOLD = 5
/** Minutes an account stays locked. */
export const LOCK_MINUTES = 15
/** Idle days before a session signed in with "Keep me signed in" ends. */
export const REMEMBER_DAYS = 30

/** An entry's number within its record, as in E01: a grievance's and a review's are numbered alike. */
export const entryCode = (seq: number) => `E${String(seq).padStart(2, '0')}`

/** Files on a grievance (G10): at most this large each, and at most this many in one request. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENTS_PER_REQUEST = 10
/** The files that can be attached, by extension, and the type each is served as. The server checks the content as well. */
export const ATTACHMENT_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  eml: 'message/rfc822',
} as const
export type AttachmentExtension = keyof typeof ATTACHMENT_TYPES
/** A file name's extension, lower-cased; empty when it has none. */
export const fileExtension = (name: string) =>
  name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''

/** A link that stays in the app: one leading slash, never two and never a backslash, which browsers read as another host. */
export const isInAppPath = (value: string) => /^\/(?![/\\])/.test(value)
