import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Bell, Inbox } from 'lucide-react'
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_KEYS } from '@shared/constants.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState, Spinner } from '@/components/ui/feedback.tsx'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { MutedThing } from '@/features/notifications/parts.tsx'
import { api } from '@/lib/api.ts'
import { formatDateTime } from '@/lib/format.ts'
import { mutesQuery } from '@/lib/queries.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/_app/me/notifications')({ component: NotificationSettingsPage })

const NEVER_MUTED = NOTIFICATION_KIND_KEYS.filter((kind) => NOTIFICATION_KINDS[kind].unmutable)

function NotificationSettingsPage() {
  usePageTitle('Notification settings')
  const { data: mutes, isError } = useQuery(mutesQuery)
  const unmute = useWrite((id: number) => api.delete(`/me/mutes/${id}`), { success: 'Unmuted' })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notification settings"
        description="A muted notification still arrives in your Inbox, but it does not add to the red count on the bell or show as new."
        actions={
          <Link to="/me/inbox" className={buttonStyles()}>
            <Inbox className="size-4" aria-hidden /> Inbox
          </Link>
        }
      />

      <Panel>
        <PanelHeader title="Muted" description="Mute from the menu on any notification in your Inbox." />
        {isError ? (
          <EmptyState icon={Bell} title="Mutes could not be loaded" description="Try again in a moment." className="border-t border-line" />
        ) : !mutes ? (
          <div className="flex justify-center border-t border-line py-10">
            <Spinner />
          </div>
        ) : mutes.length === 0 ? (
          <EmptyState icon={Bell} title="Nothing is muted" className="border-t border-line" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {mutes.map((mute) => (
              <li key={mute.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0">
                  <MutedThing kind={mute.kind} about={mute.sourceKey === null ? null : (mute.about ?? mute.sourceKey)} />
                  <p className="mt-0.5 text-xs text-ink-3">{mute.until ? `Until ${formatDateTime(mute.until)}` : 'Until you change it'}</p>
                </div>
                <Button
                  size="sm"
                  aria-label={`Unmute ${NOTIFICATION_KINDS[mute.kind].label}${mute.sourceKey === null ? '' : `: ${mute.about ?? mute.sourceKey}`}`}
                  loading={unmute.isPending && unmute.variables === mute.id}
                  onClick={() => unmute.mutate(mute.id)}
                >
                  Unmute
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Never muted"
          description="These always count on the bell: changes to your account, so you would notice one you did not expect, and notices from Super Admins, which are sent for everyone to read."
        />
        <ul className="flex flex-col gap-1 border-t border-line px-5 py-4 text-sm text-ink">
          {NEVER_MUTED.map((kind) => (
            <li key={kind}>{NOTIFICATION_KINDS[kind].label}</li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
