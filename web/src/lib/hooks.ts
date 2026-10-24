import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useToast } from '@/components/ui/feedback.tsx'
import { ApiError } from '@/lib/api.ts'
import { refreshData } from '@/lib/session.ts'

/**
 * A write that refreshes every list afterwards and reports failures as a toast. Pass `silent` when the
 * caller shows errors itself (inline in a form).
 */
export function useWrite<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: {
    success?: string | ((data: TData, vars: TVars) => string)
    silent?: boolean
    onSuccess?: UseMutationOptions<TData, Error, TVars>['onSuccess']
  } = {},
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: async (data, vars, ...rest) => {
      await refreshData(queryClient)
      if (options.success)
        toast({ title: typeof options.success === 'function' ? options.success(data, vars) : options.success })
      await options.onSuccess?.(data, vars, ...rest)
    },
    onError: (error) => {
      // A conflict means the page is behind what the server holds: show what is there now.
      if (error instanceof ApiError && error.status === 409) void refreshData(queryClient)
      if (options.silent) return
      if (error instanceof ApiError && (error.status === 401 || error.code === 'password_change_required')) return
      toast({ tone: 'bad', title: 'That did not go through', description: error.message })
    },
  })
}

/**
 * A search box: it holds what is being typed and sends it on to `commit` after a pause, and follows `current` (the address)
 * only when something else changes it (the Back button).
 */
export function useSearchBox(current: string | undefined, commit: (q: string | undefined) => void) {
  const [q, setQ] = useState(current ?? '')
  const typing = useRef(false)
  // Effect events see the latest q and commit without making the effects below re-run when those change.
  const follow = useEffectEvent((next: string) => {
    if (!typing.current && next !== q.trim()) setQ(next)
  })
  const edited = useEffectEvent(() => q.trim() !== (current ?? ''))
  const send = useEffectEvent(() => {
    typing.current = false
    commit(q.trim() || undefined)
  })
  useEffect(() => follow(current ?? ''), [current])
  useEffect(() => {
    typing.current = edited()
    if (!typing.current) return
    const timer = setTimeout(() => send(), 300)
    return () => clearTimeout(timer)
  }, [q])
  return [q, setQ] as const
}
