import type { AuditAction } from './constants.ts'

export interface AuditEntry {
  id: number
  occurredAt: string
  actor: string
  action: AuditAction
  entityType: string
  entityId: number | null
  details: string
}

export interface AuditPage {
  total: number
  entries: AuditEntry[]
}
