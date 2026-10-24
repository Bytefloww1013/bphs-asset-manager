/** What the Audit Log records. */
export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'issue', 'return', 'import', 'lock', 'sign_in'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
/** An action as the Audit Log shows it: "sign in" for sign_in. */
export const auditActionLabel = (action: AuditAction) => action.replaceAll('_', ' ')
