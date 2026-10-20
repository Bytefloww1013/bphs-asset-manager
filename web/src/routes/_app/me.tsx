import { Outlet, createFileRoute } from '@tanstack/react-router'

// My Space: the signed-in person's own pages. It is not a workspace, so it needs no access grant (see areaOf).
export const Route = createFileRoute('/_app/me')({ component: () => <Outlet /> })
