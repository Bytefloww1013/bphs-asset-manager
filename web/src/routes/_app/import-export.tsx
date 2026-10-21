import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Download, FileSpreadsheet, FileUp, ScrollText, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { IMPORTERS, IMPORT_TYPES, autoMap, type ImportType, type Importer } from '@shared/importers.ts'
import { canAt, needsAccess } from '@shared/permissions.ts'
import { IMPORT_MAX_CELL, IMPORT_MAX_ROWS, type ImportInput } from '@shared/schemas.ts'
import type { ImportPreview, ImportRow } from '@shared/types.ts'
import { DataGrid } from '@/components/data-grid/data-grid.tsx'
import { columnsFor, useGrid } from '@/components/data-grid/grid.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, EmptyState, useToast } from '@/components/ui/feedback.tsx'
import { Field, FilterTabs, Select } from '@/components/ui/form.tsx'
import { Mono, PageHeader, Panel, PanelHeader, Toolbar } from '@/components/ui/layout.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { EXPORTS, type ExportKey } from '@/lib/exports.ts'
import { plural } from '@/lib/format.ts'
import { usePageTitle, useUser } from '@/lib/session.ts'
import { UnreadableFile, downloadCsv, downloadTable, readTable, type FileFormat } from '@/lib/spreadsheet.ts'

type View = 'import' | 'export'

export const Route = createFileRoute('/_app/import-export')({
  validateSearch: (search: Record<string, unknown>): { view?: 'export'; type?: ImportType } => ({
    view: search.view === 'export' ? 'export' : undefined,
    type: IMPORT_TYPES.find((type) => type === search.type),
  }),
  component: ImportExportPage,
})

function ImportExportPage() {
  usePageTitle('Import/Export')
  const { view = 'import', type = 'employees' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Import/Export"
        description="Bring employees and programs in from a spreadsheet, or take any list out as a CSV or Excel file. An import only adds records: it never changes one that exists, and never issues anything."
      />
      <FilterTabs<View>
        label="Import or export"
        value={view}
        onChange={(next) =>
          void navigate({ search: (old) => ({ ...old, view: next === 'export' ? 'export' : undefined }) })
        }
        options={[
          { value: 'import', label: 'Import' },
          { value: 'export', label: 'Export' },
        ]}
      />
      {view === 'export' ? (
        <ExportSection />
      ) : (
        // A different record type is a different import: nothing read or mapped for one carries over to another.
        <ImportSection
          key={type}
          type={type}
          onType={(next) => void navigate({ search: (old) => ({ ...old, type: next }) })}
        />
      )}
    </div>
  )
}

// ---- Import -----------------------------------------------------------------------

interface ChosenFile {
  name: string
  size: number
  headers: string[]
  /** Data rows that hold anything, each with its number in the file (the header is row 1). */
  rows: { row: number; cells: string[] }[]
}

type Mapping = Record<string, number | null>
type Show = 'all' | 'problems'

/** A, B, … Z, AA: the letter Excel shows above a column. */
function columnLetter(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  return letters
}

const blank = <span className="text-ink-3">—</span>
const getRowId = (row: ImportRow) => String(row.row)

function previewColumns(importer: Importer) {
  const c = columnsFor<ImportRow>()
  return [
    c.accessor('row', {
      header: 'Row',
      cell: (info) => <Mono className="text-ink-3">{info.getValue()}</Mono>,
      meta: { align: 'right', width: 'w-16' },
    }),
    // What will happen to the row comes before what is in it, so it is never the column scrolled out of sight.
    c.accessor('result', {
      header: 'Result',
      cell: (info) => {
        const row = info.row.original
        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Badge tone={row.result === 'new' ? 'ok' : row.result === 'duplicate' ? 'neutral' : 'bad'}>
              {row.result === 'new' ? 'New' : row.result === 'duplicate' ? 'Duplicate' : 'Error'}
            </Badge>
            {row.result !== 'new' && (
              <span className="text-xs text-ink-3">{row.message.replace(/^(Skip|Row \d+): /, '')}</span>
            )}
          </div>
        )
      },
    }),
    ...importer.fields.map((field, i) =>
      c.accessor((row) => row.values[field.key] ?? '', {
        id: field.key,
        header: field.label,
        cell: (info) =>
          info.getValue() ? (
            field.key === importer.duplicateKey ? (
              <Mono className="whitespace-nowrap">{info.getValue()}</Mono>
            ) : (
              <span className="block max-w-64 truncate" title={info.getValue()}>
                {info.getValue()}
              </span>
            )
          ) : (
            blank
          ),
        meta: i < 1 ? {} : { hideBelow: i < 3 ? 'md' : 'xl' },
      }),
    ),
  ]
}

function ImportSection({ type, onType }: { type: ImportType; onType: (type: ImportType) => void }) {
  const importer: Importer = IMPORTERS[type]
  const user = useUser()
  const input = useRef<HTMLInputElement>(null)
  // Counts the files chosen and the mappings tried, so an answer about an earlier one is dropped when it arrives late.
  const latest = useRef(0)
  const [file, setFile] = useState<ChosenFile | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [readError, setReadError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [done, setDone] = useState<ImportPreview | null>(null)
  const [dragging, setDragging] = useState(false)
  const [show, setShow] = useState<Show>('all')

  const check = useMutation({
    mutationFn: (body: ImportInput) => api.post<ImportPreview>(`/import/${type}/preview`, body),
  })
  const run = useWrite((body: ImportInput) => api.post<ImportPreview>(`/import/${type}`, body), {
    onSuccess: (result) => {
      setDone(result)
      // What the person needs next is what did not go in.
      setShow(result.summary.errors > 0 ? 'problems' : 'all')
    },
  })

  const shown = done ?? preview
  const columns = useMemo(() => previewColumns(importer), [importer])
  const rows = useMemo(
    () => (show === 'problems' ? (shown?.rows ?? []).filter((row) => row.result !== 'new') : (shown?.rows ?? [])),
    [shown, show],
  )
  const table = useGrid({
    data: rows,
    columns,
    getRowId,
    pageSize: 50,
    resetKey: `${show}:${done ? 'done' : 'preview'}:${latest.current}`,
  })

  const unmapped = importer.fields.filter((field) => field.required && mapping[field.key] == null)

  /** The rows as the server wants them: text keyed by field. A cell too long for any field is cut, and still fails for its row. */
  const payload = (from: ChosenFile, map: Mapping): ImportInput => ({
    rows: from.rows.map(({ row, cells }) => ({
      row,
      values: Object.fromEntries(
        importer.fields.flatMap((field) =>
          map[field.key] == null ? [] : [[field.key, (cells[map[field.key]!] ?? '').trim().slice(0, IMPORT_MAX_CELL)]],
        ),
      ),
    })),
  })

  function recheck(from: ChosenFile, map: Mapping) {
    const mine = ++latest.current
    setPreview(null)
    setDone(null)
    setShow('all')
    check.reset()
    if (importer.fields.some((field) => field.required && map[field.key] == null)) return
    check.mutate(payload(from, map), {
      onSuccess: (result) => {
        if (mine === latest.current) setPreview(result)
      },
    })
  }

  async function choose(chosen: File | undefined) {
    if (!chosen) return
    const mine = ++latest.current
    // Import sends the file chosen last, so rows read from an earlier one must not stay on offer while this one is read, or if it cannot be.
    setFile(null)
    setPreview(null)
    setDone(null)
    setReadError(null)
    check.reset()
    setReading(true)
    try {
      const sheet = await readTable(chosen)
      if (mine !== latest.current) return
      const headers = (sheet[0] ?? []).map((header) => header.trim())
      const data = sheet
        .slice(1)
        .flatMap((cells, i) => (cells.some((cell) => cell.trim() !== '') ? [{ row: i + 2, cells }] : []))
      if (headers.every((header) => header === ''))
        throw new UnreadableFile('That file has no header row. The first row must name the columns.')
      if (data.length === 0) throw new UnreadableFile('That file has a header row and nothing under it.')
      if (data.length > IMPORT_MAX_ROWS) {
        throw new UnreadableFile(
          `That file has ${data.length.toLocaleString()} rows. One import takes at most ${IMPORT_MAX_ROWS.toLocaleString()}: split it into smaller files.`,
        )
      }
      const next = { name: chosen.name, size: chosen.size, headers, rows: data }
      const map = autoMap(importer, headers)
      setFile(next)
      setMapping(map)
      recheck(next, map)
    } catch (error) {
      if (mine !== latest.current) return
      setReadError(
        error instanceof UnreadableFile ? error.message : 'That file could not be read. Choose a .csv or .xlsx file.',
      )
    } finally {
      // An input that still holds a file does not fire change when that file is chosen again, which is what fixing a file means.
      if (input.current) input.current.value = ''
      if (mine === latest.current) setReading(false)
    }
  }

  function remap(key: string, value: string) {
    if (!file) return
    const next = { ...mapping, [key]: value === '' ? null : Number(value) }
    setMapping(next)
    recheck(file, next)
  }

  const template = (format: FileFormat) =>
    void downloadTable(
      format,
      `${type}-template`,
      importer.fields.map((field) => field.label),
      [importer.fields.map((field) => field.example)],
      importer.label,
    )

  const failed = done?.rows.filter((row) => row.result === 'error') ?? []
  const toCreate = preview?.summary.create ?? 0
  const problems = shown ? shown.summary.duplicates + shown.summary.errors : 0
  const blocked = !canAt(user, importer.section, 'edit')
    ? needsAccess(importer.section, 'edit')
    : done
      ? 'This file has been imported. Choose another to import more.'
      : !file
        ? 'Choose a file first.'
        : unmapped.length > 0
          ? `Say which column holds ${unmapped.map((field) => field.label).join(', ')}.`
          : !preview
            ? 'The rows are still being checked.'
            : toCreate === 0
              ? 'Nothing new to create.'
              : undefined

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <Panel className="flex flex-col gap-5 self-start p-5">
        <Field label="What are you importing?">
          <Select value={type} onChange={(event) => onType(event.target.value as ImportType)}>
            {IMPORT_TYPES.map((key) => (
              <option key={key} value={key}>
                {IMPORTERS[key].label}
              </option>
            ))}
          </Select>
        </Field>

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
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
          {file ? (
            <FileSpreadsheet className="size-6 text-accent" aria-hidden />
          ) : (
            <FileUp className="size-6 text-ink-3" aria-hidden />
          )}
          <span className="max-w-full truncate text-sm font-medium">
            {file ? file.name : reading ? 'Reading the file…' : 'Drop a .csv or .xlsx file here'}
          </span>
          <span className="text-xs text-ink-3">
            {file
              ? `${(file.size / 1024).toFixed(1)} KB, ${plural(file.rows.length, 'row')}. Choose another to replace it.`
              : 'or click to choose one'}
          </span>
        </label>

        <div>
          <h2 className="text-sm font-semibold">Columns</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {file
              ? 'Matched from the first row of your file. Change any that are wrong.'
              : 'The first row of the file names its columns. They are matched to these fields for you.'}
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {importer.fields.map((field) => {
              const missing = !!file && field.required && mapping[field.key] == null
              return (
                <li key={field.key}>
                  {file ? (
                    <Field
                      label={field.label}
                      optional={!field.required}
                      error={missing ? 'Required. Choose the column that holds it.' : undefined}
                    >
                      <Select
                        value={mapping[field.key] ?? ''}
                        disabled={!!done}
                        onChange={(event) => remap(field.key, event.target.value)}
                      >
                        <option value="">Not in this file</option>
                        {file.headers.map((header, i) => (
                          <option key={i} value={i}>
                            {columnLetter(i)} · {header || '(no header)'}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{field.label}</span>
                      <Badge tone={field.required ? 'accent' : 'neutral'} dot={false}>
                        {field.required ? 'required' : 'optional'}
                      </Badge>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <p className="rounded-control bg-sunken px-3.5 py-3 text-sm leading-5 text-ink-2">
          The file is read on this computer and only its rows are sent. A row whose {importer.fields[0]!.label} already
          exists is skipped, never updated, so importing the same file twice is safe. One audit entry is written for
          each {importer.singular} created.
        </p>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            loading={run.isPending}
            disabledReason={blocked}
            onClick={() => file && run.mutate(payload(file, mapping))}
          >
            {toCreate > 0 && !done ? `Import ${plural(toCreate, `new ${importer.singular}`)}` : 'Import'}
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-ink-3">
            <span>Template:</span>
            <Button variant="ghost" size="sm" onClick={() => template('csv')}>
              CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => template('xlsx')}>
              Excel
            </Button>
          </div>
        </div>
      </Panel>

      <div className="flex min-w-0 flex-col gap-4">
        {done && (
          <Alert
            tone={done.summary.errors > 0 ? 'warn' : 'ok'}
            title={`${plural(done.created ?? 0, importer.singular)} imported, ${plural(done.summary.duplicates, 'duplicate')} skipped, ${done.summary.errors.toLocaleString()} failed`}
            action={
              failed.length > 0 ? (
                <Button
                  size="sm"
                  icon={<Download className="size-4" />}
                  onClick={() =>
                    downloadCsv(
                      `${type}-failed-rows.csv`,
                      ['Row', ...importer.fields.map((field) => field.label), 'Problem'],
                      failed.map((row) => [
                        row.row,
                        ...importer.fields.map((field) => row.values[field.key]),
                        row.message.replace(/^Row \d+: /, ''),
                      ]),
                    )
                  }
                >
                  Failed rows (CSV)
                </Button>
              ) : (
                <Link
                  to={type === 'employees' ? '/employees' : '/programs'}
                  className={buttonStyles('secondary', 'sm')}
                >
                  View {importer.label.toLowerCase()}
                </Link>
              )
            }
          >
            {failed.length > 0
              ? 'The failed rows are listed below. Download them, fix them, and import that file: nothing already imported will be touched.'
              : 'Every row that could be created was.'}
          </Alert>
        )}
        {readError && (
          <Alert tone="bad" title="That file can't be imported">
            {readError}
          </Alert>
        )}
        {check.isError && (
          <Alert tone="bad" title="The rows could not be checked">
            {check.error.message}
          </Alert>
        )}
        {file && unmapped.length > 0 && (
          <Alert tone="warn" title="Some required columns were not found">
            Nothing in the file's first row looks like {unmapped.map((field) => field.label).join(', ')}. Choose the
            column for each on the left and the rows will be checked.
          </Alert>
        )}

        {shown ? (
          <>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-panel border border-line bg-surface px-5 py-4 shadow-panel">
              {[
                { label: 'Rows read', value: shown.summary.read, tone: 'text-ink' },
                {
                  label: done ? 'Created' : 'New',
                  value: done ? (done.created ?? 0) : shown.summary.create,
                  tone: 'text-ok',
                },
                {
                  label: done ? 'Duplicates skipped' : 'Duplicates',
                  value: shown.summary.duplicates,
                  tone: 'text-ink-2',
                },
                {
                  label: done ? 'Failed' : 'Errors',
                  value: shown.summary.errors,
                  tone: shown.summary.errors ? 'text-bad' : 'text-ink-2',
                },
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-2">
                  <dd className={cn('order-1 text-xl font-semibold tabular-nums', stat.tone)}>
                    {stat.value.toLocaleString()}
                  </dd>
                  <dt className="order-2 text-sm text-ink-3">{stat.label}</dt>
                </div>
              ))}
            </dl>
            <Toolbar>
              <FilterTabs<Show>
                label="Filter rows"
                value={show}
                onChange={setShow}
                options={[
                  { value: 'all', label: 'All rows', count: shown.summary.read },
                  { value: 'problems', label: 'Problems only', count: problems },
                ]}
              />
            </Toolbar>
            <DataGrid
              table={table}
              label={done ? 'Row-by-row result' : 'Row-by-row preview'}
              noun="rows"
              empty={
                <EmptyState
                  icon={TriangleAlert}
                  title="No problems"
                  description="Every row in this file is new and valid."
                />
              }
            />
          </>
        ) : (
          <Panel>
            <EmptyState
              icon={FileSpreadsheet}
              title={reading ? 'Reading the file…' : check.isPending ? 'Checking the rows…' : 'Preview appears here'}
              description="Choose a CSV or Excel file. Every row is checked and shown here before anything is written."
            />
          </Panel>
        )}
      </div>
    </div>
  )
}

// ---- Export -----------------------------------------------------------------------

const EXPORT_ORDER: ExportKey[] = ['assets', 'digitalAssets', 'employees', 'programs', 'assignments']

function ExportSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function save(key: ExportKey, format: FileFormat) {
    setBusy(`${key}:${format}`)
    try {
      const count = await EXPORTS[key].fetchAndSave(queryClient, format)
      toast({
        title: `${EXPORTS[key].label} exported`,
        description: `${plural(count, 'row')} as ${format === 'csv' ? 'CSV' : 'Excel'}.`,
      })
    } catch (error) {
      toast({
        tone: 'bad',
        title: 'That export did not go through',
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel className="max-w-4xl">
      <PanelHeader
        title="Export a list"
        description="Each file holds every record as it is now, with who holds what. Excel cells are written as text, never as formulas."
      />
      <ul className="divide-y divide-line border-t border-line">
        {EXPORT_ORDER.map((key) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{EXPORTS[key].label}</h3>
              <p className="text-sm text-ink-3">{EXPORTS[key].description}</p>
            </div>
            <div className="flex items-center gap-2">
              {(['csv', 'xlsx'] as const).map((format) => (
                <Button
                  key={format}
                  size="sm"
                  icon={<Download className="size-4" />}
                  loading={busy === `${key}:${format}`}
                  disabled={busy !== null && busy !== `${key}:${format}`}
                  aria-label={`Export ${EXPORTS[key].label} as ${format === 'csv' ? 'CSV' : 'Excel'}`}
                  onClick={() => void save(key, format)}
                >
                  {format === 'csv' ? 'CSV' : 'Excel'}
                </Button>
              ))}
            </div>
          </li>
        ))}
        <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Audit Log</h3>
            <p className="text-sm text-ink-3">
              Exported from the Audit Log itself, so the file holds exactly the entries you filtered to.
            </p>
          </div>
          <Link to="/audit" className={buttonStyles('secondary', 'sm')}>
            <ScrollText className="size-4" aria-hidden />
            Open Audit Log
          </Link>
        </li>
      </ul>
    </Panel>
  )
}
