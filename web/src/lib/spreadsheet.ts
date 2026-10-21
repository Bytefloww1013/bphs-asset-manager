import { CSV_BOM, parseCsv, toCsv } from '@shared/csv.ts'
import type { CellValue } from 'read-excel-file/browser'

export type SheetCell = string | number | null | undefined
export type FileFormat = 'csv' | 'xlsx'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
// Far past what 2,000 short rows come to; a file this size is the wrong file.
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** A file the page can say something useful about, in words meant for the person who chose it. */
export class UnreadableFile extends Error {}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** What a cell holds, as the text a person would read in it. */
function cellText(value: CellValue | null): string {
  if (value == null) return ''
  if (value instanceof Date) {
    // Excel keeps a date as a day count with no time zone; the reader hands it back as that day in UTC.
    const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
    const time =
      value.getUTCHours() || value.getUTCMinutes() ? ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}` : ''
    return day + time
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

/**
 * The first sheet of an .xlsx file, or a .csv file, as rows of text. The file never leaves the browser: only the rows the
 * person goes on to import are sent anywhere.
 */
export async function readTable(file: File): Promise<string[][]> {
  if (file.size > MAX_FILE_BYTES)
    throw new UnreadableFile('That file is larger than 5 MB. Split it into smaller files.')
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls'))
    throw new UnreadableFile(
      'The old .xls format cannot be read. Save the workbook as .xlsx or .csv and choose it again.',
    )
  if (!name.endsWith('.xlsx')) return parseCsv(await file.text())
  // Loaded only when a workbook is chosen, so no other page carries the reader.
  const { readSheet } = await import('read-excel-file/browser')
  try {
    const rows = await readSheet(file)
    return rows.map((row) => row.map(cellText))
  } catch {
    throw new UnreadableFile(
      'That file could not be read as an Excel workbook. Open it in Excel, save it again as .xlsx or .csv, and choose it again.',
    )
  }
}

/** Trigger a browser download of a CSV built in memory (Excel-friendly BOM, formula-safe cells). */
export function downloadCsv(filename: string, header: string[], rows: SheetCell[][]) {
  save(new Blob([CSV_BOM + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

export interface Sheet {
  /** At most 31 characters, as Excel allows. */
  name: string
  header: string[]
  rows: SheetCell[][]
}

// Excel will not open a file with a longer cell; a grievance body may hold 100,000 characters.
const MAX_CELL = 32_767
const CUT = ' […cut: Excel holds at most 32,767 characters in a cell]'
const fit = (text: string) => (text.length > MAX_CELL ? text.slice(0, MAX_CELL - CUT.length) + CUT : text)

/**
 * Tables as one workbook, a sheet each. Text goes in as text cells, never as formulas, so a value that starts with = is shown
 * as typed and needs no guard in front of it.
 */
export async function downloadWorkbook(filename: string, sheets: Sheet[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const blob = await writeXlsxFile(
    sheets.map(({ name, header, rows }) => ({
      sheet: name,
      data: [
        header.map((value) => ({ value, type: String, fontWeight: 'bold' as const })),
        ...rows.map((row) =>
          row.map((value) =>
            value == null || value === ''
              ? null
              : typeof value === 'number'
                ? { value, type: Number }
                : { value: fit(String(value)), type: String },
          ),
        ),
      ],
      columns: header.map((title, i) => {
        const longest = rows.reduce((max, row) => Math.max(max, String(row[i] ?? '').length), title.length)
        return { width: Math.min(Math.max(longest + 2, 10), 48) }
      }),
      stickyRowsCount: 1,
    })),
  ).toBlob()
  save(new Blob([blob], { type: XLSX_TYPE }), filename)
}

export function downloadTable(
  format: FileFormat,
  name: string,
  header: string[],
  rows: SheetCell[][],
  sheet = 'Sheet1',
) {
  return format === 'csv'
    ? Promise.resolve(downloadCsv(`${name}.csv`, header, rows))
    : downloadWorkbook(`${name}.xlsx`, [{ name: sheet, header, rows }])
}
