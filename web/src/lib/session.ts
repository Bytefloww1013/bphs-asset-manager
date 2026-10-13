import { useQuery, type QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'
import { can, type Permission } from '@shared/permissions.ts'
import type { SessionUser } from '@shared/types.ts'
import { meQuery } from './queries.ts'

/** The signed-in user. Only call inside routes below the auth guard. */
export function useUser(): SessionUser {
  const { data } = useQuery(meQuery)
  if (!data) throw new Error('useUser called without a session')
  return data
}

export function useCan(permission: Permission): boolean {
  return can(useUser().role, permission)
}

/** Sets the browser tab title for the current screen. */
export function usePageTitle(title: string, product = 'BPHS Assets') {
  useEffect(() => {
    document.title = `${title} · ${product}`
  }, [title, product])
}

/**
 * Where to go back to after signing in: a path inside this app. Anything else is dropped, so a link to the sign-in page can
 * never send someone to another site, and the sign-in page and the overview (where sign-in lands anyway) are not kept.
 */
export function returnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value)) return undefined
  return value === '/' || /^\/login(?:[/?#]|$)/.test(value) ? undefined : value
}

/** The auth guard for a page that needs a signed-in user with a usable password; a route's `beforeLoad` calls it. */
export async function requireSession(queryClient: QueryClient, href: string) {
  const user = await queryClient.ensureQueryData(meQuery)
  if (!user) throw redirect({ to: '/login', search: { redirect: returnPath(href) } })
  if (user.mustChangePassword) throw redirect({ to: '/password-change' })
}

// ---- A session that ended while the app was open --------------------------------------------
let ended = false
const watchers = new Set<() => void>()

/** Set when the server no longer knows the session of a tab that was signed in. The app then asks for the password over the page, so the page and whatever was typed into it stay. */
export function setSessionEnded(next: boolean) {
  if (ended === next) return
  ended = next
  for (const notify of watchers) notify()
}

export function useSessionEnded(): boolean {
  return useSyncExternalStore(
    (notify) => {
      watchers.add(notify)
      return () => watchers.delete(notify)
    },
    () => ended,
  )
}
