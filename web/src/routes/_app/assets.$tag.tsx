import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ConditionEntry, HistoryRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { Mono, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { AssetRowActions } from '@/features/assets/asset-actions.tsx'
import { useSheetActions } from '@/features/assignments/open.ts'
import { AssetStateBadge, DaysOut, HolderCell, RatingBadge, stateLabel } from '@/features/common/status.tsx'
import { ApiError } from '@/lib/api.ts'
import { formatDate, formatDateTime, formatDays, plural } from '@/lib/format.ts'
import { assetDetailQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/assets/$tag')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(assetDetailQuery(params.tag)),
  errorComponent: ({ error }) => (
    <EmptyState
      icon={ScrollText}
      title={error instanceof ApiError && error.status === 404 ? 'No physical asset with that tag' : 'Could not load this asset'}
      description={error instanceof Error ? error.message : undefined}
      action={
        <Link to="/assets" className={buttonStyles('primary')}>
          Back to physical assets
        </Link>
      }
    />
  ),
  component: AssetDetailPage,
})

const h = columnsFor<HistoryRow>()
const historyColumns = [
  h.accessor('id', { header: 'Assignment', cell: (info) => <Mono className="text-ink-2">#{info.getValue()}</Mono> }),
  h.accessor((row) => (row.employee ?? row.program)?.name ?? '', { id: 'holder', header: 'Holder', cell: (info) => <HolderCell employee={info.row.original.employee} program={info.row.original.program} /> }),
  h.accessor('issuedAt', { header: 'Issued', cell: (info) => <Mono className="text-ink-2">{formatDateTime(info.getValue())}</Mono>, meta: { hideBelow: 'md' } }),
  h.accessor((row) => row.returnedAt ?? '', {
    id: 'returnedAt',
    header: 'Returned',
    cell: (info) => (info.row.original.returnedAt ? <Mono className="text-ink-2">{formatDateTime(info.row.original.returnedAt)}</Mono> : <Badge tone="accent">Still out</Badge>),
    meta: { hideBelow: 'md' },
  }),
  h.accessor((row) => row.issueRating ?? '', { id: 'issueRating', header: 'At issue', cell: (info) => <RatingBadge name={info.row.original.issueRating} />, enableSorting: false, meta: { hideBelow: 'lg' } }),
  h.accessor((row) => row.returnRating ?? '', { id: 'returnRating', header: 'At return', cell: (info) => <RatingBadge name={info.row.original.returnRating} />, enableSorting: false, meta: { hideBelow: 'lg' } }),
  h.accessor('daysHeld', { header: 'Held', cell: (info) => (info.row.original.returnedAt ? <span className="tabular-nums text-ink-2">{formatDays(info.getValue())}</span> : <DaysOut days={info.getValue()} />), meta: { align: 'right' } }),
]
const historyId = (row: HistoryRow) => String(row.id)

const kindLabel: Record<ConditionEntry['kind'], string> = { intake: 'Received', issue: 'Issued', return: 'Returned' }

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

function AssetDetailPage() {
  const { tag } = Route.useParams()
  const { data } = useQuery(assetDetailQuery(tag))
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const sheets = useSheetActions()
  usePageTitle(tag.toUpperCase())
  const table = useGrid({ data: data?.history ?? [], columns: historyColumns, getRowId: historyId, pageSize: 50, resetKey: tag })
  if (!data) return null
  const { asset, history, conditions } = data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/assets" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Physical Assets
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold tracking-[-0.01em]">{asset.tag}</h1>
              <AssetStateBadge state={asset.state} />
            </div>
            <p className="mt-1 text-sm text-ink-3">
              {asset.type}
              {asset.serial ? <> · serial <Mono>{asset.serial}</Mono></> : ''} · added {formatDate(asset.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {asset.state === 'assigned' && asset.assignmentId && (
              <Button variant="primary" onClick={() => sheets.returnAsset(asset.assignmentId!)}>
                Return
              </Button>
            )}
            {asset.state === 'in_storage' && (
              <Button variant="primary" onClick={() => sheets.issue(asset.id)}>
                Issue
              </Button>
            )}
            <AssetRowActions
              asset={asset}
              hidePrimary
              onDeleted={() => void navigate({ to: '/assets' })}
              // The address is the tag, so a rename has to move it. `replace` keeps Back from landing on a tag that no longer exists, and
              // once nothing shows the old tag's page it leaves the cache too: the route loader would hand a later visit that stale copy.
              onSaved={(row) => {
                if (row.tag.toUpperCase() === tag.toUpperCase()) return
                void navigate({ to: '/assets/$tag', params: { tag: row.tag }, replace: true }).then(() => queryClient.removeQueries({ queryKey: assetDetailQuery(tag).queryKey }))
              }}
            />
          </div>
        </div>
      </div>

      <Panel>
        <dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <Fact label="Current holder">
            {asset.holder ? (
              <><span>{asset.holder.name}</span> <Mono className="text-ink-3">{asset.holder.code}</Mono></>
            ) : asset.program ? (
              <><span>{asset.program.name}</span> <span className="font-normal text-ink-3">Program <Mono>{asset.program.code}</Mono></span></>
            ) : (
              <span className="text-ink-3">{stateLabel(asset.state)}</span>
            )}
          </Fact>
          <Fact label="Department">{asset.holder?.department ?? <span className="text-ink-3">—</span>}</Fact>
          <Fact label="Days out">{asset.daysOut === null ? <span className="text-ink-3">—</span> : <DaysOut days={asset.daysOut} className="justify-start" />}</Fact>
          <Fact label="Latest condition">
            {asset.condition ? (
              <span className="inline-flex items-center gap-2">
                <RatingBadge name={asset.condition.rating} />
                <span className="text-xs font-normal text-ink-3">{formatDate(asset.condition.recordedAt)}</span>
              </span>
            ) : (
              <span className="text-ink-3">Not recorded</span>
            )}
          </Fact>
        </dl>
      </Panel>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-md font-semibold">Assignment history</h2>
          <p className="text-sm text-ink-3">
            {plural(history.length, 'assignment')}, {plural(conditions.length, 'condition record')}. Nothing here is ever overwritten.
          </p>
        </div>
        <DataGrid
          table={table}
          label="Assignment history"
          noun="assignments"
          empty={<EmptyState icon={ScrollText} title="Never assigned" description="This asset has not been issued yet. Once it is, each handoff is recorded here with its condition." />}
        />
      </section>

      <Panel>
        <PanelHeader title="Condition log" description="A snapshot is taken when an asset is received, issued and returned." />
        {conditions.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-ink-3">No condition has been recorded.</p>
        ) : (
          <ol>
            {conditions.map((entry) => (
              <li key={entry.id} className="grid gap-x-4 gap-y-1 border-t border-line px-5 py-3 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_auto] sm:items-center">
                <span className="text-sm font-medium">{kindLabel[entry.kind]}</span>
                <span className="justify-self-start">
                  <RatingBadge name={entry.rating} />
                </span>
                <p className="min-w-0 text-sm text-ink-2">
                  {entry.notes ? entry.notes : <span className="text-ink-3">No notes</span>}
                  {entry.assessedBy && <span className="text-ink-3"> · assessed by {entry.assessedBy}</span>}
                </p>
                <p className="font-mono text-xs text-ink-3 sm:text-right">
                  {formatDateTime(entry.recordedAt)} · {entry.recordedBy}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
