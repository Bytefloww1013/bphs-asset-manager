import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { ApiError } from './lib/api.ts'
import { meQuery } from './lib/session.ts'
import { returnPath, setSessionEnded } from './lib/session.ts'
import { routeTree } from './routeTree.gen'

/**
 * A signed-out or expired session is dealt with here, whatever call noticed it first. Inside the app the user is asked for their
 * password over the page they are on (SignInAgain), so a half-filled form survives; anywhere else they go to the sign-in page,
 * which brings them back afterwards.
 */
function handleAuthFailure(error: unknown) {
  if (!(error instanceof ApiError)) return
  const { location, matches } = router.state
  if (error.status === 401 && location.pathname !== '/login') {
    if (queryClient.getQueryData(meQuery.queryKey) && matches.some((match) => match.routeId === '/_app')) {
      setSessionEnded(true)
      // Only what is on screen stays in memory while nobody is signed in.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' && query.getObserversCount() === 0 })
      return
    }
    queryClient.clear()
    void router.navigate({ to: '/login', search: { redirect: returnPath(location.href) } })
  } else if (error.code === 'password_change_required' && location.pathname !== '/password-change') {
    setSessionEnded(false)
    queryClient.clear()
    void router.navigate({ to: '/password-change' })
  } else if (error.code === 'forbidden') {
    // The role was changed while this tab was open. Ask again who this is, so the menus stop offering what the server refuses.
    void queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
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
