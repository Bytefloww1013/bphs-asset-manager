import { useState, type ReactNode } from 'react'
import { GRIEVANCE_NOTE_MAX } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Textarea } from '@/components/ui/form.tsx'
import { Sheet } from '@/components/ui/overlay.tsx'
import { useWrite } from '@/features/common/hooks.ts'
import { ApiError, api } from '@/lib/api.ts'

/** One change to a record, posted to `path`: the request and what went wrong with it. The sheet closes once it goes through. */
export function useChange<T>(path: string, success: (next: T) => string, onClose: () => void) {
  const [error, setError] = useState<ApiError | null>(null)
  const write = useWrite((body: Record<string, unknown>) => api.post<T>(path, body), { silent: true, success })
  async function send(body: Record<string, unknown>) {
    setError(null)
    try {
      await write.mutateAsync(body)
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }
  return { error, send, pending: write.isPending, field: (name: string) => error?.fields[name] }
}

/** The sheet around a change's form, with any refusal that is not about one field. */
export function ChangeSheet({
  title,
  description,
  submit,
  danger,
  change,
  onSubmit,
  onClose,
  children,
}: {
  title: string
  description: string
  submit: string
  danger?: boolean
  change: { error: ApiError | null; pending: boolean }
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="submit" form="change-form" loading={change.pending}>
            {submit}
          </Button>
        </>
      }
    >
      <form
        id="change-form"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSubmit()
        }}
      >
        {change.error && !Object.keys(change.error.fields).length && (
          <Alert tone="bad" title="That did not go through">
            {change.error.message}
          </Alert>
        )}
        {children}
      </form>
    </Sheet>
  )
}

export const Note = ({ value, onChange, ...rest }: { value: string; onChange: (next: string) => void }) => (
  <Textarea
    {...rest}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    maxLength={GRIEVANCE_NOTE_MAX}
    rows={4}
  />
)
