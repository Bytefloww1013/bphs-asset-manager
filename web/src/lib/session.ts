import { useQuery, type QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'
import { isInAppPath, type AccessLevel, type Section } from '@shared/constants.ts'
import { canAt, canUseWorkspace, needsAccess, workspacesOf } from '@shared/permissions.ts'
import type { SessionUser } from '@shared/types.ts'
import { meQuery } from './queries.ts'
import { APP_NAME } from './brand.ts'
import { WORKSPACE_HOME, type Area } from './workspace.ts'

/** The signed-in user. Only call inside routes below the auth guard. */
export function useUser(): SessionUser {
  const { data } = useQuery(meQuery)
  if (!data) throw new Error('useUser called without a session')
  return data
}

/** Why this account may not do something that needs this level in this section, or undefined when it may: fits a `disabledReason`. */
export function useDenied(section: Section, level: AccessLevel): string | undefined {
  return canAt(useUser(), section, level) ? undefined : needsAccess(section, level)
}

/** Sets the browser tab title for the current screen. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`
  }, [title])
}

/**
 * Where to go back to after signing in: a path inside this app. Anything else is dropped, so a link to the sign-in page can
 * never send someone to another site, and the sign-in page and the overview (where sign-in lands anyway) are not kept.
 */
export function returnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !isInAppPath(value)) return undefined
  return value === '/' || /^\/login(?:[/?#]|$)/.test(value) ? undefined : value
}

/**
 * The auth guard for a page that needs a signed-in user with a usable password; a route's `beforeLoad` calls it with the
 * area the page is in. An account that does not work in that workspace is taken to the first workspace it does work in.
 * My Space is every account's own, so it needs only the session.
 */
export async function requireSession(queryClient: QueryClient, href: string, area: Area): Promise<SessionUser> {
  const user = await queryClient.ensureQueryData(meQuery)
  if (!user) throw redirect({ to: '/login', search: { redirect: returnPath(href) } })
  if (user.mustChangePassword) throw redirect({ to: '/password-change' })
  if (area !== 'me' && !canUseWorkspace(user, area)) throw redirect({ to: WORKSPACE_HOME[workspacesOf(user)[0]!] })
  return user
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
