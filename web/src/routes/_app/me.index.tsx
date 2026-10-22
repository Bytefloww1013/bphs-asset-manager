import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/me/')({
  beforeLoad: () => {
    throw redirect({ to: '/me/inbox', replace: true })
  },
})
