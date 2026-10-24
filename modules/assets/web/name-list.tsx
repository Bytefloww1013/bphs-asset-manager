// The lists that are a name, how many assets use it, and whether it is offered: the physical and digital asset types and the
// asset brands, on the Lookup lists page.
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
import { Panel, PanelHeader } from '@/components/ui/layout.tsx'
import type { NamedListRow } from '../shared/index.ts'

const t = columnsFor<NamedListRow>()
/** Physical and digital asset types and asset brands are the same kind of list, so they share their columns. */
export const nameListColumns = (kind: ListKind, counted: string, uses: string) => [
  t.accessor('name', {
    header: 'Name',
    cell: (info) => <EditableName kind={kind} id={info.row.original.id} name={info.getValue()} />,
  }),
  t.accessor('assetCount', {
    header: counted,
    cell: (info) => <span className={info.getValue() ? 'font-medium' : 'text-ink-3'}>{info.getValue()}</span>,
    meta: { align: 'right' },
  }),
  t.accessor('isActive', {
    header: 'Active',
    cell: (info) => (
      <ActiveSwitch
        kind={kind}
        id={info.row.original.id}
        name={info.row.original.name}
        active={info.getValue()}
        onlyActive={isOnlyActive(info)}
      />
    ),
    enableSorting: false,
  }),
  t.display({
    id: 'actions',
    header: () => <span className="sr-only">Delete</span>,
    cell: (info) => (
      <DeleteButton
        kind={kind}
        id={info.row.original.id}
        name={info.row.original.name}
        inUse={info.row.original.assetCount > 0}
        inUseReason={`${info.row.original.assetCount} ${uses} use this ${kind.noun}. Deactivate it instead.`}
        onlyActive={isOnlyActive(info)}
      />
    ),
    meta: { align: 'right', width: 'w-14', cellClassName: 'max-sm:pl-0' },
  }),
]

/** Physical and digital asset types and asset brands: a name, how many assets use it, and whether it is offered. */
export function NameList({
  kind,
  rows,
  columns,
  title,
  plural,
  placeholder,
  noun,
}: {
  kind: ListKind
  rows: NamedListRow[]
  columns: ReturnType<typeof nameListColumns>
  title: string
  plural: string
  placeholder: string
  noun: string
}) {
  const table = useGrid({ data: rows, columns, getRowId: (row) => String(row.id), pageSize: 100 })
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={title}
        description={`${rows.length} ${plural}, ${rows.filter((x) => x.isActive).length} active`}
      />
      <AddRow kind={kind} placeholder={placeholder} noun={noun} />
      <DataGrid
        table={table}
        label={title}
        noun={plural}
        empty={null}
        className="rounded-none border-0 border-t shadow-none"
      />
    </Panel>
  )
}
