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

/**
 * Minimal RFC 4180 reader: quoted fields, doubled quotes, embedded newlines,
 * CRLF or LF, and the UTF-8 byte-order mark Excel prepends.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
