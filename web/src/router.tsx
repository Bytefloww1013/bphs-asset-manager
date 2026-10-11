import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { ApiError } from './lib/api.ts'
import { routeTree } from './routeTree.gen'

/** A signed-out or expired session sends the user to the right screen, whatever call noticed it first. */
function handleAuthFailure(error: unknown) {
  if (!(error instanceof ApiError)) return
  const here = router.state.location.pathname
  if (error.status === 401 && here !== '/login') {
    queryClient.clear()
    void router.navigate({ to: '/login' })
  } else if (error.code === 'password_change_required' && here !== '/password-change') {
    queryClient.clear()
    void router.navigate({ to: '/password-change' })
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthFailure }),
  mutationCache: new MutationCache({ onError: handleAuthFailure }),
  defaultOptions: {
    queries: {
      // Several people work in this at once, so keep data fresh without hammering the server.
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && count < 2,
    },
  },
})

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
