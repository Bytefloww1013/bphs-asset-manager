import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Archive, ArchiveRestore, CheckCheck, Inbox, Mail, MailOpen } from 'lucide-react'
import type { NotificationRow } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState, Spinner } from '@/components/ui/feedback.tsx'
import { FilterTabs } from '@/components/ui/form.tsx'
import { PageHeader, Panel } from '@/components/ui/layout.tsx'
import { Menu, type MenuItem } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { NotificationLine, useOpenNotification } from '@/features/notifications/parts.tsx'
import { api } from '@/lib/api.ts'
import { notificationsQuery, type NotificationView } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

const VIEWS = ['unread', 'all', 'archived'] as const satisfies NotificationView[]
const VIEW_LABEL: Record<NotificationView, string> = { unread: 'Unread', all: 'All', archived: 'Archived' }
const EMPTY: Record<NotificationView, string> = { unread: 'Nothing unread', all: 'No notifications', archived: 'Nothing archived' }

export const Route = createFileRoute('/_app/me/inbox')({
  // All is where the page starts, so it is the one view the address does not name.
  validateSearch: (search: Record<string, unknown>): { view?: NotificationView } => ({
    view: VIEWS.includes(search.view as NotificationView) && search.view !== 'all' ? (search.view as NotificationView) : undefined,
  }),
  component: InboxPage,
})

function InboxPage() {
  usePageTitle('Inbox')
  const view = Route.useSearch({ select: (search) => search.view ?? 'all' })
  const navigate = useNavigate({ from: Route.fullPath })
  const list = useInfiniteQuery(notificationsQuery(view))
  const readAll = useWrite(() => api.post('/me/notifications/read-all'), { success: 'All marked read' })
  const rows = list.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inbox"
        description="Notifications about things that involve you."
        actions={
          <Button loading={readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck className="size-4" aria-hidden /> Mark all read
          </Button>
        }
      />

      <div>
        <FilterTabs
          label="Show"
          value={view}
          onChange={(next) => void navigate({ search: { view: next === 'all' ? undefined : next } })}
          options={VIEWS.map((value) => ({ value, label: VIEW_LABEL[value] }))}
        />
      </div>

      <Panel>
        {list.isError ? (
          <EmptyState icon={Inbox} title="Notifications could not be loaded" description="Try again in a moment." />
        ) : list.isPending ? (
          <div className="flex justify-center py-14">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title={EMPTY[view]} />
        ) : (
          <ul aria-label={`${VIEW_LABEL[view]} notifications`} className="divide-y divide-line">
            {rows.map((row) => (
              <InboxRow key={row.id} row={row} />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="flex justify-center border-t border-line p-3">
            <Button variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              Show more
            </Button>
          </div>
        )}
      </Panel>
    </div>
  )
}

function InboxRow({ row }: { row: NotificationRow }) {
  const openRow = useOpenNotification()
  const act = useWrite((action: 'read' | 'unread' | 'archive' | 'unarchive') => api.post(`/me/notifications/${row.id}/${action}`))
  const items: MenuItem[] = [
    row.readAt ? { label: 'Mark unread', icon: Mail, onSelect: () => act.mutate('unread') } : { label: 'Mark read', icon: MailOpen, onSelect: () => act.mutate('read') },
    row.archivedAt
      ? { label: 'Unarchive', icon: ArchiveRestore, onSelect: () => act.mutate('unarchive') }
      : { label: 'Archive', icon: Archive, onSelect: () => act.mutate('archive') },
  ]
  return (
    <li className="flex items-start">
      <button
        type="button"
        onClick={() => openRow(row)}
        className="flex min-w-0 flex-1 gap-3 py-3 pl-5 pr-3 text-left transition-colors hover:bg-sunken/60 focus-visible:-outline-offset-2"
      >
        <NotificationLine row={row} />
      </button>
      <div className="py-2.5 pr-3">
        <Menu label={`Actions for ${row.title}`} items={items} />
      </div>
    </li>
  )
}
