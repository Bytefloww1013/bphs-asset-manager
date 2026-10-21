import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
  Unlink,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { RICH_TEXT_LINK_SCHEMES, RICH_TEXT_MAX_CHARS, richTextHref, richTextToPlain } from '@shared/richtext.ts'
import { cn } from '@/lib/cn.ts'
import { Button } from './button.tsx'
import { Input } from './form.tsx'
import { Tooltip } from './tooltip.tsx'

export interface RichTextEditorProps {
  /** What a screen reader calls the text area; the same words as the visible label. */
  label: string
  /** The body to start from: empty, or HTML the server stored. Read once. */
  defaultValue?: string
  /** Called with the body as HTML on every change, and with an empty string when nothing is written. */
  onChange?: (html: string) => void
  /** Given by `Field`. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

interface Tool {
  key: 'bold' | 'italic' | 'underline' | 'strike' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'quote'
  label: string
  shortcut: string
  icon: LucideIcon
  run: (editor: Editor) => void
}

// The bar offers exactly the allow-list in shared/richtext.ts, in three groups.
const MARKS: Tool[] = [
  { key: 'bold', label: 'Bold', shortcut: 'Ctrl+B', icon: Bold, run: (e) => e.chain().focus().toggleBold().run() },
  {
    key: 'italic',
    label: 'Italic',
    shortcut: 'Ctrl+I',
    icon: Italic,
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: 'underline',
    label: 'Underline',
    shortcut: 'Ctrl+U',
    icon: Underline,
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    key: 'strike',
    label: 'Strikethrough',
    shortcut: 'Ctrl+Shift+S',
    icon: Strikethrough,
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
]
const HEADINGS: Tool[] = [
  {
    key: 'h2',
    label: 'Heading',
    shortcut: 'Ctrl+Alt+2',
    icon: Heading2,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: 'Subheading',
    shortcut: 'Ctrl+Alt+3',
    icon: Heading3,
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
]
const BLOCKS: Tool[] = [
  {
    key: 'bullet',
    label: 'Bulleted list',
    shortcut: 'Ctrl+Shift+8',
    icon: List,
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ordered',
    label: 'Numbered list',
    shortcut: 'Ctrl+Shift+7',
    icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'quote',
    label: 'Quote',
    shortcut: 'Ctrl+Shift+B',
    icon: TextQuote,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
]

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  tabbable,
  onRun,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  tabbable?: boolean
  onRun: () => void
  children: ReactNode
}) {
  return (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        // The bar is one tab stop and the arrow keys move along it; the link form's few buttons are ordinary tab stops.
        tabIndex={tabbable ? undefined : -1}
        // Keeps the selection in the text while the button is pressed.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRun}
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent',
          active &&
            'bg-accent-soft text-accent ring-1 ring-inset ring-accent-line hover:bg-accent-soft hover:text-accent',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />

/** What was typed as a link address, with `https://` or `mailto:` added to a bare one. Null if it is not an allowed address. */
function typedHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return richTextHref(value)
  return richTextHref(value.includes('@') && !value.includes('/') ? `mailto:${value}` : `https://${value}`)
}

function LinkForm({ editor, current, onDone }: { editor: Editor; current: string; onDone: () => void }) {
  const [value, setValue] = useState(current)
  const [bad, setBad] = useState(false)
  const apply = () => {
    const href = typedHref(value)
    if (!href) return setBad(true)
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    onDone()
  }
  const cancel = () => {
    editor.commands.focus()
    onDone()
  }
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <Input
        autoFocus
        aria-label="Link address"
        aria-invalid={bad || undefined}
        placeholder="https://… or name@example.org"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setBad(false)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return
          // Neither key may reach the form or the sheet around the editor.
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'Enter') apply()
          else cancel()
        }}
        className="h-8 min-w-40 flex-1"
      />
      <Button size="sm" variant="primary" onClick={apply}>
        {current ? 'Update link' : 'Add link'}
      </Button>
      {current && (
        <ToolButton
          label="Remove link"
          tabbable
          onRun={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            onDone()
          }}
        >
          <Unlink className="size-4" strokeWidth={1.75} />
        </ToolButton>
      )}
      <ToolButton label="Cancel" tabbable onRun={cancel}>
        <X className="size-4" strokeWidth={1.75} />
      </ToolButton>
      {bad && (
        <p role="alert" className="basis-full pb-1 pl-1 text-xs font-medium text-bad">
          Enter a web address (http or https) or an email address.
        </p>
      )}
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false)
  const [inside, setInside] = useState(false)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  /** Left and Right, Home and End move along the bar; Escape goes back to the text. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (linking) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      return void editor.commands.focus()
    }
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    buttons[(to + buttons.length) % buttons.length]?.focus()
  }

  const tool = (t: Tool) => (
    <ToolButton key={t.key} label={t.label} shortcut={t.shortcut} active={state[t.key]} onRun={() => t.run(editor)}>
      <t.icon className="size-4" strokeWidth={1.75} />
    </ToolButton>
  )

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      // One tab stop: focus arriving on the bar goes to its first button. While focus is inside, the bar itself steps out of the
      // tab order, so Shift+Tab leaves it instead of landing back on it.
      tabIndex={linking ? undefined : inside ? -1 : 0}
      onFocus={(event) => {
        setInside(true)
        if (event.target === event.currentTarget)
          event.currentTarget.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInside(false)
      }}
      onKeyDown={onKeyDown}
      className="sticky top-0 z-10 flex min-h-10 flex-wrap items-center gap-0.5 rounded-t-[calc(var(--radius-control)-1px)] border-b border-line bg-sunken px-1.5 py-1 focus-visible:outline-none"
    >
      {linking ? (
        <LinkForm editor={editor} current={state.href} onDone={() => setLinking(false)} />
      ) : (
        <>
          {MARKS.map(tool)}
          <ToolButton label={state.link ? 'Edit link' : 'Link'} active={state.link} onRun={() => setLinking(true)}>
            <LinkIcon className="size-4" strokeWidth={1.75} />
          </ToolButton>
          <Divider />
          {HEADINGS.map(tool)}
          <Divider />
          {BLOCKS.map(tool)}
          <span className="flex-1" />
          <ToolButton
            label="Undo"
            shortcut="Ctrl+Z"
            disabled={!state.canUndo}
            onRun={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="size-4" strokeWidth={1.75} />
          </ToolButton>
          <ToolButton
            label="Redo"
            shortcut="Ctrl+Y"
            disabled={!state.canRedo}
            onRun={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="size-4" strokeWidth={1.75} />
          </ToolButton>
        </>
      )}
    </div>
  )
}

/** Characters written against the limit, counted the way the server counts them. Past the limit it says so in words, not only in red. */
function Count({ editor }: { editor: Editor }) {
  const length = useEditorState({ editor, selector: ({ editor: e }) => richTextToPlain(e.getHTML()).length })
  const over = length > RICH_TEXT_MAX_CHARS
  return (
    <span className={cn('shrink-0 font-mono text-xs tabular-nums', over ? 'font-medium text-bad' : 'text-ink-3')}>
      {length.toLocaleString('en-US')} / {RICH_TEXT_MAX_CHARS.toLocaleString('en-US')}
      {over && ' · over the limit'}
    </span>
  )
}

// Built once: a new list on each render would make useEditor throw the editor away and start another.
const EXTENSIONS = [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    horizontalRule: false,
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      defaultProtocol: 'https',
      protocols: [...RICH_TEXT_LINK_SCHEMES],
      // The same two attributes the server writes, so a saved body comes back identical.
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    },
  }),
]

export default function RichTextEditor({
  label,
  defaultValue = '',
  onChange,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: RichTextEditorProps) {
  const frame = useRef<HTMLDivElement>(null)
  const changed = useRef(onChange)
  useLayoutEffect(() => {
    changed.current = onChange
  })

  // ProseMirror takes attributes as strings and `class`, not `className`; the ones not set are left out.
  const attributes: Record<string, string> = {
    class: 'rich-text min-h-64',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    'aria-keyshortcuts': 'Alt+F10',
  }
  if (id) attributes.id = id
  if (describedBy) attributes['aria-describedby'] = describedBy
  if (invalid) attributes['aria-invalid'] = 'true'

  const editorProps: NonNullable<Parameters<typeof useEditor>[0]>['editorProps'] = {
    attributes,
    // Alt+F10 moves from the text to the bar, as in other editors; Tab stays free to leave the field.
    handleKeyDown: (_view, event) => {
      if (!event.altKey || event.key !== 'F10') return false
      frame.current?.querySelector<HTMLElement>('[role=toolbar] button:not(:disabled)')?.focus()
      return true
    },
  }

  const editor = useEditor({
    // The app's own stylesheet carries the editor's rules, so Tiptap adds no style element of its own.
    injectCSS: false,
    // Made after the first render, not during it. This component arrives lazily, and an editor made during a render that React
    // then pauses is destroyed by Tiptap before it is ever shown.
    immediatelyRender: false,
    extensions: EXTENSIONS,
    content: defaultValue,
    // useEditor passes changed props on to the same editor, so an error or hint that arrives later reaches the text area.
    editorProps,
    onUpdate: ({ editor: e }) => changed.current?.(e.isEmpty ? '' : e.getHTML()),
  })

  return (
    <div
      ref={frame}
      className={cn(
        'min-h-80 rounded-control border border-line-strong bg-surface shadow-[inset_0_1px_1px_oklch(0.2_0.02_262/0.04)] transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20',
        invalid && 'border-bad focus-within:border-bad focus-within:ring-bad/20',
      )}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="px-3.5 py-3" />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-b-[calc(var(--radius-control)-1px)] border-t border-line bg-canvas px-3.5 py-1.5">
        <span className="text-xs text-ink-3">
          Headings, lists, quotes and links. No images; add those as attachments.
        </span>
        {editor && <Count editor={editor} />}
      </div>
    </div>
  )
}
