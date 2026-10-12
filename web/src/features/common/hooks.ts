import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'
import { useToast } from '@/components/ui/feedback.tsx'
import { ApiError } from '@/lib/api.ts'
import { refreshData } from '@/lib/queries.ts'

/**
 * A write that refreshes every list afterwards and reports failures as a toast. Pass `silent` when the
 * caller shows errors itself (inline in a form).
 */
export function useWrite<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: { success?: string | ((data: TData, vars: TVars) => string); silent?: boolean; onSuccess?: UseMutationOptions<TData, Error, TVars>['onSuccess'] } = {},
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: async (data, vars, ...rest) => {
      await refreshData(queryClient)
      if (options.success) toast({ title: typeof options.success === 'function' ? options.success(data, vars) : options.success })
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
