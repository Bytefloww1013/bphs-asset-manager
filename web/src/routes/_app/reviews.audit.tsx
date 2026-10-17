import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { REVIEW_AUDIT_ACTIONS } from '@shared/constants.ts'
import type { ReviewAuditEntry } from '@shared/types.ts'
import { AuditLog, auditColumns, auditSearch } from '@/features/common/audit-log.tsx'
import { CapLink } from '@/features/reviews/cap-parts.tsx'
import { useReviewPageTitle } from '@/features/reviews/page-title.ts'
import { ReviewActionBadge } from '@/features/reviews/status.tsx'
import { reviewAuditCsvUrl, reviewAuditQuery } from '@/lib/queries.ts'

export const Route = createFileRoute('/_app/reviews/audit')({
  validateSearch: auditSearch(REVIEW_AUDIT_ACTIONS),
  component: ReviewAuditPage,
})

const link = 'hover:text-accent hover:underline'

/** The review or CAP an entry is about, by its ID, linked; an export of Action items links to that list. */
function Record({ entry }: { entry: ReviewAuditEntry }) {
  if (entry.code) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Link to="/reviews/$code" params={{ code: entry.code }} className={link}>
          {entry.code}
        </Link>
        {entry.cap && <CapLink code={entry.code} seq={entry.cap} chip />}
      </span>
    )
  }
  if (entry.action === 'export') {
    return (
      <Link to="/reviews/actions" className={link}>
        Action items
      </Link>
    )
  }
  return `${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ''}`
}

const columns = auditColumns<ReviewAuditEntry>({
  badge: (entry) => <ReviewActionBadge action={entry.action} />,
  record: (entry) => <Record entry={entry} />,
})

function ReviewAuditPage() {
  useReviewPageTitle('Audit log')
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <AuditLog
      title="Audit log"
      description="Every change to a review, its CAPs, its history or its files, newest first. Read-only for everyone, including Super Admins; entries cannot be edited or removed."
      footnote="An entry names the review by its ID and title, and an edit by the fields it changed: never the findings, the review itself, a CAP's details or an update. Opening a review writes no entry, and only changes that succeeded appear here. Nothing about a review of your own is shown."
      actions={REVIEW_AUDIT_ACTIONS}
      actionLabel={(action) => action}
      columns={columns}
      query={reviewAuditQuery}
      csvUrl={reviewAuditCsvUrl}
      search={Route.useSearch()}
      onSearch={(search, replace) => void navigate({ search, replace })}
    />
  )
}
