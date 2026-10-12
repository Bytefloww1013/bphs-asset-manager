import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import type { Dataset } from '@/lib/exports.ts'

/** The CSV of a list, from the page that shows it. The Import/Export page has the same file, and as Excel too. */
export function ExportButton<T>({ dataset, items }: { dataset: Dataset<T>; items: T[] }) {
  return (
    <Button icon={<Download className="size-4" />} disabled={items.length === 0} onClick={() => void dataset.save(items, 'csv')}>
      Export CSV
    </Button>
  )
}
