import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import {
  ActiveSwitch,
  AddRow,
  DeleteButton,
  EditableName,
  isOnlyActive,
  type ListKind,
} from '@/components/list-parts.tsx'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import type { GrievanceCategoryRow } from '../../shared/types.ts'
import { useGrievancePageTitle } from '../page-title.ts'
import { grievanceCategoriesQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/grievances/categories')({
  loader: ({ context }) => context.queryClient.ensureQueryData(grievanceCategoriesQuery),
  component: CategoriesPage,
})

// Guarded by Grievances; its changes are written to the Grievance Audit Log.
const KIND: ListKind = {
  path: 'grievances/categories',
  section: 'grievances',
  noun: 'category',
  log: 'Grievance Audit Log',
}

const c = columnsFor<GrievanceCategoryRow>()
const columns = [
  c.accessor('name', {
    header: 'Name',
    cell: (info) => <EditableName kind={KIND} id={info.row.original.id} name={info.getValue()} />,
  }),
  c.accessor('grievanceCount', {
    header: 'Grievances',
    cell: (info) => <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue()}</span>,
    meta: { align: 'right' },
  }),
  c.accessor('isActive', {
    header: 'Active',
    cell: (info) => (
      <ActiveSwitch
        kind={KIND}
        id={info.row.original.id}
        name={info.row.original.name}
        active={info.getValue()}
        onlyActive={isOnlyActive(info)}
      />
    ),
    enableSorting: false,
  }),
  c.display({
    id: 'actions',
    header: () => <span className="sr-only">Delete</span>,
    cell: (info) => (
      <DeleteButton
        kind={KIND}
        id={info.row.original.id}
        name={info.row.original.name}
        inUse={info.row.original.grievanceCount > 0}
        inUseReason={`${info.row.original.grievanceCount} grievances use this category. Deactivate it instead.`}
        onlyActive={isOnlyActive(info)}
      />
    ),
    meta: { align: 'right', width: 'w-14', cellClassName: 'max-sm:pl-0' },
  }),
]

function CategoriesPage() {
  useGrievancePageTitle('Categories')
  const { data: categories = [] } = useQuery(grievanceCategoriesQuery)
  const table = useGrid({ data: categories, columns, getRowId: (row) => String(row.id), pageSize: 100 })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="The categories offered when recording a grievance. Deactivate instead of deleting anything that is in use."
      />
      <Panel className="max-w-2xl overflow-hidden">
        <PanelHeader
          title="Grievance categories"
          description={`${categories.length} categories, ${categories.filter((x) => x.isActive).length} active`}
        />
        <AddRow kind={KIND} placeholder="New category name" noun="Category" />
        <DataGrid
          table={table}
          label="Grievance categories"
          noun="categories"
          empty={null}
          className="rounded-none border-0 border-t shadow-none"
        />
      </Panel>
    </div>
  )
}
