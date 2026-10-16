import * as Popover from '@radix-ui/react-popover'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/** An "i" button that opens a short explanation. It opens on a click or a tap, not on hover, so it works on touch screens and from the keyboard. */
export function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={label}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/20 data-[state=open]:bg-sunken data-[state=open]:text-ink"
      >
        <Info className="size-4" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="z-[60] w-72 max-w-[calc(100vw-24px)] animate-pop-in rounded-panel border border-line bg-surface p-3 text-sm text-ink shadow-pop focus-visible:outline-none"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
