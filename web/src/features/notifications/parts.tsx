import * as Popover from '@radix-ui/react-popover'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { NOTIFICATION_KINDS, isInAppPath } from '@shared/constants.ts'
import { canUseWorkspace } from '@shared/permissions.ts'
import type { NotificationRow } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Spinner } from '@/components/ui/feedback.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { api } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { formatDateTime, formatRelative } from '@/lib/format.ts'
import { latestNotificationsQuery, notificationCountQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'
import { areaOf } from '@/lib/workspace.ts'

/** The red count: hidden at 0, and 99+ past 99. */
export function UnreadBadge({ count, className }: { count: number | undefined; className?: string }) {
  if (!count) return null
  return (
    <span className={cn('inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-bad px-1 text-[0.6875rem] font-semibold leading-none tabular-nums text-white', className)}>
      {count > 99 ? '99+' : count}
      <span className="sr-only"> unread</span>
    </span>
  )
}

/** Marks a notification read and follows its link, when it leads somewhere this account can open. */
export function useOpenNotification() {
  const router = useRouter()
  const user = useUser()
  const read = useWrite((id: number) => api.post(`/me/notifications/${id}/read`))
  return (row: NotificationRow) => {
    if (!row.readAt) read.mutate(row.id)
    // Checked here as well as when it was written, so a notification can never send anyone off-site.
    if (!isInAppPath(row.link)) return
    // A holder without Assets access is still told about the asset issued to them; its page would only turn them away.
    const area = areaOf(row.link)
    if (area === 'me' || canUseWorkspace(user, area)) void router.navigate({ href: row.link })
  }
}

/** One notification's text. */
export function NotificationLine({ row }: { row: NotificationRow }) {
  const highlight = !row.readAt
  return (
    <>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', highlight && 'bg-accent')} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm [overflow-wrap:anywhere]', highlight ? 'font-semibold text-ink' : 'text-ink-2')}>
          {!row.readAt && <span className="sr-only">Unread: </span>}
          {row.title}
        </span>
        {row.body && <span className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-ink-3 [overflow-wrap:anywhere]">{row.body}</span>}
        <span className="mt-0.5 block text-xs text-ink-3">
          {NOTIFICATION_KINDS[row.kind].label} ·{' '}
          <time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>
            {formatRelative(row.createdAt)}
          </time>
        </span>
      </span>
    </>
  )
}

/** The bell, with its red count, and a popover of the latest few. */
export function NotificationBell({ align }: { align: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useQuery(notificationCountQuery)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className={buttonStyles('ghost', 'md', 'relative size-9 p-0 data-[state=open]:bg-sunken data-[state=open]:text-ink')}
      >
        <Bell className="size-5" aria-hidden />
        <UnreadBadge count={unread} className="absolute -right-1 -top-1" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label="Notifications"
          // The popover itself takes focus, not its first button: Enter straight after opening would mark everything read.
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement
            event.preventDefault()
            content.focus()
          }}
          className="z-[60] flex w-96 max-w-[calc(100vw-24px)] animate-pop-in flex-col rounded-panel border border-line bg-surface shadow-pop focus-visible:outline-none"
        >
          <Latest onDone={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Drawn only while the popover is open, so each opening fetches the list afresh. */
function Latest({ onDone }: { onDone: () => void }) {
  const { data, isError } = useQuery(latestNotificationsQuery)
  const openRow = useOpenNotification()
  const readAll = useWrite(() => api.post('/me/notifications/read-all'))
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line py-2 pl-4 pr-2">
        <h2 className="text-md font-semibold text-ink">Notifications</h2>
        <Button variant="ghost" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>
          Mark all read
        </Button>
      </div>
      {isError ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">Notifications could not be loaded. Try again in a moment.</p>
      ) : !data ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : data.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-3">Nothing here yet.</p>
      ) : (
        <ul className="max-h-[min(28rem,60dvh)] overflow-y-auto py-1">
          {data.items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  onDone()
                  openRow(row)
                }}
                className="flex w-full gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:-outline-offset-2"
              >
                <NotificationLine row={row} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line p-1.5">
        <Link to="/me/inbox" onClick={onDone} className={buttonStyles('ghost', 'sm', 'w-full')}>
          See all
        </Link>
      </div>
    </>
  )
}
