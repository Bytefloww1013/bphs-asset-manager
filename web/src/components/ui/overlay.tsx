import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'
import { Button, IconButton } from './button.tsx'

/** Right-hand panel for a focused task. The page behind stays visible, so context is never lost. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
  size?: 'md' | 'lg'
}) {
  const body = useRef<HTMLDivElement>(null)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/35" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            // Land on the field the task starts with, not on the Close button.
            const target = body.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]):not([disabled]), textarea, select, [role=radio][tabindex="0"]')
            if (target) {
              event.preventDefault()
              target.focus()
            }
          }}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full animate-sheet-in flex-col bg-surface shadow-sheet outline-none sm:border-l sm:border-line',
            size === 'md' ? 'sm:max-w-[30rem]' : 'sm:max-w-[40rem]',
          )}
        >
          <header className="flex items-start gap-3 border-b border-line px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-ink-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" size="sm" className="-mr-2 -mt-1">
                <X className="size-4" />
              </IconButton>
            </Dialog.Close>
          </header>
          <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas px-6 py-3.5">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Small centred dialog for a yes/no decision that must interrupt. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  onConfirm: () => Promise<unknown> | unknown
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in rounded-panel border border-line bg-surface p-6 shadow-pop outline-none">
          <Dialog.Title className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-5 text-ink-2">{description}</Dialog.Description>
          {children}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onConfirm()
                  onOpenChange(false)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  tone?: 'default' | 'danger'
  /** When set the item is shown but inert, with the reason beneath it. */
  disabledReason?: string
  separatorBefore?: boolean
}

/** Overflow menu for the less common row actions. */
export function Menu({ label, items, trigger }: { label: string; items: MenuItem[]; trigger?: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <IconButton label={label} size="sm">
            <MoreHorizontal className="size-4" />
          </IconButton>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] min-w-52 max-w-72 animate-pop-in rounded-panel border border-line bg-surface p-1.5 shadow-pop"
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <DropdownMenu.Separator className="-mx-1.5 my-1.5 h-px bg-line" />}
              <DropdownMenu.Item
                disabled={Boolean(item.disabledReason)}
                onSelect={item.onSelect}
                className={cn(
                  'flex cursor-default select-none flex-col rounded-[6px] px-2.5 py-1.5 text-sm outline-none',
                  'data-[highlighted]:bg-sunken data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-3',
                  item.tone === 'danger' && !item.disabledReason ? 'text-bad data-[highlighted]:bg-bad-soft' : 'text-ink',
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  {item.icon && <item.icon className="size-4 shrink-0" aria-hidden />}
                  {item.label}
                </span>
                {item.disabledReason && <span className={cn('mt-0.5 text-xs font-normal text-ink-3', item.icon && 'pl-6')}>{item.disabledReason}</span>}
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
