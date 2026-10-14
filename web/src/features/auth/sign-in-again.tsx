import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { SessionUser } from '@shared/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Alert } from '@/components/ui/feedback.tsx'
import { Field, Input, PasswordInput } from '@/components/ui/form.tsx'
import { Wordmark } from '@/components/ui/logo.tsx'
import { api, ApiError } from '@/lib/api.ts'
import { formatTime } from '@/lib/format.ts'
import { meQuery, refreshData } from '@/lib/queries.ts'
import { returnPath, setSessionEnded, useSessionEnded } from '@/lib/session.ts'
import { router } from '@/router.tsx'

/**
 * Asks for the password again, over whatever page the user is on, when their session has ended. Going to the sign-in page would
 * throw the page away, and with it anything they had typed. It sits outside the router so it is there whatever the page shows.
 */
export function SignInAgain() {
  const ended = useSessionEnded()
  const { data: user } = useQuery({ ...meQuery, enabled: false })
  return ended && user ? <SignInAgainDialog user={user} /> : null
}

function SignInAgainDialog({ user }: { user: SessionUser }) {
  const queryClient = useQueryClient()
  const passwordInput = useRef<HTMLInputElement>(null)
  // Whatever had focus when the session ended, usually a field of the form being filled in. Focus goes back there afterwards.
  const cameFrom = useRef<Element | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [missing, setMissing] = useState(false)

  async function resume(next: SessionUser) {
    queryClient.setQueryData(meQuery.queryKey, next)
    setSessionEnded(false)
    if (next.mustChangePassword) {
      await router.navigate({ to: '/password-change' })
      return
    }
    // Everything on the page failed to load or went stale while signed out, and a page whose loader failed is showing an error.
    await refreshData(queryClient)
    await router.invalidate()
  }

  function signInAsSomeoneElse() {
    const here = router.state.location.href
    setSessionEnded(false)
    queryClient.clear()
    void router.navigate({ to: '/login', search: { redirect: returnPath(here) } })
  }

  // Signing in again in another tab renews the cookie both tabs share, so this one can carry on without asking.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      api
        .get<{ user: SessionUser }>('/auth/me')
        .then((result) => resume(result.user))
        .catch(() => undefined)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  async function signIn() {
    setError(null)
    setMissing(!password)
    if (!password) return
    setBusy(true)
    try {
      const result = await api.post<{ user: SessionUser }>('/auth/login', { email: user.email, password })
      await resume(result.user)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, null, 'Could not sign in. Try again.'))
      passwordInput.current?.select()
    } finally {
      setBusy(false)
    }
  }

  const locked = error?.code === 'account_locked'
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        {/* A click on the backdrop must not take focus out of the password field: there is nowhere else for it to be. */}
        <Dialog.Overlay className="fixed inset-0 z-[70] animate-fade-in bg-ink/35" onMouseDown={(event) => event.preventDefault()} />
        <Dialog.Content
          role="alertdialog"
          // The page behind cannot do anything until someone is signed in, so there is nothing to dismiss this to.
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cameFrom.current = document.activeElement
            passwordInput.current?.focus()
          }}
          // A dialog returns focus to the button that opened it, and nothing opened this one.
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (cameFrom.current instanceof HTMLElement && cameFrom.current.isConnected) cameFrom.current.focus()
          }}
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-panel border border-line bg-surface p-6 shadow-pop outline-none"
        >
          <Wordmark className="mb-4" />
          <Dialog.Title className="text-lg font-semibold tracking-[-0.01em] text-ink">Your session has ended</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-5 text-ink-2">
            Sign in again to carry on. This page stays as you left it, including anything you had typed.
          </Dialog.Description>
          {error && (
            <Alert tone={locked ? 'warn' : 'bad'} className="mt-4" title={locked ? 'Account locked' : 'Could not sign in'}>
              {locked ? `Too many incorrect attempts. Try again after ${formatTime(error.details?.lockedUntil)}, or ask a Super Admin to clear the lock.` : error.message}
            </Alert>
          )}
          <form
            className="mt-4 flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void signIn()
            }}
          >
            <Field label="Email">
              <Input type="email" readOnly autoComplete="username" value={user.email} className="bg-sunken text-ink-2" />
            </Field>
            <Field label="Password" error={missing ? 'Enter your password' : null}>
              <PasswordInput
                ref={passwordInput}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setMissing(false)
                }}
              />
            </Field>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={signInAsSomeoneElse}>
                Sign in as someone else
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Sign in
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
