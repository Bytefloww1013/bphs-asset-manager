import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ClipboardList, Download, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { AssignmentRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { Checkbox, SearchInput } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Toolbar } from '@/components/ui/layout.tsx'
import { BulkReturnSheet } from '@/features/assignments/return-sheet.tsx'
import { useSheetActions } from '@/features/assignments/open.ts'
import { AssetTagLink, DaysOut, RatingBadge, Stacked } from '@/features/common/status.tsx'
import { downloadCsv, formatDateTime, plural } from '@/lib/format.ts'
import { assignmentsQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/assignments')({
  loader: ({ context }) => context.queryClient.ensureQueryData(assignmentsQuery),
  component: AssignmentsPage,
})

const c = columnsFor<AssignmentRow>()

function RowActions({ row }: { row: AssignmentRow }) {
  const sheets = useSheetActions()
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" onClick={() => sheets.returnAsset(row.id)}>
        Return
      </Button>
      <Link to="/assets/$tag" params={{ tag: row.assetTag }} className={buttonStyles('ghost', 'sm', 'hidden md:inline-flex')}>
        History
      </Link>
    </div>
  )
}

const columns = [
  c.display({
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected()
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.assetTag}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    meta: { width: 'w-12' },
  }),
  c.accessor('assetTag', {
    header: 'Asset',
    cell: (info) => (
      <Stacked
        primary={<AssetTagLink tag={info.getValue()} />}
        secondary={
          <>
            {info.row.original.assetType}
            <span className="md:hidden"> · {info.row.original.employee.name}</span>
            {/* On a phone there is no room for a Days out column beside Return, so the figure goes under the holder. */}
            <DaysOut days={info.row.original.daysOut} className="flex justify-start sm:hidden" />
          </>
        }
      />
    ),
  }),
  c.accessor((row) => row.employee.name, { id: 'employee', header: 'Employee', cell: (info) => <Stacked primary={info.row.original.employee.name} secondary={[info.row.original.employee.code, info.row.original.employee.department].filter(Boolean).join(' · ')} />, meta: { hideBelow: 'md' } }),
  c.accessor('issuedAt', { header: 'Issued', cell: (info) => <Mono className="text-ink-2">{formatDateTime(info.getValue())}</Mono>, meta: { hideBelow: 'md' } }),
  c.accessor((row) => row.issueRating ?? '', { id: 'issueRating', header: 'Condition at issue', cell: (info) => <RatingBadge name={info.row.original.issueRating} />, meta: { hideBelow: 'lg' } }),
  c.accessor('daysOut', { header: 'Days out', cell: (info) => <DaysOut days={info.getValue()} />, meta: { align: 'right', hideBelow: 'sm' } }),
  c.display({ id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: (info) => <RowActions row={info.row.original} />, meta: { align: 'right', width: 'md:w-44', pinned: true } }),
]
const getRowId = (row: AssignmentRow) => String(row.id)
const searchText = (row: AssignmentRow) => [row.assetTag, row.assetType, row.employee.name, row.employee.code, row.employee.department, row.issueRating].filter(Boolean).join(' ')

function AssignmentsPage() {
  usePageTitle('Assignments')
  const { data = [], isPending } = useQuery(assignmentsQuery)
  const [search, setSearch] = useState('')
  const [returning, setReturning] = useState<AssignmentRow[] | null>(null)
  const table = useGrid({ data, columns, getRowId, searchText, search, selectable: true, initialSorting: [{ id: 'daysOut', desc: true }] })
  const selected = table.getSelectedRowModel().rows.map((row) => row.original)
  // A search hides rows without unticking them, so say how many of the ticked rows are out of sight.
  const hidden = selected.length - table.getFilteredSelectedRowModel().rows.length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assignments"
        description={`${plural(data.length, 'physical asset')} currently out. A handoff is a return then an issue: two assignments, two condition records.`}
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              disabled={data.length === 0}
              onClick={() =>
                downloadCsv(
                  'active-assignments.csv',
                  ['Asset tag', 'Type', 'Employee', 'Employee ID', 'Department', 'Issued', 'Condition at issue', 'Days out'],
                  data.map((r) => [r.assetTag, r.assetType, r.employee.name, r.employee.code, r.employee.department, formatDateTime(r.issuedAt), r.issueRating, r.daysOut]),
                )
              }
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              icon={<Undo2 className="size-4" />}
              disabledReason={selected.length === 0 ? 'Tick one or more rows to return them together' : undefined}
              onClick={() => setReturning(selected)}
            >
              {selected.length > 0 ? `Return selected (${selected.length})` : 'Return selected'}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        <Toolbar className="justify-between">
          <SearchInput className="w-full sm:w-96" aria-label="Search assignments" placeholder="Search tag, employee, department" value={search} onChange={(event) => setSearch(event.target.value)} />
          {selected.length > 0 && (
            <p className="text-sm text-ink-3">
              {plural(selected.length, 'row')} selected{hidden > 0 && `, ${hidden} hidden by the search`}.{' '}
              <button type="button" className="font-medium text-accent hover:text-accent-hover" onClick={() => table.resetRowSelection()}>
                Clear
              </button>
            </p>
          )}
        </Toolbar>
        <DataGrid
          table={table}
          label="Active assignments"
          noun="assignments"
          loading={isPending}
          empty={<EmptyState icon={ClipboardList} title="Nothing is out" description="When a physical asset is issued to someone it shows up here until it is returned." action={<Link to="/available" className={buttonStyles('primary')}>See available assets</Link>} />}
          noMatches={<EmptyState icon={ClipboardList} title="No assignments match" description="Try a different name or tag." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />}
        />
      </div>
      {returning && (
        <BulkReturnSheet
          rows={returning}
          onClose={() => {
            setReturning(null)
            table.resetRowSelection()
          }}
        />
      )}
    </div>
  )
}
