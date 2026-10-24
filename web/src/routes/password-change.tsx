import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, KeyRound, X } from 'lucide-react'
import { z } from 'zod'
import { checkPassword } from '@shared/password.ts'
import { passwordChangeSchema } from '@shared/schemas.ts'
import type { SessionUser } from '@shared/types.ts'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Input } from '@/components/ui/form.tsx'
import { AuthBrand } from '@/components/ui/logo.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { fieldError } from '@/lib/form.ts'
import { meQuery, refreshData } from '@/lib/session.ts'
import { returnPath, useUser, usePageTitle } from '@/lib/session.ts'

export const Route = createFileRoute('/password-change')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(meQuery)
    if (!user) throw redirect({ to: '/login', search: { redirect: returnPath(location.href) } })
  },
  component: PasswordChangePage,
})

function PasswordChangePage() {
  usePageTitle('Change password')
  const user = useUser()
  const router = useRouter()
  const queryClient = useQueryClient()
  const forced = user.mustChangePassword

  const change = useMutation({
    mutationFn: (value: { currentPassword: string; newPassword: string }) =>
      api.post<{ user: SessionUser }>('/auth/password-change', value),
    onSuccess: async ({ user: next }) => {
      queryClient.setQueryData(meQuery.queryKey, next)
      await refreshData(queryClient)
      await router.navigate({ to: '/' })
    },
  })

  const form = useForm({
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
    validators: {
      onSubmit: passwordChangeSchema
        .extend({ confirm: z.string().min(1, 'Enter the new password again') })
        .refine((v) => v.newPassword === v.confirm, {
          message: 'The two passwords do not match.',
          path: ['confirm'],
        }),
    },
    onSubmit: async ({ value }) => {
      await change
        .mutateAsync({ currentPassword: value.currentPassword, newPassword: value.newPassword })
        .catch(() => undefined)
    },
  })

  const serverError = change.error instanceof ApiError ? change.error : null
  const serverField = serverError?.details?.field as string | undefined

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <main className="w-full max-w-[26rem]">
        <div className="mb-8 flex justify-center">
          <AuthBrand />
        </div>
        <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-pop">
          {forced && (
            <div className="flex gap-3 border-b border-warn-line bg-warn-soft px-7 py-4">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">Set a new password before continuing</p>
                <p className="mt-0.5 text-sm text-ink-2">
                  Every page sends you back here until this is done. The one-time password you were given works only
                  once.
                </p>
              </div>
            </div>
          )}
          <div className="p-7">
            <h1 className="text-xl font-semibold tracking-[-0.015em]">Change password</h1>
            {serverError && !serverField && (
              <Alert tone="bad" className="mt-4">
                {serverError.message}
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
              <form.Field name="currentPassword">
                {(field) => (
                  <Field
                    label={forced ? 'One-time or current password' : 'Current password'}
                    error={
                      (serverField === 'currentPassword' ? serverError?.message : null) ??
                      fieldError(field, undefined, form.state.submissionAttempts > 0)
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="current-password"
                      autoFocus
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
              <form.Field name="newPassword">
                {(field) => (
                  <div className="flex flex-col gap-2.5">
                    <Field
                      label="New password"
                      error={
                        (serverField === 'newPassword' ? serverError?.message : null) ??
                        fieldError(field, undefined, form.state.submissionAttempts > 0)
                      }
                    >
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </Field>
                    <ul className="grid gap-1 rounded-control bg-sunken px-3.5 py-3" aria-label="Password requirements">
                      {checkPassword(field.state.value).map((rule) => (
                        <li
                          key={rule.id}
                          className={cn('flex items-center gap-2 text-sm', rule.ok ? 'text-ok' : 'text-ink-3')}
                        >
                          {rule.ok ? (
                            <Check className="size-3.5" aria-hidden strokeWidth={2.5} />
                          ) : (
                            <X className="size-3.5" aria-hidden />
                          )}
                          {rule.label}
                          <span className="sr-only">{rule.ok ? 'met' : 'not met'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </form.Field>
              <form.Field name="confirm">
                {(field) => (
                  <Field
                    label="Confirm new password"
                    error={fieldError(field, undefined, form.state.submissionAttempts > 0)}
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
              <div className="mt-1 flex gap-2">
                {!forced && (
                  <Link to="/" className={buttonStyles('secondary', 'lg', 'flex-1')}>
                    Cancel
                  </Link>
                )}
                <Button type="submit" variant="primary" size="lg" loading={change.isPending} className="flex-1">
                  Change password
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
