// The module registry, shared side (issue #23): what every module says about itself, for the server and the website.
// Only functions are exported, and none reads the registry as this file loads: a module that imports this file may itself be
// in the registry, still loading (an ESM cycle).
import type { PermissionResource, SharedManifest } from './modules.ts'
import { SHARED_MANIFESTS } from './modules.gen.ts'

/** The id of a module. */
export type ModuleId = (typeof SHARED_MANIFESTS)[number]['id']

type ResourceOf<M> = M extends { resources: readonly (infer R extends PermissionResource)[] } ? R : never
type Resource = ResourceOf<(typeof SHARED_MANIFESTS)[number]>
/** The key of every module's permission resource (`Section` in shared/constants.ts). */
export type ResourceKey = Resource['key']
/** The key of every one that is a workspace (`Workspace`). */
export type WorkspaceKey = Extract<Resource, { workspace: true }>['key']

type KindsOf<M> = M extends { notificationKinds: infer K } ? keyof K & string : never
/** Every module's notification kinds: what `notify()` takes. */
export type NotificationKind = KindsOf<(typeof SHARED_MANIFESTS)[number]>

type EntityTypesOf<M> = M extends { auditEntityTypes: readonly (infer T extends string)[] } ? T : never
/** Every module's audit entity types: what `writeAudit()` takes. */
export type AuditEntityType = EntityTypesOf<(typeof SHARED_MANIFESTS)[number]>

/** Every module's manifest, foundation and dependencies first. */
export function manifests(): readonly SharedManifest[] {
  return SHARED_MANIFESTS
}

/**
 * Every permission resource, the order of the Users page's access form: the workspaces, then the rest (Employees), each by
 * its `order`, then in module order. Foundation modules come first in the registry, but their resources serve every
 * workspace, so they go last.
 */
export function permissionResources(): readonly PermissionResource[] {
  const all = SHARED_MANIFESTS.flatMap(
    (manifest: SharedManifest): readonly PermissionResource[] => manifest.resources ?? [],
  ).toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return [...all.filter((resource) => resource.workspace), ...all.filter((resource) => !resource.workspace)]
}

/** Every notification kind with its label, in module order. */
export function notificationKinds(): Readonly<Record<NotificationKind, string>> {
  return Object.assign({}, ...SHARED_MANIFESTS.map((manifest: SharedManifest) => manifest.notificationKinds ?? {}))
}

/** The kinds that tell an account about the employee linked to it: when the link changes, they belong to someone else. */
export function employeeNotificationKinds(): readonly NotificationKind[] {
  return SHARED_MANIFESTS.flatMap(
    (manifest: SharedManifest) => (manifest.employeeNotificationKinds ?? []) as readonly NotificationKind[],
  )
}

/** Every entity type that writes to the central audit log, in module order. */
export function auditEntityTypes(): readonly AuditEntityType[] {
  return SHARED_MANIFESTS.flatMap(
    (manifest: SharedManifest) => (manifest.auditEntityTypes ?? []) as readonly AuditEntityType[],
  )
}
