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
  /** Whatever narrows or replaces `data` before the grid sees it (a filter tab, an uploaded file). Like `search`, a change returns to the first page. */
  resetKey?: unknown
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
  resetKey,
}: GridOptions<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })

  const toPage = (pageIndex: number) => setPagination((old) => (old.pageIndex === pageIndex ? old : { ...old, pageIndex }))

  // `data` is a new array after every edit and every refetch, so the table must not go back to the first page whenever
  // it changes. Only what the viewer chose does: a new search, filter or sort starts again at the first page.
  const [seen, setSeen] = useState({ search, resetKey })
  if (seen.search !== search || !Object.is(seen.resetKey, resetKey)) {
    setSeen({ search, resetKey })
    toPage(0)
  }

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

  const table = useTable({
    features: gridFeatures,
    columns,
    data,
    getRowId,
    state: { sorting, rowSelection, pagination, globalFilter: search },
    autoResetPageIndex: false,
    onSortingChange: (updater) => {
      setSorting(updater)
      toPage(0)
    },
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    enableRowSelection: selectable,
    enableSortingRemoval: true,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: globalFilterFn as never,
  })

  // Rows that went away (a return, a delete, someone else's change) can leave the page past the end: stop on the last one.
  const lastPage = Math.max(0, table.getPageCount() - 1)
  if (pagination.pageIndex > lastPage) toPage(lastPage)

  return table
}
