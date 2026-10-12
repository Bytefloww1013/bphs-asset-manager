import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, Plus, Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { OVERDUE_DAYS } from '@shared/constants.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/feedback.tsx'
import { Mono, PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { useSheetActions } from '@/features/assignments/open.ts'
import { ActionBadge, AssetTagLink, DaysOut, RatingBadge, Stacked } from '@/features/common/status.tsx'
import { cn } from '@/lib/cn.ts'
import { formatRelative, plural } from '@/lib/format.ts'
import { dashboardQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: Overview,
})

function Overview() {
  usePageTitle('Overview')
  const { data } = useQuery(dashboardQuery)
  const sheets = useSheetActions()

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Overview"
        description="Where the equipment is, and what needs a decision."
        actions={
          <>
            <Link to="/assets" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden />
              Add physical asset
            </Link>
            <Button variant="primary" icon={<Send className="size-4" />} onClick={() => sheets.issue()}>
              Issue physical asset
            </Button>
          </>
        }
      />

      {!data ? (
        <OverviewSkeleton />
      ) : (
        <>
          <Inventory totals={data.totals} typeCount={data.byType.length} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-6 xl:col-span-7">
              <Panel>
                <PanelHeader
                  title="Out the longest"
                  description={
                    data.overdueCount > 0
                      ? `${plural(data.overdueCount, 'physical asset')} out for more than a year.`
                      : `Nothing has been out for more than ${OVERDUE_DAYS} days.`
                  }
                  actions={
                    <Link to="/assignments" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover">
                      All assignments <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  }
                />
                {data.longestOut.length === 0 ? (
                  <Quiet>Nothing is out right now.</Quiet>
                ) : (
                  <ul>
                    {data.longestOut.map((row) => (
                      <li key={row.assignmentId} className="flex items-center gap-4 border-t border-line px-5 py-2.5">
                        <div className="w-36 shrink-0">
                          <Stacked primary={<AssetTagLink tag={row.assetTag} />} secondary={row.assetType} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Stacked primary={row.employee.name} secondary={row.employee.department} />
                        </div>
                        <DaysOut days={row.daysOut} className="w-20 shrink-0" />
                        <Button size="sm" onClick={() => sheets.returnAsset(row.assignmentId)}>
                          Return
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel>
                <PanelHeader title="Free stock by type" description="In service and not assigned to anyone." />
                <ul className="px-5 pb-4">
                  {data.byType.map((row) => {
                    const share = row.total === 0 ? 0 : row.free / row.total
                    return (
                      <li key={row.typeId}>
                        <Link
                          to="/available"
                          search={{ type: row.type }}
                          className="group -mx-2 grid grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] items-center gap-4 rounded-control px-2 py-2 hover:bg-canvas"
                        >
                          <span className="font-medium">{row.type}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
                            <span className={cn('block h-full rounded-full', row.free === 0 ? 'bg-bad' : share < 0.15 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.max(share * 100, row.free > 0 ? 3 : 0)}%` }} />
                          </span>
                          <span className="text-right text-sm tabular-nums text-ink-2">
                            <span className={cn('font-semibold', row.free === 0 ? 'text-bad' : 'text-ink')}>{row.free}</span> free <span className="text-ink-3">of {row.total}</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </Panel>
            </div>

            <div className="flex min-w-0 flex-col gap-6 xl:col-span-5">
              <Panel>
                <PanelHeader title="Condition watch" description="In a condition that needs attention, not yet retired." />
                {data.poorCondition.length === 0 ? (
                  <Quiet icon>Nothing needs attention.</Quiet>
                ) : (
                  <ul>
                    {data.poorCondition.map((row) => (
                      <li key={row.assetId} className="flex items-center gap-3 border-t border-line px-5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Stacked primary={<AssetTagLink tag={row.assetTag} />} secondary={`${row.assetType} · ${row.holder ?? 'in storage'}`} />
                        </div>
                        <RatingBadge name={row.rating} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel>
                <PanelHeader title="Holding the most" />
                <ul className="px-5 pb-4">
                  {data.topHolders.map((row) => (
                    <li key={row.employee.id} className="grid grid-cols-[minmax(0,1fr)_6rem_1.5rem] items-center gap-3 py-1.5">
                      <span className="truncate">{row.employee.name}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(row.count / (data.topHolders[0]?.count ?? 1)) * 100}%` }} />
                      </span>
                      <span className="text-right font-medium tabular-nums">{row.count}</span>
                    </li>
                  ))}
                  {data.topHolders.length === 0 && <Quiet>No one holds anything yet.</Quiet>}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Recent activity"
                  actions={
                    <Link to="/audit" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover">
                      Audit log <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  }
                />
                <ul>
                  {data.recent.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 border-t border-line px-5 py-2.5">
                      <div className="w-[4.5rem] shrink-0 pt-0.5">
                        <ActionBadge action={entry.action} />
                      </div>
                      <div className="min-w-0 flex-1 leading-5">
                        <Mono className="block truncate text-ink">{entry.details || `${entry.entityType} #${entry.entityId}`}</Mono>
                        <span className="text-xs text-ink-3">
                          {entry.actor} · {formatRelative(entry.occurredAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                  {data.recent.length === 0 && <Quiet>Activity will appear here as the register is used.</Quiet>}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Quiet({ children, icon }: { children: ReactNode; icon?: boolean }) {
  return (
    <p className="flex items-center gap-2 border-t border-line px-5 py-4 text-sm text-ink-3">
      {icon && <CheckCircle2 className="size-4 text-ok" aria-hidden />}
      {children}
    </p>
  )
}

/** One bar, three states. The legend doubles as the way into each filtered list. */
function Inventory({ totals, typeCount }: { totals: { total: number; assigned: number; inStorage: number; retired: number }; typeCount: number }) {
  const parts = [
    { key: 'assigned', label: 'Assigned', count: totals.assigned, bar: 'bg-accent', swatch: 'bg-accent', hint: 'Out with someone' },
    { key: 'in_storage', label: 'In storage', count: totals.inStorage, bar: 'bg-ok', swatch: 'bg-ok', hint: 'In service, ready to issue' },
    { key: 'retired', label: 'Retired', count: totals.retired, bar: 'bg-ink-4', swatch: 'bg-ink-4', hint: 'Taken out of service' },
  ] as const

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-md font-semibold">Inventory</h2>
        <p className="text-sm text-ink-3">
          {plural(totals.total, 'physical asset')} across {plural(typeCount, 'type')}
        </p>
      </div>
      <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={parts.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}>
        {parts.map((part) => (part.count > 0 ? <span key={part.key} className={cn('h-full', part.bar)} style={{ flexGrow: part.count, flexBasis: 0 }} /> : null))}
      </div>
      <ul className="mt-4 grid gap-1 sm:grid-cols-3">
        {parts.map((part) => (
          <li key={part.key}>
            <Link to="/assets" search={{ state: part.key }} className="group -mx-2 flex items-start gap-3 rounded-control px-2 py-2 transition-colors hover:bg-canvas">
              <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-[3px]', part.swatch)} aria-hidden />
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums leading-6">{part.count.toLocaleString()}</span>
                  <span className="text-sm font-medium text-ink-2">{part.label}</span>
                  <span className="text-xs tabular-nums text-ink-3">{totals.total ? Math.round((part.count / totals.total) * 100) : 0}%</span>
                </span>
                <span className="block text-xs text-ink-3">{part.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-36 w-full rounded-panel" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Skeleton className="h-96 rounded-panel xl:col-span-7" />
        <Skeleton className="h-96 rounded-panel xl:col-span-5" />
      </div>
    </div>
  )
}

