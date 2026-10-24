// The access levels (issue #23). A leaf: it imports nothing, so a module's shared manifest can use it. shared/constants.ts
// re-exports it, but a manifest can't import that file, which reads the registry as it loads.

/** Each level includes the ones before it. Full is what a Super Admin can do, within that section. */
export const ACCESS_LEVELS = ['none', 'read', 'assign', 'edit', 'full'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]
export const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  none: 'None',
  read: 'Read Only',
  assign: 'Assign',
  edit: 'Edit',
  full: 'Full',
}
/** The four levels every section has. Assign sits between Read and Edit, and only Tasks offers it. */
export const SHARED_LEVELS = ['none', 'read', 'edit', 'full'] as const satisfies readonly AccessLevel[]
