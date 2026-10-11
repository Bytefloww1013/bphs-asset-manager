import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { Compass, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { EmptyState } from '@/components/ui/feedback.tsx'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <EmptyState
        icon={Compass}
        title="That page doesn't exist"
        description="The link may be out of date, or the record may have been removed."
        action={
          <Link to="/">
            <Button variant="primary">Go to overview</Button>
          </Link>
        }
      />
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  ),
})
