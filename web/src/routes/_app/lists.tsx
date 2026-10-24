import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/ui/layout.tsx'
import { usePageTitle } from '@/lib/session.ts'
import { listEditors } from '@/registry.ts'

export const Route = createFileRoute('/_app/lists')({
  loader: ({ context }) =>
    Promise.all(listEditors().flatMap((editor) => (editor.load ? [editor.load(context.queryClient)] : []))),
  component: ListsPage,
})

/** Every module's lookup lists (`listEditors()`), in registry order: the main ones on the left, the `side` ones on the right. */
function ListsPage() {
  usePageTitle('Lists')
  const editors = listEditors()
  const column = (side: boolean) => (
    <div className="flex min-w-0 flex-col gap-6">
      {editors
        .filter((editor) => (editor.column === 'side') === side)
        .map(({ key, component: Editor }) => (
          <Editor key={key} />
        ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lists"
        description="The choices offered when adding physical and digital assets and recording condition. Deactivate instead of deleting anything that is in use."
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {column(false)}
        {column(true)}
      </div>
    </div>
  )
}
