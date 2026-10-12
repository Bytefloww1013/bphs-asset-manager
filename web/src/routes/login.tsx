import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { loginSchema } from '@shared/schemas.ts'
import type { SessionUser } from '@shared/types.ts'
import { Button, IconButton } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Input } from '@/components/ui/form.tsx'
import { Wordmark } from '@/components/ui/logo.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { fieldError } from '@/lib/form.ts'
import { meQuery } from '@/lib/queries.ts'
import { formatTime } from '@/lib/format.ts'
import { usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQuery)
    if (user) throw redirect({ to: user.mustChangePassword ? '/password-change' : '/' })
  },
  component: LoginPage,
})

/** A password input with a show/hide button. Field hands its id and aria attributes to its direct child, so they are passed on to the input here. */
function PasswordInput(props: Omit<ComponentProps<'input'>, 'type' | 'className'>) {
  const [reveal, setReveal] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={reveal ? 'text' : 'password'} className="pr-10" />
      <IconButton label={reveal ? 'Hide password' : 'Show password'} size="sm" className="absolute right-0.5 top-0.5" onClick={() => setReveal((on) => !on)}>
        {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </IconButton>
    </div>
  )
}

function LoginPage() {
  usePageTitle('Sign in')
  const router = useRouter()
  const queryClient = useQueryClient()

  const login = useMutation({
    mutationFn: (value: { email: string; password: string }) => api.post<{ user: SessionUser }>('/auth/login', value),
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(meQuery.queryKey, user)
      await router.navigate({ to: user.mustChangePassword ? '/password-change' : '/' })
    },
  })

  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      await login.mutateAsync(value).catch(() => undefined)
    },
  })

  const error = login.error instanceof ApiError ? login.error : null
  const locked = error?.code === 'account_locked'

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <main className="w-full max-w-[26rem]">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-panel border border-line bg-surface p-7 shadow-pop">
          <h1 className="text-xl font-semibold tracking-[-0.015em]">Sign in</h1>
          <p className="mt-1 text-sm text-ink-3">Use your BPHS Assets account.</p>

          {error && (
            <Alert tone={locked ? 'warn' : 'bad'} className="mt-5" title={locked ? 'Account locked' : 'Could not sign in'}>
              {locked
                ? `Too many incorrect attempts. Try again after ${formatTime(error.details?.lockedUntil)}, or ask a Super Admin to clear the lock.`
                : error.message}
            </Alert>
          )}

          <form
            className="mt-5 flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <form.Field name="email">
              {(field) => (
                <Field label="Email" error={fieldError(field, undefined, form.state.submissionAttempts > 0)}>
                  <Input
                    type="email"
                    autoComplete="username"
                    autoFocus
                    inputMode="email"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <Field label="Password" error={fieldError(field, undefined, form.state.submissionAttempts > 0)}>
                  <PasswordInput
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </Field>
              )}
            </form.Field>
            <Button type="submit" variant="primary" size="lg" loading={login.isPending} className="mt-1">
              Sign in
            </Button>
          </form>
        </div>
        <p className="mt-5 flex items-start justify-center gap-2 px-4 text-center text-sm text-ink-3">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Office network only. Five incorrect attempts lock an account for 15 minutes; only a Super Admin can clear a lock or reset a password.</span>
        </p>
      </main>
    </div>
  )
}
