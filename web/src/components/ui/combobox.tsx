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

/** Every word typed has to appear somewhere in the label or the extra search text. An empty query matches everything. */
function searchItems<T>(items: T[], text: string, getLabel: (item: T) => string, getSearch?: (item: T) => string) {
  const query = text.trim().toLowerCase()
  if (!query) return items
  const words = query.split(/\s+/)
  return items.filter((item) => {
    const haystack = `${getLabel(item)} ${getSearch?.(item) ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

interface OptionListProps<T> {
  listId: string
  /** The matches that are shown, and how many there are in all. */
  matches: T[]
  total: number
  active: number
  onActive: (index: number) => void
  onPick: (item: T) => void
  /** True for a click that landed on the field itself, which must not close the list. */
  isField: (target: EventTarget | null) => boolean
  /** What is typed. A change scrolls the highlight back into view. */
  text: string
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  renderItem?: (item: T) => ReactNode
  emptyText: string
}

/** The list both pickers open. It renders in a portal so it is never clipped by a scrolling panel. */
function OptionList<T>({
  listId,
  matches,
  total,
  active,
  onActive,
  onPick,
  isField,
  text,
  getKey,
  getLabel,
  renderItem,
  emptyText,
}: OptionListProps<T>) {
  const [list, setList] = useState<HTMLUListElement | null>(null)
  const pointerMoved = useRef(false)
  const pointerAt = useRef('')

  // Keys, typing and opening move the highlight, so the list scrolls to keep it in view. The pointer moves it too, but its option is then under the
  // pointer already, and scrolling would fight the wheel.
  useEffect(() => {
    const byPointer = pointerMoved.current
    pointerMoved.current = false
    if (list && !byPointer) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [list, listId, active, text])

  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (isField(event.target)) event.preventDefault()
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
                onActive(index)
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(item)}
              className={cn(
                'cursor-pointer rounded-[6px] px-2.5 py-1.5 text-sm text-ink',
                index === active && 'bg-accent-soft',
              )}
            >
              {renderItem ? renderItem(item) : getLabel(item)}
            </li>
          ))}
        </ul>
        {total > matches.length && (
          <p
            onMouseDown={(event) => event.preventDefault()}
            className="shrink-0 border-t border-line px-3 py-1.5 text-xs text-ink-3"
          >
            Showing the first {matches.length} of {total.toLocaleString()}. Type to narrow the list.
          </p>
        )}
      </Popover.Content>
    </Popover.Portal>
  )
}

/** Type-ahead picker. Arrow keys move, Enter or Tab accepts the highlighted match, Esc closes. */
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

  // Follow the selected value when the parent changes it (reset, prefill).
  const label = value ? getLabel(value) : ''
  useEffect(() => setText(label), [label])

  const found = useMemo(
    () => (value && label === text ? items : searchItems(items, text, getLabel, getSearch)),
    [items, text, value, label, getLabel, getSearch],
  )
  const matches = useMemo(() => found.slice(0, MAX_RESULTS), [found])

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
      <OptionList
        listId={listId}
        matches={matches}
        total={found.length}
        active={active}
        onActive={setActive}
        onPick={select}
        isField={(target) => target === inputRef.current}
        text={text}
        getKey={getKey}
        getLabel={getLabel}
        renderItem={renderItem}
        emptyText={emptyText}
      />
    </Popover.Root>
  )
}

interface MultiComboboxProps<T> {
  /** Everything that can be picked. Items already chosen are left out of the list. */
  items: T[]
  value: T[]
  onChange: (value: T[]) => void
  getKey: (item: T) => string | number
  getLabel: (item: T) => string
  /** Extra text matched when filtering (ids, departments). */
  getSearch?: (item: T) => string
  renderItem?: (item: T) => ReactNode
  placeholder?: string
  emptyText?: string
  id?: string
  disabled?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/**
 * Type-ahead picker for several items, each shown as a chip in the field. Typing and the list work as in `Combobox`. Backspace in an
 * empty field removes the last chip. Left arrow from the start of the field walks back through the chips, where Backspace or Delete
 * removes the one in focus. The whole field is one tab stop.
 */
export function MultiCombobox<T>({
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
  inputRef: outerRef,
  className,
  ...aria
}: MultiComboboxProps<T>) {
  const listId = useId()
  const ownRef = useRef<HTMLInputElement>(null)
  const inputRef = outerRef ?? ownRef
  const field = useRef<HTMLDivElement>(null)
  const chips = useRef<(HTMLButtonElement | null)[]>([])
  // The chip to focus once a removal has rendered. Removing the chip in focus would otherwise drop focus to the page.
  const focusNext = useRef<number | null>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [said, setSaid] = useState('')

  const left = useMemo(() => {
    const chosen = new Set(value.map(getKey))
    return items.filter((item) => !chosen.has(getKey(item)))
  }, [items, value, getKey])
  const found = useMemo(() => searchItems(left, text, getLabel, getSearch), [left, text, getLabel, getSearch])
  const matches = useMemo(() => found.slice(0, MAX_RESULTS), [found])

  useEffect(() => {
    if (focusNext.current === null) return
    chips.current[focusNext.current]?.focus()
    focusNext.current = null
  }, [value])

  function openList() {
    setOpen(true)
    setActive(0)
  }

  /** The list stays open after a click, to pick several in a row. After Enter it closes, so a second Enter cannot add someone unseen. */
  function add(item: T, keepOpen: boolean) {
    onChange([...value, item])
    setSaid(`${getLabel(item)} added.`)
    setText('')
    setActive(0)
    setOpen(keepOpen)
  }

  function remove(index: number) {
    const item = value[index]
    if (item === undefined) return
    onChange(value.filter((_, at) => at !== index))
    setSaid(`${getLabel(item)} removed.`)
  }

  function focusChip(index: number) {
    setOpen(false)
    chips.current[index]?.focus()
  }

  const nothingLeft = left.length === 0 && items.length > 0
  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          ref={field}
          className={cn(
            'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-control border border-line-strong bg-surface px-1 py-[3px] shadow-[inset_0_1px_1px_oklch(0.2_0.02_262/0.04)] transition-[border-color,box-shadow] duration-150',
            'hover:border-ink-4 has-[input:focus-visible]:border-accent has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-accent/20',
            aria['aria-invalid'] && 'border-bad',
            disabled && 'cursor-not-allowed bg-sunken hover:border-line-strong',
            className,
          )}
          onMouseDown={(event) => {
            // The gaps around the chips belong to the field: a click there goes to the text.
            if (event.target !== event.currentTarget || disabled) return
            event.preventDefault()
            inputRef.current?.focus()
            openList()
          }}
        >
          {value.map((item, index) => (
            <span
              key={getKey(item)}
              className="flex h-7 max-w-full items-center rounded-[6px] border border-line bg-sunken pl-2 text-sm text-ink"
            >
              <span className="truncate">{getLabel(item)}</span>
              {disabled ? (
                <span className="w-2" />
              ) : (
                <button
                  ref={(node) => {
                    chips.current[index] = node
                  }}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Remove ${getLabel(item)}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    remove(index)
                    inputRef.current?.focus()
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'ArrowLeft' ||
                      event.key === 'ArrowRight' ||
                      event.key === 'Home' ||
                      event.key === 'End'
                    ) {
                      event.preventDefault()
                      const to =
                        event.key === 'ArrowLeft'
                          ? index - 1
                          : event.key === 'ArrowRight'
                            ? index + 1
                            : event.key === 'Home'
                              ? 0
                              : value.length
                      if (to >= value.length) inputRef.current?.focus()
                      else if (to >= 0) focusChip(to)
                    } else if (
                      event.key === 'Backspace' ||
                      event.key === 'Delete' ||
                      event.key === 'Enter' ||
                      event.key === ' '
                    ) {
                      event.preventDefault()
                      // Focus stays where the chip was: on the one that takes its place, or in the text when it was the last.
                      if (index < value.length - 1) focusNext.current = index
                      else inputRef.current?.focus()
                      remove(index)
                    }
                  }}
                  className="ml-0.5 mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] text-ink-3 hover:bg-line hover:text-ink"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </span>
          ))}
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
            placeholder={value.length === 0 ? placeholder : undefined}
            value={text}
            // An empty text box is content to share the last row of chips. Once there is text it takes a row of its own if it has to.
            className={cn(
              'h-7 flex-1 bg-transparent px-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none disabled:cursor-not-allowed',
              value.length > 0 && !text ? 'min-w-8' : 'min-w-24',
            )}
            onClick={openList}
            onChange={(event) => {
              setText(event.target.value)
              setActive(0)
              setOpen(true)
            }}
            onKeyDown={(event) => {
              const atStart = event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (open) setActive((index) => Math.min(index + 1, matches.length - 1))
                else openList()
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter' && open) {
                event.preventDefault()
                event.stopPropagation()
                if (matches[active]) add(matches[active]!, false)
                else setOpen(false)
              } else if (event.key === 'Tab' && open && text.trim() && matches[active]) {
                add(matches[active]!, false)
              } else if (event.key === 'Escape' && open) {
                event.stopPropagation()
                setOpen(false)
              } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
                event.preventDefault()
                remove(value.length - 1)
              } else if (event.key === 'ArrowLeft' && atStart && value.length > 0) {
                event.preventDefault()
                focusChip(value.length - 1)
              }
            }}
            onBlur={() => setText('')}
            {...aria}
          />
          <span role="status" className="sr-only">
            {said}
          </span>
        </div>
      </Popover.Anchor>
      <OptionList
        listId={listId}
        matches={matches}
        total={found.length}
        active={active}
        onActive={setActive}
        onPick={(item) => add(item, true)}
        isField={(target) => target instanceof Node && !!field.current?.contains(target)}
        text={text}
        getKey={getKey}
        getLabel={getLabel}
        renderItem={renderItem}
        emptyText={nothingLeft && !text.trim() ? 'Nothing left to add' : emptyText}
      />
    </Popover.Root>
  )
}
