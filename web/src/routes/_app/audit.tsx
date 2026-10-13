import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AUDIT_ACTIONS, auditActionLabel } from '@shared/constants.ts'
import type { AuditEntry } from '@shared/types.ts'
import { AuditLog, auditColumns, auditSearch } from '@/features/common/audit-log.tsx'
import { ActionBadge } from '@/features/common/status.tsx'
import { auditCsvUrl, auditQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/audit')({
  validateSearch: auditSearch(AUDIT_ACTIONS),
  component: AuditPage,
})

const columns = auditColumns<AuditEntry>({
  badge: (entry) => <ActionBadge action={entry.action} />,
  record: (entry) => `${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ''}`,
})

function AuditPage() {
  usePageTitle('Audit log')
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <AuditLog
      title="Audit log"
      description="Every successful change, newest first. Read-only for everyone, including Super Admins; entries cannot be edited or removed."
      footnote="A delete that was blocked because the record has history writes no entry, and neither does a failed sign-in, except the one that locks the account. Otherwise only actions that succeeded appear here."
      actions={AUDIT_ACTIONS}
      actionLabel={auditActionLabel}
      columns={columns}
      query={auditQuery}
      csvUrl={auditCsvUrl}
      search={Route.useSearch()}
      onSearch={(search, replace) => void navigate({ search, replace })}
    />
  )
}
