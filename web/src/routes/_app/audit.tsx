import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Download, ScrollText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AUDIT_ACTIONS, type AuditAction } from '@shared/constants.ts'
import type { AuditEntry } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { IconButton, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { FilterTabs, Input, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { ActionBadge } from '@/features/common/status.tsx'
import { formatDateTime } from '@/lib/format.ts'
import { auditCsvUrl, auditQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

const PAGE = 50

interface AuditSearch {
  action?: AuditAction
  from?: string
  to?: string
  page?: number
}

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const Route = createFileRoute('/_app/audit')({
  validateSearch: (search: Record<string, unknown>): AuditSearch => ({
    action: AUDIT_ACTIONS.includes(search.action as AuditAction) ? (search.action as AuditAction) : undefined,
    from: isDate(search.from) ? search.from : undefined,
    to: isDate(search.to) ? search.to : undefined,
    page: Number(search.page) > 1 ? Math.floor(Number(search.page)) : undefined,
  }),
  component: AuditPage,
})

const c = columnsFor<AuditEntry>()
const columns = [
  c.accessor('occurredAt', { header: 'Occurred at', cell: (info) => <Mono className="whitespace-nowrap text-ink-2">{formatDateTime(info.getValue())}</Mono>, enableSorting: false }),
  c.accessor('actor', { header: 'User', cell: (info) => <span className="font-medium">{info.getValue()}</span>, enableSorting: false, meta: { hideBelow: 'sm' } }),
  c.accessor('action', { header: 'Action', cell: (info) => <ActionBadge action={info.getValue()} />, enableSorting: false }),
  c.accessor((row) => `${row.entityType}${row.entityId ? ` #${row.entityId}` : ''}`, { id: 'entity', header: 'Record', cell: (info) => <Mono className="text-ink-2">{info.getValue()}</Mono>, enableSorting: false, meta: { hideBelow: 'md' } }),
  c.accessor('details', { header: 'Details', cell: (info) => <span className="block max-w-[34rem] truncate text-ink-2" title={info.getValue()}>{info.getValue() || '—'}</span>, enableSorting: false, meta: { hideBelow: 'lg' } }),
]
const getRowId = (row: AuditEntry) => String(row.id)

function AuditPage() {
  usePageTitle('Audit log')
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  const page = search.page ?? 1
  const filters = { action: search.action, from: search.from, to: search.to, q: debounced || undefined }
  const { data, isPending, isPlaceholderData } = useQuery(auditQuery({ ...filters, limit: PAGE, offset: (page - 1) * PAGE }))
  const table = useGrid({ data: data?.entries ?? [], columns, getRowId, pageSize: PAGE })

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const setFilter = (patch: AuditSearch) => void navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }) })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Every successful change, newest first. Read-only for everyone, including Super Admins; entries cannot be edited or removed."
        actions={
          <a href={auditCsvUrl(filters)} download className={buttonStyles('secondary', 'md')}>
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        }
      />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <FilterTabs
            label="Filter by action"
            value={search.action ?? 'all'}
            onChange={(next) => setFilter({ action: next === 'all' ? undefined : (next as AuditAction) })}
            options={[{ value: 'all', label: 'All' }, ...AUDIT_ACTIONS.map((action) => ({ value: action, label: action }))]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-3">
              From
              <Input type="date" className="w-40" value={search.from ?? ''} max={search.to} onChange={(event) => setFilter({ from: event.target.value || undefined })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-3">
              To
              <Input type="date" className="w-40" value={search.to ?? ''} min={search.from} onChange={(event) => setFilter({ to: event.target.value || undefined })} />
            </label>
            <SearchInput className="w-full sm:w-64" aria-label="Search the audit log" placeholder="Search details or user" value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
        </Toolbar>
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <DataGrid
            table={table}
            label="Audit log"
            noun="entries"
            loading={isPending}
            empty={<EmptyState icon={ScrollText} title="No entries match" description="Widen the date range or clear the filters." />}
            footer={
              total > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-4 py-2.5 text-sm text-ink-3">
                  <p className="tabular-nums" aria-live="polite">
                    {((page - 1) * PAGE + 1).toLocaleString()}–{Math.min(page * PAGE, total).toLocaleString()} of {total.toLocaleString()} entries
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 tabular-nums">
                      Page {page} of {pages.toLocaleString()}
                    </span>
                    <IconButton label="Previous page" size="sm" variant="secondary" disabled={page <= 1} onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page - 1 || undefined }) })}>
                      <ChevronLeft className="size-4" />
                    </IconButton>
                    <IconButton label="Next page" size="sm" variant="secondary" disabled={page >= pages} onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}>
                      <ChevronRight className="size-4" />
                    </IconButton>
                  </div>
                </div>
              ) : null
            }
          />
        </div>
        <p className="text-sm text-ink-3">A delete that was blocked because the record has history writes no entry. Only actions that succeeded appear here.</p>
      </div>
    </div>
  )
}
