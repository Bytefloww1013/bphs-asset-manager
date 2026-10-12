/**
 * The byte-order mark that tells Excel a CSV file is UTF-8. Always written as an escape: the character itself is invisible, so
 * an editor or a formatter could drop a literal one from the source and nothing would show it.
 */
export const CSV_BOM = '\uFEFF'

type Cell = string | number | null | undefined

/** Quote a value for CSV output, neutralising spreadsheet formula injection. */
export function csvCell(value: Cell): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** A whole CSV as text, lines ending in CRLF. Put CSV_BOM in front of it when the file is meant for Excel. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
