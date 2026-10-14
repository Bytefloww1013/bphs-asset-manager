import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Compass, TriangleAlert } from 'lucide-react'
import { Button, buttonStyles } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'
import { Wordmark } from '@/components/ui/logo.tsx'
import { usePageTitle } from '@/lib/session.ts'
import type { ReactNode } from 'react'

function StandaloneState({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title)
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <main className="w-full max-w-lg">
        <div className="mb-6 flex justify-center"><Wordmark /></div>
        {children}
      </main>
    </div>
  )
}

function StandaloneError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <StandaloneState title="Something went wrong">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        action={
          <Button variant="primary" onClick={() => { reset(); void router.invalidate() }}>
            Try again
          </Button>
        }
      />
    </StandaloneState>
  )
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <StandaloneState title="Page not found">
      <EmptyState
        icon={Compass}
        title="That page doesn't exist"
        description="The link may be out of date, or the record may have been removed."
        action={
          <Link to="/" className={buttonStyles('primary')}>
            Go to overview
          </Link>
        }
      />
    </StandaloneState>
  ),
  errorComponent: StandaloneError,
})
