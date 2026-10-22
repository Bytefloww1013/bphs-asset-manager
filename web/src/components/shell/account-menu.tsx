import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ChevronsUpDown, KeyRound, LogOut } from 'lucide-react'
import { describeAccess } from '@shared/permissions.ts'
import { api } from '@/lib/api.ts'
import { cn } from '@/lib/cn.ts'
import { initials } from '@/lib/format.ts'
import { useUser } from '@/lib/session.ts'
import { Badge } from '../ui/badge.tsx'

const itemStyle =
  'flex cursor-default items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-sunken'

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent ring-1 ring-accent-line">
      {initials(name)}
    </span>
  )
}

/**
 * The signed-in person's menu. `rail` is the avatar at the foot of the desktop rail, opening to its right; `row` is the full
 * row at the foot of the phone drawer, opening upwards. Home is in the rail, so there is no "My Space" entry here.
 */
export function AccountMenu({ variant, onNavigate }: { variant: 'rail' | 'row'; onNavigate?: () => void }) {
  const user = useUser()
  const router = useRouter()
  const queryClient = useQueryClient()

  async function signOut() {
    onNavigate?.()
    await api.post('/auth/logout').catch(() => undefined)
    queryClient.clear()
    await router.navigate({ to: '/login' })
  }

  const rail = variant === 'rail'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Account: ${user.name}`}
          className={cn(
            'transition-colors motion-reduce:transition-none',
            rail
              ? 'flex size-10 items-center justify-center rounded-full hover:bg-rail-hover data-[state=open]:bg-rail-hover'
              : 'flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-surface/70 data-[state=open]:bg-surface',
          )}
        >
          <Avatar name={user.name} />
          {!rail && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
                <span className="block truncate text-xs text-ink-3">{describeAccess(user)}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-3" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={rail ? 'right' : 'top'}
          align={rail ? 'end' : 'start'}
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] w-64 animate-pop-in rounded-panel border border-line bg-surface p-1.5 shadow-pop"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate font-mono text-xs text-ink-3">{user.email}</p>
            <div className="mt-2">
              {user.superAdmin ? (
                <Badge tone="accent">Super Admin</Badge>
              ) : (
                <p className="text-xs text-ink-2">{describeAccess(user)}</p>
              )}
            </div>
          </div>
          <DropdownMenu.Separator className="-mx-1.5 my-1.5 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={() => {
              onNavigate?.()
              void router.navigate({ to: '/password-change' })
            }}
            className={itemStyle}
          >
            <KeyRound className="size-4" aria-hidden /> Change password
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => void signOut()} className={itemStyle}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
