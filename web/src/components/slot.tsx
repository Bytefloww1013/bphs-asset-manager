import { Fragment, createElement } from 'react'
import { useUser } from '@/lib/session.ts'
import type { SlotName, SlotProps } from '@/modules.ts'
import { slot } from '@/registry.ts'

/**
 * Draws what the modules put in one slot (`SlotProps` in `web/src/modules.ts`) that this account may see, in module order.
 * With nothing to draw it adds nothing to the page, not even its wrapper; with no `className` it has no wrapper at all, so
 * its entries sit in the parent's own layout.
 */
export function Slot<K extends SlotName>({
  name,
  props,
  className,
}: {
  name: K
  props: SlotProps[K]
  className?: string
}) {
  const entries = slot(name, useUser())
  if (!entries.length) return null
  const drawn = entries.map((entry) => <Fragment key={entry.id}>{createElement(entry.component, props)}</Fragment>)
  return className ? <div className={className}>{drawn}</div> : drawn
}
