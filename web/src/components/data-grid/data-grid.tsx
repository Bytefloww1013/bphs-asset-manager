import type { ReactTable } from '@tanstack/react-table'
import type { Row, RowData } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'
import { IconButton } from '../ui/button.tsx'
import { Skeleton } from '../ui/feedback.tsx'
import type { GridFeatures } from './grid.ts'

const hide = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
} as const

interface DataGridProps<TData extends RowData> {
  table: ReactTable<GridFeatures, TData>
  /** Accessible name for the table. */
  label: string
  /** Noun for the footer count, e.g. "assets". */
  noun: string
  loading?: boolean
  /** Shown when the source has no rows at all. */
  empty: ReactNode
  /** Shown when a search or filter removes every row. */
  noMatches?: ReactNode
  rowClassName?: (row: Row<GridFeatures, TData>) => string | undefined
  /** Extra attributes per row, e.g. tabIndex and key handlers for row shortcuts. */
  rowProps?: (row: Row<GridFeatures, TData>) => HTMLAttributes<HTMLTableRowElement>
  /** Replace the built-in count and pager, e.g. when paging happens on the server. */
  footer?: ReactNode
  className?: string
}

/** Presentational shell over a TanStack Table instance: sortable headers, calm rows, pagination. */
export function DataGrid<TData extends RowData>({ table, label, noun, loading, empty, noMatches, rowClassName, rowProps, footer, className }: DataGridProps<TData>) {
  const rows = table.getRowModel().rows
  const total = table.getPrePaginatedRowModel().rows.length
  const sourceCount = table.getCoreRowModel().rows.length
  const { pageIndex, pageSize } = table.state.pagination
  const pageCount = table.getPageCount()
  const from = total === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min(total, (pageIndex + 1) * pageSize)

  return (
    <div className={cn('overflow-hidden rounded-panel border border-line bg-surface shadow-panel', className)}>
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label={label} aria-busy={loading || undefined}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line bg-sunken/70">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  const sorted = header.column.getIsSorted()
                  const sortable = header.column.getCanSort()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className={cn(
                        'h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-ink-3 sm:px-4',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                        meta?.hideBelow && hide[meta.hideBelow],
                        meta?.width,
                      )}
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            '-mx-2 inline-flex h-7 items-center gap-1 rounded-[6px] px-2 font-medium transition-colors hover:bg-line/60 hover:text-ink',
                            sorted && 'text-ink',
                            meta?.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 text-ink-4" aria-hidden />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {table.getAllLeafColumns().map((column) => (
                      <td key={column.id} className={cn('h-14 px-3 sm:px-4', column.columnDef.meta?.hideBelow && hide[column.columnDef.meta.hideBelow])}>
                        <Skeleton className="h-4 w-4/5" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    data-selected={row.getIsSelected() || undefined}
                    {...rowProps?.(row)}
                    className={cn(
                      'border-b border-line transition-colors last:border-0 hover:bg-canvas focus-visible:bg-canvas data-[selected]:bg-accent-soft/70',
                      rowClassName?.(row),
                    )}
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'h-14 px-3 py-2 align-middle text-ink sm:px-4',
                            meta?.align === 'right' && 'text-right tabular-nums',
                            meta?.align === 'center' && 'text-center',
                            meta?.hideBelow && hide[meta.hideBelow],
                            meta?.cellClassName,
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && (sourceCount === 0 ? empty : (noMatches ?? empty))}

      {footer}
      {footer === undefined && !loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/60 px-4 py-2.5 text-sm text-ink-3">
          <p className="tabular-nums" aria-live="polite">
            {pageCount > 1 ? `${from.toLocaleString()}–${to.toLocaleString()} of ` : ''}
            {total.toLocaleString()} {total === 1 ? noun.replace(/s$/, '') : noun}
            {total !== sourceCount && <span> (filtered from {sourceCount.toLocaleString()})</span>}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <span className="mr-2 tabular-nums">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <IconButton label="Previous page" size="sm" variant="secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <IconButton label="Next page" size="sm" variant="secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
