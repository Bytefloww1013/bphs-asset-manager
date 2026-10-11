import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'

/**
 * One feature set for every grid in the app. Features and row models are registered once at module
 * scope so a table never rebuilds its pipeline on render.
 */
export const gridFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic, datetime: sortFn_datetime },
  filterFns: { includesString: filterFn_includesString },
})

export type GridFeatures = typeof gridFeatures

export const columnsFor = <TData extends RowData>() => createColumnHelper<GridFeatures, TData>()

declare module '@tanstack/react-table' {
  // Layout hints read by <DataGrid>; the table itself never looks at them.
  interface ColumnMeta<TFeatures, TData, TValue> {
    align?: 'right' | 'center'
    /** Hide this column below a breakpoint so the grid fits without sideways scrolling. */
    hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    /** Width hint for the column, e.g. 'w-40'. */
    width?: string
    /** Cell padding/typography overrides. */
    cellClassName?: string
  }
}

export interface GridOptions<TData extends RowData> {
  data: TData[]
  columns: ColumnDef<GridFeatures, TData, any>[]
  getRowId: (row: TData) => string
  /** Free-text search; every word must appear somewhere in the text returned for the row. */
  searchText?: (row: TData) => string
  search?: string
  pageSize?: number
  initialSorting?: SortingState
  selectable?: boolean
}

export function useGrid<TData extends RowData>({
  data,
  columns,
  getRowId,
  searchText,
  search = '',
  pageSize = 25,
  initialSorting = [],
  selectable = false,
}: GridOptions<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })

  const globalFilterFn = useMemo(
    () =>
      searchText
        ? (row: { original: TData }, _columnId: string, filterValue: string) => {
            const haystack = searchText(row.original).toLowerCase()
            return String(filterValue)
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every((word) => haystack.includes(word))
          }
        : undefined,
    [searchText],
  )

  return useTable({
    features: gridFeatures,
    columns,
    data,
    getRowId,
    state: { sorting, rowSelection, pagination, globalFilter: search },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    enableRowSelection: selectable,
    enableSortingRemoval: true,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: globalFilterFn as never,
  })
}
