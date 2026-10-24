import type { QueryClient } from '@tanstack/react-query'
import { downloadTable, type FileFormat, type SheetCell } from './spreadsheet.ts'

interface Spec<T> {
  /** What the screens call the records, and the name of the sheet in a workbook. */
  label: string
  description: string
  /** The file's name, without its extension. */
  filename: string
  headers: string[]
  row: (item: T) => SheetCell[]
  load: (queryClient: QueryClient) => Promise<T[]>
  /** Its place on the Export tab: lower first. Ties keep registry order. */
  order?: number
}

export interface Dataset<T> extends Spec<T> {
  /** Save rows the page already has. */
  save: (items: T[], format: FileFormat) => Promise<void>
  /** Fetch every record as it is now, and save that. */
  fetchAndSave: (queryClient: QueryClient, format: FileFormat) => Promise<number>
}

/**
 * An export: a module builds its own from its rows, and lists it in its `web/module.ts`. One definition per export, so a
 * file is the same wherever it is downloaded from.
 */
export function defineDataset<T>(spec: Spec<T>): Dataset<T> {
  const save = (items: T[], format: FileFormat) =>
    downloadTable(format, spec.filename, spec.headers, items.map(spec.row), spec.label)
  return {
    ...spec,
    save,
    async fetchAndSave(queryClient, format) {
      const items = await spec.load(queryClient)
      await save(items, format)
      return items.length
    },
  }
}
