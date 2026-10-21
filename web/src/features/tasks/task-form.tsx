import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown } from 'lucide-react'
import { useId, useRef, useState, type ComponentProps } from 'react'
import {
  TASK_ASSIGNER_REMINDERS,
  TASK_ASSIGNER_REMINDERS_LABEL,
  TASK_REMINDER_PRESETS,
  TASK_REMINDER_PRESET_LABEL,
  TASK_REMINDER_TIME,
  TASK_WEEKDAYS,
  TASK_WEEKDAY_LABEL,
  type TaskAssignerReminders,
  type TaskWeekday,
} from '@shared/constants.ts'
import { APPROVAL_LOCKED_PROBLEM, SELF_APPROVAL_PROBLEM } from '@shared/permissions.ts'
import { taskCreateSchema, taskUpdateSchema } from '@shared/schemas.ts'
import type { AccountRef, TaskDetail, TaskRow } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert, useToast } from '@/components/ui/feedback.tsx'
import { MultiCombobox } from '@/components/ui/combobox.tsx'
import { Field, Input, Segmented, Switch } from '@/components/ui/form.tsx'
import { Panel } from '@/components/ui/layout.tsx'
import { RichTextEditor } from '@/components/ui/rich-text.tsx'
import { FilePicker, filesProblem, withFiles } from '@/features/common/files.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { TASK_FILES_HINT } from '@/features/tasks/files.tsx'
import { api } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { fieldMessages, splitApiError } from '@/lib/form.ts'
import { formatDateTime } from '@/lib/format.ts'
import { taskAccountsQuery } from '@/lib/queries.ts'
import { useUser } from '@/lib/session.ts'

interface Problem {
  message: string
  fields: Record<string, string>
}

interface Values {
  assignees: AccountRef[]
  title: string
  body: string
  send: 'now' | 'later'
  /** Both times as a date-and-time input holds them: local, no zone. */
  sendAt: string
  dueAt: string
  requiresApproval: boolean
  requiresFile: boolean
  reminderDays: TaskWeekday[]
  reminderTime: string
  assignerReminders: TaskAssignerReminders
}

const pad = (n: number) => String(n).padStart(2, '0')
const local = (iso: string) => {
  const at = new Date(iso)
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}
/** The instant a date-and-time input names. Empty or half filled in gives '', which the schema refuses with its own message. */
const instant = (value: string) =>
  value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : ''
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function start(task?: TaskDetail): Values {
  if (!task)
    return {
      assignees: [],
      title: '',
      body: '',
      send: 'now',
      sendAt: '',
      dueAt: '',
      requiresApproval: false,
      requiresFile: false,
      reminderDays: [...TASK_REMINDER_PRESETS.weekdays],
      reminderTime: TASK_REMINDER_TIME,
      assignerReminders: 'none',
    }
  return {
    assignees: [task.assignee],
    title: task.title,
    body: task.bodyHtml,
    send: task.status === 'scheduled' ? 'later' : 'now',
    sendAt: local(task.sendAt),
    dueAt: local(task.dueAt),
    requiresApproval: task.requiresApproval,
    requiresFile: task.requiresFile,
    reminderDays: task.reminderDays,
    reminderTime: task.reminderTime,
    assignerReminders: task.assignerReminders,
  }
}

const presetOptions = (Object.keys(TASK_REMINDER_PRESETS) as (keyof typeof TASK_REMINDER_PRESETS)[]).map((value) => ({
  value,
  label: TASK_REMINDER_PRESET_LABEL[value],
}))
const presetOf = (days: TaskWeekday[]) =>
  presetOptions.find(({ value }) => TASK_REMINDER_PRESETS[value].join() === days.join())?.value ?? null
const assignerOptions = TASK_ASSIGNER_REMINDERS.map((value) => ({ value, label: TASK_ASSIGNER_REMINDERS_LABEL[value] }))
// The settings under Additional options, which a refusal opens it to show.
const MORE = [
  'requiresApproval',
  'requiresFile',
  'reminderDays',
  'reminderTime',
  'reminderZone',
  'assignerReminders',
] as const
const sendOptions = [
  { value: 'now' as const, label: 'Send now' },
  { value: 'later' as const, label: 'Schedule' },
]

/** A switch with its title as a label, and a line on what it does. */
function SwitchRow({
  title,
  hint,
  error,
  ...props
}: { title: string; hint: string; error: string | null } & Omit<ComponentProps<typeof Switch>, 'label' | 'id'>) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Switch
        {...props}
        id={id}
        label={title}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={error ? true : undefined}
      />
      <div className="text-sm">
        <label htmlFor={id} className="block font-medium text-ink">
          {title}
        </label>
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-bad">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

/** Assigns a task to one or more accounts, or, given a task, edits it. The assignee of an existing task cannot change. */
export function TaskForm({ task }: { task?: TaskDetail }) {
  const navigate = useNavigate()
  const user = useUser()
  const toast = useToast()
  const { data: accounts = [] } = useQuery({ ...taskAccountsQuery, enabled: !task })
  const [initial] = useState(() => start(task))
  const [values, setValues] = useState(initial)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [files, setFiles] = useState<File[]>([])
  // Closed for a new task; open for one whose settings are not the defaults, so they are never out of sight.
  const [more, setMore] = useState(() =>
    MORE.some((name) => name !== 'reminderZone' && String(initial[name]) !== String(start()[name])),
  )
  const formRef = useRef<HTMLFormElement>(null)
  const create = useWrite((input: unknown) => api.post<TaskRow[]>('/tasks', input), { silent: true })
  const update = useWrite((input: unknown) => api.patch<TaskDetail>(`/tasks/${task?.id}`, input), { silent: true })
  const sent = task !== undefined && task.status !== 'scheduled'

  const clear = (field: string) =>
    setProblem((now) =>
      now && field in now.fields
        ? { ...now, fields: Object.fromEntries(Object.entries(now.fields).filter(([key]) => key !== field)) }
        : now,
    )
  const set = <K extends keyof Values>(name: K, value: Values[K], field: string = name) => {
    setValues((now) => ({ ...now, [name]: value }))
    clear(field)
  }
  const error = (name: string) => problem?.fields[name] ?? null
  // Approval is a check on the assignee by someone else: an assignee cannot switch it, and nobody can ask themselves for it.
  const approvalLocked = task && user.id === task.assignee.id ? APPROVAL_LOCKED_PROBLEM : undefined
  const selfApproval = task
    ? task.assignee.id === task.assigner.id
    : values.assignees.some((account) => account.id === user.id)
  // Reminders keep the zone they were set in until their time is changed, which then follows this browser.
  const zone = task && values.reminderTime === initial.reminderTime ? task.reminderZone : browserZone()

  function refuse(next: Problem) {
    setProblem(next)
    if (MORE.some((name) => name in next.fields)) setMore(true)
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function commit() {
    setProblem(null)
    const all = {
      title: values.title,
      body: values.body,
      sendAt: values.send === 'later' ? instant(values.sendAt) : null,
      dueAt: instant(values.dueAt),
      requiresApproval: values.requiresApproval,
      requiresFile: values.requiresFile,
      reminderDays: values.reminderDays,
      reminderTime: values.reminderTime,
      reminderZone: zone,
      assignerReminders: values.assignerReminders,
    }
    const notSaved = 'Some of this is missing or needs changing. Nothing has been saved.'
    const filesWrong = filesProblem(files)
    const selfApproved: Record<string, string> =
      selfApproval && values.requiresApproval && values.requiresApproval !== initial.requiresApproval
        ? { requiresApproval: SELF_APPROVAL_PROBLEM }
        : {}
    const refused = (fields: Record<string, string>) =>
      refuse({
        message: notSaved,
        fields: { ...fields, ...selfApproved, ...(filesWrong ? { files: filesWrong } : {}) },
      })
    try {
      if (!task) {
        const parsed = taskCreateSchema.safeParse({
          ...all,
          assigneeIds: values.assignees.map((account) => account.id),
        })
        if (!parsed.success || filesWrong || selfApproved.requiresApproval)
          return refused(parsed.success ? {} : fieldMessages(parsed.error))
        const rows = await create.mutateAsync(withFiles(parsed.data, files))
        toast({
          title:
            rows.length === 1 ? `Task assigned to ${rows[0]!.assignee.name}` : `Task assigned to ${rows.length} people`,
          description: rows[0]!.title,
        })
        // One task opens; several go back to the list, where they all are.
        return await (rows.length === 1
          ? navigate({ to: '/tasks/$id', params: { id: String(rows[0]!.id) } })
          : navigate({ to: '/tasks' }))
      }
      // An edit sends only what changed, so a past-due task keeps its due time and a sent one never names a send time.
      const changed = (name: keyof Values) => JSON.stringify(values[name]) !== JSON.stringify(initial[name])
      const parsed = taskUpdateSchema.safeParse({
        ...(changed('title') && { title: all.title }),
        ...(changed('body') && { body: all.body }),
        ...(!sent && (changed('send') || changed('sendAt')) && { sendAt: all.sendAt }),
        ...(changed('dueAt') && { dueAt: all.dueAt }),
        ...(changed('requiresApproval') && { requiresApproval: all.requiresApproval }),
        ...(changed('requiresFile') && { requiresFile: all.requiresFile }),
        ...(changed('reminderDays') && { reminderDays: all.reminderDays }),
        ...(changed('reminderTime') && { reminderTime: all.reminderTime, reminderZone: all.reminderZone }),
        ...(changed('assignerReminders') && { assignerReminders: all.assignerReminders }),
      })
      if (!parsed.success || filesWrong || selfApproved.requiresApproval)
        return refused(parsed.success ? {} : fieldMessages(parsed.error))
      await update.mutateAsync(withFiles(parsed.data, files))
      toast({ title: 'Task saved', description: values.title })
      await navigate({ to: '/tasks/$id', params: { id: String(task.id) } })
    } catch (e) {
      refuse(splitApiError(e))
    }
  }

  return (
    <Panel className="p-5 sm:p-6">
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void commit()
        }}
      >
        {problem && (
          <Alert tone="bad" title="Not saved">
            {problem.message}
          </Alert>
        )}
        {task ? (
          <Field label="Assignee" hint="The assignee cannot change. Cancel the task and assign it again instead.">
            <Input value={task.assignee.name} disabled />
          </Field>
        ) : (
          <Field
            label="Assignees"
            hint="Each account picked gets its own copy of the task."
            error={error('assigneeIds')}
          >
            <MultiCombobox
              items={accounts}
              value={values.assignees}
              onChange={(assignees) => set('assignees', assignees, 'assigneeIds')}
              getKey={(account) => account.id}
              getLabel={(account) => account.name}
              getSearch={(account) => account.email}
              renderItem={(account) => (
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{account.name}</span>
                  <span className="shrink-0 truncate text-xs text-ink-3">{account.email}</span>
                </span>
              )}
              placeholder="Search by name or email"
              emptyText="No account matches"
            />
          </Field>
        )}
        <Field label="Title" error={error('title')}>
          <Input value={values.title} onChange={(event) => set('title', event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Body" optional error={error('body')}>
          <RichTextEditor label="Body" defaultValue={initial.body} onChange={(body) => set('body', body)} />
        </Field>
        <Field
          label="Files"
          optional
          hint={task ? TASK_FILES_HINT : `${TASK_FILES_HINT} Each assignee's task gets its own copy.`}
          error={error('files')}
        >
          <FilePicker value={files} onChange={(picked) => (setFiles(picked), clear('files'))} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          {sent ? (
            <Field label="Sent" hint="It has already been sent, so its send time cannot change.">
              <Input value={formatDateTime(task.sendAt)} disabled />
            </Field>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="Send" error={values.send === 'now' ? error('sendAt') : null}>
                <Segmented
                  label="Send"
                  value={values.send}
                  onChange={(send) => set('send', send, 'sendAt')}
                  options={sendOptions}
                />
              </Field>
              {values.send === 'later' && (
                <Field label="Send at" error={error('sendAt')}>
                  <Input
                    type="datetime-local"
                    value={values.sendAt}
                    onChange={(event) => set('sendAt', event.target.value)}
                  />
                </Field>
              )}
            </div>
          )}
          <Field label="Due" error={error('dueAt')}>
            <Input type="datetime-local" value={values.dueAt} onChange={(event) => set('dueAt', event.target.value)} />
          </Field>
        </div>
        <button
          type="button"
          aria-expanded={more}
          aria-controls="task-more-options"
          onClick={() => setMore(!more)}
          className="flex w-full items-start gap-3 rounded-control border border-line-strong bg-canvas px-4 py-3 text-left transition-colors duration-150 hover:bg-sunken"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Additional options</span>
            <span className="mt-0.5 block text-xs text-ink-3">
              Available options include requiring approval, requiring a file on completion, and reminder and past-due
              notice settings.
            </span>
          </span>
          <ChevronDown
            className={cn('mt-0.5 size-4 shrink-0 text-ink-3 transition-transform duration-150', more && 'rotate-180')}
            aria-hidden
          />
        </button>
        {more && (
          <div id="task-more-options" className="flex flex-col gap-5">
            <SwitchRow
              title="Requires approval"
              hint={
                selfApproval
                  ? `When it is marked complete, it waits for the assigner to approve it or send it back. ${task ? 'This task is your own' : 'You are among the assignees'}, and nobody can approve their own task.`
                  : 'When it is marked complete, it waits for the assigner to approve it or send it back.'
              }
              error={error('requiresApproval')}
              checked={values.requiresApproval}
              onChange={(on) => set('requiresApproval', on)}
              disabledReason={approvalLocked}
            />
            <SwitchRow
              title="Requires a file on completion"
              hint="The assignee must attach at least one file to mark it complete."
              error={error('requiresFile')}
              checked={values.requiresFile}
              onChange={(on) => set('requiresFile', on)}
            />
            <Field
              label="Reminders"
              hint="While the task is past due, the assignee is reminded on the days picked."
              error={error('reminderDays')}
            >
              <div role="group" aria-label="Reminders" className="flex flex-col gap-2">
                <Segmented
                  label="Reminders"
                  value={presetOf(values.reminderDays)}
                  onChange={(preset) => set('reminderDays', [...TASK_REMINDER_PRESETS[preset]])}
                  options={presetOptions}
                />
                <div role="group" aria-label="Reminder days" className="flex flex-wrap gap-1.5">
                  {TASK_WEEKDAYS.map((day) => {
                    const on = values.reminderDays.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set(
                            'reminderDays',
                            on
                              ? values.reminderDays.filter((other) => other !== day)
                              : TASK_WEEKDAYS.filter((other) => other === day || values.reminderDays.includes(other)),
                          )
                        }
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-sm font-medium transition-colors duration-150',
                          on
                            ? 'border-accent bg-accent-soft text-accent'
                            : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken hover:text-ink',
                        )}
                      >
                        {on && <Check className="size-3.5" aria-hidden strokeWidth={2.5} />}
                        {TASK_WEEKDAY_LABEL[day]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Field>
            <Field
              label="Reminder time"
              hint={`In the ${zone} time zone.`}
              error={error('reminderTime') ?? error('reminderZone')}
            >
              <Input
                type="time"
                className="sm:max-w-40"
                value={values.reminderTime}
                onChange={(event) => set('reminderTime', event.target.value)}
              />
            </Field>
            <Field
              label="Past-due notices to the assigner"
              hint="None, the first notice when it goes past due, or every reminder the assignee gets."
              error={error('assignerReminders')}
            >
              <Segmented
                label="Past-due notices to the assigner"
                value={values.assignerReminders}
                onChange={(mode) => set('assignerReminders', mode)}
                options={assignerOptions}
              />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>
            {task ? 'Save changes' : 'Assign task'}
          </Button>
          {task ? (
            <Link to="/tasks/$id" params={{ id: String(task.id) }} className={buttonStyles('ghost')}>
              Discard changes
            </Link>
          ) : (
            <Link to="/tasks" className={buttonStyles('ghost')}>
              Cancel
            </Link>
          )}
        </div>
      </form>
    </Panel>
  )
}
