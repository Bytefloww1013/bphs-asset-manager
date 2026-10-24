import { AuditLog, auditColumns, auditSearch } from '#foundation/audit/web/index.ts'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { GRIEVANCE_AUDIT_ACTIONS, grievanceEntryCode } from '../../shared/constants.ts'
import type { GrievanceAuditEntry } from '../../shared/types.ts'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceAuditCsvUrl, grievanceAuditQuery } from '../queries.ts'
import { GrievanceActionBadge } from '../status.tsx'

export const Route = createFileRoute('/_app/grievances/audit')({
  validateSearch: auditSearch(GRIEVANCE_AUDIT_ACTIONS),
  component: GrievanceAuditPage,
})

const link = 'hover:text-accent hover:underline'

/** The grievance or timeline entry an entry is about, by its ID, linked; a category links to the list of them. */
function Record({ entry }: { entry: GrievanceAuditEntry }) {
  if (entry.code && entry.seq) {
    return (
      <Link
        to="/grievances/$code/entries/$seq"
        params={{ code: entry.code, seq: grievanceEntryCode(entry.seq) }}
        className={link}
      >
        {entry.code}-{grievanceEntryCode(entry.seq)}
      </Link>
    )
  }
  if (entry.code) {
    return (
      <Link to="/grievances/$code" params={{ code: entry.code }} className={link}>
        {entry.code}
      </Link>
    )
  }
  if (entry.entityType === 'category') {
    return (
      <Link to="/grievances/categories" className={link}>
        category{entry.entityId ? ` #${entry.entityId}` : ''}
      </Link>
    )
  }
  return `${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ''}`
}

const columns = auditColumns<GrievanceAuditEntry>({
  badge: (entry) => <GrievanceActionBadge action={entry.action} />,
  record: (entry) => <Record entry={entry} />,
})

function GrievanceAuditPage() {
  useGrievancePageTitle('Audit log')
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <AuditLog
      title="Audit log"
      description="Every change to a grievance, its timeline or the categories, newest first. Read-only for everyone, including Super Admins; entries cannot be edited or removed."
      footnote="An entry names the grievance by its ID and title, and an edit by the fields it changed: never what a grievance or entry says. Opening a grievance writes no entry, and only changes that succeeded appear here."
      actions={GRIEVANCE_AUDIT_ACTIONS}
      actionLabel={(action) => action}
      columns={columns}
      query={grievanceAuditQuery}
      csvUrl={grievanceAuditCsvUrl}
      search={Route.useSearch()}
      onSearch={(search, replace) => void navigate({ search, replace })}
    />
  )
}
