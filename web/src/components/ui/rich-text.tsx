import { lazy, Suspense } from 'react'
import { cn } from '@/lib/cn.ts'
import type { RichTextEditorProps } from './rich-text-editor.tsx'

// The editor brings Tiptap with it (about 125 kB gzipped), so it is fetched only when a page shows one.
const Editor = lazy(() => import('./rich-text-editor.tsx'))

/** The rich-text field: a fixed bar with every allowed format above the text. Works as the child of a `Field`. */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div aria-busy className="h-80 animate-pulse-soft rounded-control border border-line-strong bg-sunken" />
      }
    >
      <Editor {...props} />
    </Suspense>
  )
}

/** Shows a stored body. `html` must be what the server sanitised and stored, never text straight from a form or an editor. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return <div className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
