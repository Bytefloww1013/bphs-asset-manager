import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
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
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · BPHS Assets`
  }, [title])
}
