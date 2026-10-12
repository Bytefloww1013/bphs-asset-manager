import * as Popover from '@radix-ui/react-popover'
import { X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn.ts'

interface ComboboxProps<T> {
  items: T[]
  value: T | null
  onChange: (value: T | null) => void
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  /** Extra text matched when filtering (ids, departments). */
  getSearch?: (item: T) => string
  renderItem?: (item: T) => ReactNode
  placeholder?: string
  emptyText?: string
  id?: string
  invalid?: boolean
  disabled?: boolean
  mono?: boolean
  autoFocus?: boolean
  /** Lets the parent move focus here, e.g. back to the first field when a batch entry starts over. */
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

const MAX_RESULTS = 40

/**
 * Type-ahead picker. Arrow keys move, Enter or Tab accepts the highlighted match, Esc closes.
 * The list renders in a portal so it is never clipped by a scrolling panel.
 */
export function Combobox<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getSearch,
  renderItem,
  placeholder,
  emptyText = 'No matches',
  id,
  disabled,
  mono,
  autoFocus,
  inputRef: outerRef,
  className,
  ...aria
}: ComboboxProps<T>) {
  const listId = useId()
  const ownRef = useRef<HTMLInputElement>(null)
  const inputRef = outerRef ?? ownRef
  const [text, setText] = useState(value ? getLabel(value) : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [list, setList] = useState<HTMLUListElement | null>(null)
  const pointerMoved = useRef(false)
  const pointerAt = useRef('')

  // Follow the selected value when the parent changes it (reset, prefill).
  const label = value ? getLabel(value) : ''
  useEffect(() => setText(label), [label])

  const found = useMemo(() => {
    const query = text.trim().toLowerCase()
    if (!query || (value && label === text)) return items
    const words = query.split(/\s+/)
    return items.filter((item) => {
      const haystack = `${getLabel(item)} ${getSearch?.(item) ?? ''}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }, [items, text, value, label, getLabel, getSearch])
  const matches = useMemo(() => found.slice(0, MAX_RESULTS), [found])

  // Keys, typing and opening move the highlight, so the list scrolls to keep it in view. The pointer moves it too, but its option is then under the
  // pointer already, and scrolling would fight the wheel.
  useEffect(() => {
    const byPointer = pointerMoved.current
    pointerMoved.current = false
    if (list && !byPointer) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [list, listId, active, text])

  // The highlight starts on the chosen item, so that Enter on a list that was only opened keeps the choice instead of taking whatever
  // is first. A chosen item beyond the part of the list that is shown gets no highlight, and Enter then only closes the list.
  function openList() {
    setOpen(true)
    setActive(value && label === text ? matches.findIndex((item) => getKey(item) === getKey(value)) : 0)
  }

  function select(item: T | null) {
    onChange(item)
    setText(item ? getLabel(item) : '')
    setOpen(false)
  }

  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className={cn('relative', className)}>
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={text}
            className={cn(
              'h-9 w-full rounded-control border border-line-strong bg-surface pl-3 pr-8 text-sm text-ink shadow-[inset_0_1px_1px_oklch(0.2_0.02_262/0.04)] transition-[border-color,box-shadow] duration-150',
              'hover:border-ink-4 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/20',
              'aria-[invalid=true]:border-bad disabled:cursor-not-allowed disabled:bg-sunken',
              mono && 'font-mono text-[0.8125rem]',
            )}
            data-autofocus={autoFocus ? '' : undefined}
            onFocus={(event) => {
              if (value) event.currentTarget.select()
            }}
            onClick={openList}
            onChange={(event) => {
              setText(event.target.value)
              setActive(0)
              setOpen(true)
              if (value) onChange(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (open) setActive((index) => Math.min(index + 1, matches.length - 1))
                else openList()
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter' && open && (matches[active] || value)) {
                event.preventDefault()
                event.stopPropagation()
                if (matches[active]) select(matches[active]!)
                else setOpen(false)
              } else if (event.key === 'Tab' && open && !value && text.trim() && matches[active]) {
                select(matches[active]!)
              } else if (event.key === 'Escape' && open) {
                event.stopPropagation()
                setOpen(false)
              }
            }}
            onBlur={() => {
              // A half-typed query that was never accepted should not linger as if it were chosen.
              if (!value) setText('')
            }}
            {...aria}
          />
          {value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                select(null)
                inputRef.current?.focus()
              }}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-[5px] text-ink-3 hover:bg-sunken hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target === inputRef.current) event.preventDefault()
          }}
          className="z-[60] flex max-h-72 w-[var(--radix-popover-trigger-width)] min-w-56 animate-pop-in flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-pop"
        >
          <ul ref={setList} id={listId} role="listbox" className="flex scroll-py-1.5 flex-col overflow-y-auto p-1.5">
            {matches.length === 0 && <li className="px-2.5 py-2 text-sm text-ink-3">{emptyText}</li>}
            {matches.map((item, index) => (
              <li
                key={getKey(item)}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseMove={(event) => {
                  // A list that scrolls under a resting pointer makes some browsers send a mousemove from the pointer's own spot.
                  // Only a pointer that has moved takes the highlight.
                  const at = `${event.clientX},${event.clientY}`
                  if (at === pointerAt.current) return
                  pointerAt.current = at
                  if (index === active) return
                  pointerMoved.current = true
                  setActive(index)
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
                className={cn('cursor-pointer rounded-[6px] px-2.5 py-1.5 text-sm text-ink', index === active && 'bg-accent-soft')}
              >
                {renderItem ? renderItem(item) : getLabel(item)}
              </li>
            ))}
          </ul>
          {found.length > matches.length && (
            <p onMouseDown={(event) => event.preventDefault()} className="shrink-0 border-t border-line px-3 py-1.5 text-xs text-ink-3">
              Showing the first {matches.length} of {found.length.toLocaleString()}. Type to narrow the list.
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
