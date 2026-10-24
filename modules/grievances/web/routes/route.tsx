import { Outlet, createFileRoute } from '@tanstack/react-router'

// The Grievances workspace. Everything in it sits under this route, and none of its code is loaded until it is opened.
export const Route = createFileRoute('/_app/grievances')({
  component: () => <Outlet />,
})
