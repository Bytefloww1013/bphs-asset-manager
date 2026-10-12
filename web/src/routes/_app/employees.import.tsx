import { useMutation } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Check, ChevronLeft, FileSpreadsheet, FileUp, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ImportPreview, ImportRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Alert, EmptyState } from '@/components/ui/feedback.tsx'
import { Mono, PageHeader, Panel } from '@/components/ui/layout.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { downloadCsv, plural } from '@/lib/format.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/employees/import')({ component: ImportPage })

const c = columnsFor<ImportRow>()
const columns = [
  c.accessor('row', { header: 'Row', cell: (info) => <Mono className="text-ink-3">{info.getValue()}</Mono>, meta: { align: 'right', width: 'w-16' } }),
  c.accessor('code', { header: 'Employee ID', cell: (info) => (info.getValue() ? <Mono className="whitespace-nowrap">{info.getValue()}</Mono> : <span className="text-ink-3">—</span>) }),
  c.accessor((row) => `${row.firstName} ${row.lastName}`.trim(), { id: 'name', header: 'Name', cell: (info) => info.getValue() || <span className="text-ink-3">—</span>, meta: { cellClassName: 'whitespace-nowrap' } }),
  c.accessor('department', { header: 'Department', cell: (info) => info.getValue() || <span className="text-ink-3">—</span>, meta: { hideBelow: 'lg' } }),
  c.accessor('jobTitle', { header: 'Job title', cell: (info) => info.getValue() || <span className="text-ink-3">—</span>, meta: { hideBelow: '2xl' } }),
  c.accessor('result', {
    header: 'Result',
    cell: (info) => {
      const row = info.row.original
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Badge tone={row.result === 'new' ? 'ok' : row.result === 'duplicate' ? 'neutral' : 'bad'}>{row.result === 'new' ? 'Create' : row.result === 'duplicate' ? 'Skip' : 'Error'}</Badge>
          {row.result !== 'new' && <span className="text-xs text-ink-3">{row.message.replace(/^Skip: /, '')}</span>}
        </div>
      )
    },
  }),
]
const getRowId = (row: ImportRow) => String(row.row)

function ImportPage() {
  usePageTitle('Import employees')
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; size: number; csv: string } | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [dragging, setDragging] = useState(false)
  const [done, setDone] = useState<ImportPreview | null>(null)

  const check = useMutation({ mutationFn: (csv: string) => api.post<ImportPreview>('/employees/import/preview', { csv }), onSuccess: setPreview })
  const run = useWrite((csv: string) => api.post<ImportPreview>('/employees/import', { csv }), { onSuccess: (result) => setDone(result) })
  const table = useGrid({ data: (done ?? preview)?.rows ?? [], columns, getRowId, pageSize: 50, resetKey: done ?? preview })

  async function choose(chosen: File | undefined) {
    if (!chosen) return
    setDone(null)
    const csv = await chosen.text()
    setFile({ name: chosen.name, size: chosen.size, csv })
    check.mutate(csv)
  }

  const columnsInfo = (done ?? preview)?.columns ?? [
    { name: 'employee_id', required: true, found: null },
    { name: 'first_name', required: true, found: null },
    { name: 'last_name', required: true, found: null },
    { name: 'department', required: false, found: null },
    { name: 'job_title', required: false, found: null },
  ]
  const shown = done ?? preview
  const toCreate = preview?.summary.create ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/employees" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Employees
        </Link>
        <div className="mt-3">
          <PageHeader title="Import employees from CSV" description="Existing employees are matched on employee_id and skipped, never updated or duplicated. Re-running the same file is safe." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-5 p-5 self-start">
          <label
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void choose(event.dataTransfer.files[0])
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-control border border-dashed px-4 py-7 text-center transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-canvas hover:border-ink-4',
            )}
          >
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void choose(event.target.files?.[0])} />
            {file ? <FileSpreadsheet className="size-6 text-accent" aria-hidden /> : <FileUp className="size-6 text-ink-3" aria-hidden />}
            <span className="text-sm font-medium">{file ? file.name : 'Drop a .csv file here'}</span>
            <span className="text-xs text-ink-3">{file ? `${(file.size / 1024).toFixed(1)} KB. Choose another to replace it.` : 'or click to choose one'}</span>
          </label>

          <div>
            <h2 className="text-sm font-semibold">Columns</h2>
            <ul className="mt-2 divide-y divide-line">
              {columnsInfo.map((column) => (
                <li key={column.name} className="flex items-center gap-3 py-2">
                  <Mono className="font-medium">{column.name}</Mono>
                  <Badge tone={column.required ? 'accent' : 'neutral'} dot={false}>
                    {column.required ? 'required' : 'optional'}
                  </Badge>
                  <span className="ml-auto flex items-center gap-1 text-xs text-ink-3">
                    {shown ? (
                      column.found ? (
                        <>
                          <Check className="size-3.5 text-ok" aria-hidden /> column {column.found}
                        </>
                      ) : (
                        <span className={column.required ? 'font-medium text-bad' : undefined}>not found</span>
                      )
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="rounded-control bg-sunken px-3.5 py-3 text-sm leading-5 text-ink-2">
            A UTF-8 byte-order mark from Excel is stripped automatically. Bad rows are reported by row number and skipped; the rest of the file still imports. One audit entry is written for each employee created.
          </p>

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              loading={run.isPending}
              disabledReason={done ? 'This file has been imported.' : !preview ? 'Choose a file first.' : toCreate === 0 ? 'Nothing new to create.' : undefined}
              onClick={() => file && run.mutate(file.csv)}
            >
              {toCreate > 0 && !done ? `Import ${plural(toCreate, 'new employee')}` : 'Import'}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                downloadCsv('employees-template.csv', ['employee_id', 'first_name', 'last_name', 'department', 'job_title'], [['E-1001', 'Ada', 'Lovelace', 'IT', 'Systems Analyst']])
              }
            >
              Download a template
            </Button>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          {done && (
            <Alert tone="ok" title={`Imported ${plural(done.created ?? 0, 'new employee')}`} action={<Link to="/employees"><Button size="sm">View employees</Button></Link>}>
              Skipped {plural(done.summary.duplicates, 'duplicate')}. {plural(done.summary.errors, 'row')} had errors and were left out.
            </Alert>
          )}
          {check.isError && (
            <Alert tone="bad" title="Could not read that file">
              {check.error.message}
            </Alert>
          )}
          {shown?.headerError && (
            <Alert tone="bad" title="This file can't be imported yet">
              {shown.headerError} Add the column to the header row and choose the file again.
            </Alert>
          )}

          {shown && !shown.headerError ? (
            <>
              <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-panel border border-line bg-surface px-5 py-4 shadow-panel">
                {[
                  { label: 'Rows read', value: shown.summary.read, tone: 'text-ink' },
                  { label: done ? 'Created' : 'Will create', value: done ? (done.created ?? 0) : shown.summary.create, tone: 'text-ok' },
                  { label: 'Duplicates skipped', value: shown.summary.duplicates, tone: 'text-ink-2' },
                  { label: 'Errors', value: shown.summary.errors, tone: shown.summary.errors ? 'text-bad' : 'text-ink-2' },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-2">
                    <dd className={cn('order-1 text-xl font-semibold tabular-nums', stat.tone)}>{stat.value}</dd>
                    <dt className="order-2 text-sm text-ink-3">{stat.label}</dt>
                  </div>
                ))}
              </dl>
              <DataGrid table={table} label="Row-by-row preview" noun="rows" loading={check.isPending} empty={<EmptyState icon={TriangleAlert} title="The file has no data rows" description="The header is row 1. Add employees below it." />} />
            </>
          ) : (
            !shown?.headerError && (
              <Panel>
                <EmptyState
                  icon={FileSpreadsheet}
                  title={check.isPending ? 'Reading the file…' : 'Preview appears here'}
                  description="Choose your HR export. Every row is checked and shown below before anything is written."
                />
              </Panel>
            )
          )}
        </div>
      </div>
    </div>
  )
}
