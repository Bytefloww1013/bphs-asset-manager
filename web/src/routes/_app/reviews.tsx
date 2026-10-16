import { Outlet, createFileRoute } from '@tanstack/react-router'

/** The Administrative Reviews workspace. Everything in it sits under this route, and none of its code is loaded until it is opened. */
export const Route = createFileRoute('/_app/reviews')({ component: () => <Outlet /> })
