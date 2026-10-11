export const ROLES = ['admin', 'super_admin'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
}

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'issue', 'return', 'import'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const CONDITION_KINDS = ['intake', 'issue', 'return'] as const
export type ConditionKind = (typeof CONDITION_KINDS)[number]

export const ASSET_STATUSES = ['in_service', 'retired'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/** Wrong passwords in a row before an account locks. */
export const LOCK_THRESHOLD = 5
/** Minutes an account stays locked. */
export const LOCK_MINUTES = 15
/** Assets out longer than this are flagged as overdue in the UI. */
export const OVERDUE_DAYS = 365
