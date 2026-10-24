import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { REMEMBER_DAYS } from '@shared/constants.ts'
import { loginSchema, type LoginInput } from '@shared/schemas.ts'
import type { SessionUser } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Checkbox, Field, Input, PasswordInput } from '@/components/ui/form.tsx'
import { AuthBrand } from '@/components/ui/logo.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { APP_NAME } from '@/lib/brand.ts'
import { fieldError } from '@/lib/form.ts'
import { formatTime } from '@/lib/format.ts'
import { meQuery } from '@/lib/session.ts'
import { returnPath, usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/login')({
  // Where the user was when they were sent here, so signing in takes them back to it.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: returnPath(search.redirect),
  }),
  beforeLoad: async ({ context, search }) => {
    const user = await context.queryClient.ensureQueryData(meQuery)
    if (user)
      throw user.mustChangePassword ? redirect({ to: '/password-change' }) : redirect({ href: search.redirect ?? '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  usePageTitle('Sign in')
  const router = useRouter()
  const queryClient = useQueryClient()
  const { redirect: cameFrom } = Route.useSearch()

  const login = useMutation({
    mutationFn: (value: LoginInput) => api.post<{ user: SessionUser }>('/auth/login', value),
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(meQuery.queryKey, user)
      await (user.mustChangePassword
        ? router.navigate({ to: '/password-change' })
        : router.navigate({ href: cameFrom ?? '/' }))
    },
  })

  const defaultValues: LoginInput = { email: '', password: '', remember: false }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      await login.mutateAsync(value).catch(() => undefined)
    },
  })

  const error = login.error instanceof ApiError ? login.error : null
  const locked = error?.code === 'account_locked'

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <main className="grid w-full max-w-[26rem] items-center lg:max-w-[72rem] lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12">
        <div className="hidden lg:block" aria-hidden>
          <img
            src="/brand/brightpath-hero.webp"
            width="1916"
            height="821"
            alt=""
            className="h-[32rem] w-full rounded-panel object-cover object-left"
          />
        </div>
        <div className="w-full">
          <div className="mb-8 flex justify-center">
            <AuthBrand />
          </div>
          <div className="rounded-panel border border-line bg-surface p-7 shadow-pop">
            <h1 className="text-xl font-semibold tracking-[-0.015em]">Sign in</h1>
            <p className="mt-1 text-sm text-ink-3">Use your {APP_NAME} account.</p>

            {error && (
              <Alert
                tone={locked ? 'warn' : 'bad'}
                className="mt-5"
                title={locked ? 'Account locked' : 'Could not sign in'}
              >
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
              <form.Field name="remember">
                {(field) => (
                  <label className="flex items-center gap-2 text-sm text-ink-2">
                    <Checkbox
                      checked={field.state.value}
                      onChange={(event) => field.handleChange(event.target.checked)}
                    />
                    Keep me signed in for {REMEMBER_DAYS} days
                  </label>
                )}
              </form.Field>
              <Button type="submit" variant="primary" size="lg" loading={login.isPending} className="mt-1">
                Sign in
              </Button>
            </form>
          </div>
          <p className="mt-5 flex items-start justify-center gap-2 px-4 text-center text-sm text-ink-3">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Five incorrect attempts lock an account for 15 minutes; only a Super Admin can clear a lock or reset a
              password.
            </span>
          </p>
        </div>
      </main>
    </div>
  )
}
