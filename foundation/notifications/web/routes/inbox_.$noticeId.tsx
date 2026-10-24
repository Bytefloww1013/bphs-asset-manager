import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, Megaphone } from 'lucide-react'
import { useEffect } from 'react'
import { buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState, Spinner } from '@/components/ui/feedback.tsx'
import { Panel } from '@/components/ui/layout.tsx'
import { ApiError } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { usePageTitle } from '@/lib/session.ts'
import { noticeQuery } from '../queries.ts'

// Not nested in the Inbox page: a notice's full text replaces the list.
export const Route = createFileRoute('/_app/me/inbox_/$noticeId')({ component: NoticePage })

function NoticePage() {
  const id = Number(Route.useParams({ select: (params) => params.noticeId }))
  const notice = useQuery(noticeQuery(id))
  usePageTitle(notice.data?.title ?? 'Notice')
  const queryClient = useQueryClient()
  // The server marks the notice read as it is fetched, so the bell and the Inbox are behind until they refresh.
  useEffect(() => {
    if (notice.isSuccess) void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }, [notice.isSuccess, queryClient])

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/me/inbox" className="inline-flex items-center gap-1 text-sm font-medium text-ink-3 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Inbox
        </Link>
        {notice.data && (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">
              {notice.data.title}
            </h1>
            <p className="mt-1 text-sm text-ink-3">
              Notice from {notice.data.sentBy} ·{' '}
              <time dateTime={notice.data.createdAt}>{formatDateTime(notice.data.createdAt)}</time>
            </p>
          </>
        )}
      </div>
      {notice.isError ? (
        <Panel>
          <EmptyState
            icon={Megaphone}
            title={
              notice.error instanceof ApiError && notice.error.status === 404
                ? 'This notice is not in your Inbox'
                : 'The notice could not be loaded'
            }
            description={
              notice.error instanceof ApiError && notice.error.status === 404
                ? 'It was not sent to you, or it is over a year old.'
                : 'Try again in a moment.'
            }
            action={
              <Link to="/me/inbox" className={buttonStyles('primary')}>
                Back to Inbox
              </Link>
            }
          />
        </Panel>
      ) : !notice.data ? (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      ) : (
        <Panel className="px-5 py-4">
          <p className="whitespace-pre-line text-md text-ink [overflow-wrap:anywhere]">{notice.data.body}</p>
        </Panel>
      )}
    </div>
  )
}
