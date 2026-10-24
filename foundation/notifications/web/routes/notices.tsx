import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Lock, Megaphone } from 'lucide-react'
import { useRef, useState } from 'react'
import type { UserRow } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { MultiCombobox } from '@/components/ui/combobox.tsx'
import { Alert, EmptyState, Spinner, useToast } from '@/components/ui/feedback.tsx'
import { Field, Input, Segmented, Textarea } from '@/components/ui/form.tsx'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/layout.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { api } from '@/lib/api.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { formatDateTime } from '@/lib/format.ts'
import { useWrite } from '@/lib/hooks.ts'
import { usePageTitle, useUser } from '@/lib/session.ts'
import { usersQuery } from '@/lib/users.ts'
import {
  canSendNotices,
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  noticeSchema,
  type NoticeInput,
  type NoticeRow,
} from '../../shared/index.ts'
import { noticesQuery } from '../queries.ts'

export const Route = createFileRoute('/_app/me/notices')({ component: NoticesPage })

function NoticesPage() {
  usePageTitle('Notices')
  const user = useUser()
  const [writing, setWriting] = useState(false)
  if (!canSendNotices(user)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notices" />
        <Panel>
          <EmptyState
            icon={Lock}
            title="Super Admin only"
            description="Notices go to every account's Inbox, so only Super Admins send them."
            className="py-20"
          />
        </Panel>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notices"
        description="A notice goes to the Inbox of each account it is sent to. It cannot be changed or taken back."
        actions={
          <Button
            variant="primary"
            icon={<Megaphone className="size-4" aria-hidden />}
            onClick={() => setWriting(true)}
          >
            New notice
          </Button>
        }
      />
      <SentNotices />
      {writing && <NoticeSheet onClose={() => setWriting(false)} />}
    </div>
  )
}

function SentNotices() {
  const { data: sent, isError } = useQuery(noticesQuery)
  return (
    <Panel>
      <PanelHeader title="Sent" description="Newest first. A notice counts as read once its recipient opens it." />
      {isError ? (
        <EmptyState
          icon={Megaphone}
          title="Sent notices could not be loaded"
          description="Try again in a moment."
          className="border-t border-line"
        />
      ) : !sent ? (
        <div className="flex justify-center border-t border-line py-10">
          <Spinner />
        </div>
      ) : sent.length === 0 ? (
        <EmptyState icon={Megaphone} title="No notices sent yet" className="border-t border-line" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {sent.map((notice) => (
            <li key={notice.id} className="flex flex-col gap-1 px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{notice.title}</h3>
                <span className="shrink-0 text-xs font-medium text-ink-2">
                  {notice.read} of {notice.recipients} read
                </span>
              </div>
              <p className="text-xs text-ink-3">
                {notice.sentBy} · <time dateTime={notice.createdAt}>{formatDateTime(notice.createdAt)}</time> ·{' '}
                {notice.audience === 'all' ? 'Everyone' : 'Picked accounts'}
              </p>
              <p className="mt-1 max-w-[75ch] whitespace-pre-line text-sm text-ink-2 [overflow-wrap:anywhere]">
                {notice.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

interface Problem {
  message: string
  fields: Record<string, string>
}

type Audience = 'all' | 'picked'
const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'picked', label: 'Pick accounts' },
]

const userKey = (user: UserRow) => user.id
const userLabel = (user: UserRow) => user.name
const userSearch = (user: UserRow) => user.email

function NoticeSheet({ onClose }: { onClose: () => void }) {
  const me = useUser()
  const toast = useToast()
  const { data: users = [] } = useQuery(usersQuery)
  // The server skips the sender and deactivated accounts too; offering them would only promise what it will not do.
  const offered = users.filter((user) => user.state !== 'deactivated' && user.id !== me.id)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [picked, setPicked] = useState<UserRow[]>([])
  const [problem, setProblem] = useState<Problem | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const send = useWrite((input: NoticeInput) => api.post<NoticeRow>('/notices', input), { silent: true })
  const error = (name: string) => problem?.fields[name] ?? null
  // A change takes back the errors on what it changed; with none left, the whole problem goes.
  const clear = (...names: string[]) =>
    setProblem((now) => {
      const fields = Object.fromEntries(Object.entries(now?.fields ?? {}).filter(([key]) => !names.includes(key)))
      return now && Object.keys(fields).length ? { ...now, fields } : null
    })

  function refuse(next: Problem) {
    setProblem(next)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function submit() {
    setProblem(null)
    const parsed = noticeSchema.safeParse({
      title,
      body,
      audience: audience === 'all' ? 'all' : { userIds: picked.map(userKey) },
    })
    if (!parsed.success)
      return refuse({
        message: 'Some of this is missing or needs changing. Nothing has been sent.',
        fields: fieldMessages(parsed.error),
      })
    try {
      const notice = await send.mutateAsync(parsed.data)
      toast({
        title: 'Notice sent',
        description: `To ${notice.recipients} account${notice.recipients === 1 ? '' : 's'}`,
      })
      onClose()
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title="New notice"
      description="It lands in each recipient's Inbox and on their bell."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="notice-form" loading={send.isPending}>
            Send notice
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="notice-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {problem && !Object.keys(problem.fields).length && (
          <Alert tone="bad" title="Not sent">
            {problem.message}
          </Alert>
        )}
        <Field label="Title" error={error('title')}>
          <Input
            value={title}
            maxLength={NOTICE_TITLE_MAX}
            autoComplete="off"
            onChange={(event) => {
              setTitle(event.target.value)
              clear('title')
            }}
          />
        </Field>
        <Field
          label="Message"
          hint={`${body.trim().length} of ${NOTICE_BODY_MAX} characters. Line breaks are kept.`}
          error={error('body')}
        >
          <Textarea
            rows={8}
            value={body}
            onChange={(event) => {
              setBody(event.target.value)
              clear('body')
            }}
          />
        </Field>
        <Field label="Send to" error={audience === 'all' ? error('audience') : null}>
          <Segmented
            label="Send to"
            value={audience}
            options={AUDIENCES}
            onChange={(next) => {
              setAudience(next)
              clear('audience', 'audience.userIds')
            }}
          />
        </Field>
        {audience === 'picked' && (
          <Field
            label="Accounts"
            hint="Active accounts only. You never get a copy of your own notice."
            error={error('audience.userIds') ?? error('audience')}
          >
            <MultiCombobox
              items={offered}
              value={picked}
              onChange={(next) => {
                setPicked(next)
                clear('audience', 'audience.userIds')
              }}
              getKey={userKey}
              getLabel={userLabel}
              getSearch={userSearch}
              renderItem={(user) => (
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-ink-3">{user.email}</span>
                </span>
              )}
              placeholder="Search by name or email"
              emptyText="No active account matches"
            />
          </Field>
        )}
      </form>
    </Sheet>
  )
}
