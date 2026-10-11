import * as RTooltip from '@radix-ui/react-tooltip'
import type { ReactElement, ReactNode } from 'react'

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RTooltip.Provider delayDuration={250} skipDelayDuration={150}>
    {children}
  </RTooltip.Provider>
)

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-[70] max-w-72 animate-fade-in rounded-control bg-ink px-2.5 py-1.5 text-xs font-medium leading-4 text-on-accent shadow-pop"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}
