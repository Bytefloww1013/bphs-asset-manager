import { GRIEVANCE_SHORT_DESCRIPTION_MAX, GRIEVANCE_TITLE_MAX } from '@shared/schemas.ts'
import { Field, Input, Textarea } from '@/components/ui/form.tsx'
import { RichTextEditor } from '@/components/ui/rich-text.tsx'
import { FilePicker, FILES_HINT } from '@/features/common/files.tsx'

/** What a timeline entry is written with. Each name is the one the field's error comes back under. */
export interface EntryText {
  title: string
  shortDescription: string
  body: string
  files: File[]
}

export const BLANK_ENTRY: EntryText = { title: '', shortDescription: '', body: '', files: [] }

const count = (text: string, max: number) => `${text.trim().length} of ${max} characters`

interface EntryFieldsProps {
  value: EntryText
  onChange: <K extends keyof EntryText>(name: K, value: EntryText[K]) => void
  error: (name: keyof EntryText) => string | null
  /** What the short description is for. The character count follows it. */
  shortDescriptionHint: string
  /** False where the form changes words only, as a CAP's edit does: files are added from the record's page. */
  files?: boolean
}

/** The fields an action or event on a grievance is written with, and a CAP on a review: Title, Short description, Details and Files. */
export function EntryFields({ value, onChange, error, shortDescriptionHint, files = true }: EntryFieldsProps) {
  return (
    <>
      <Field label="Title" hint={count(value.title, GRIEVANCE_TITLE_MAX)} error={error('title')}>
        <Input
          value={value.title}
          onChange={(event) => onChange('title', event.target.value)}
          autoComplete="off"
          autoFocus
        />
      </Field>
      <Field
        label="Short description"
        hint={`${shortDescriptionHint} ${count(value.shortDescription, GRIEVANCE_SHORT_DESCRIPTION_MAX)}`}
        error={error('shortDescription')}
      >
        <Textarea
          rows={2}
          className="min-h-0"
          value={value.shortDescription}
          onChange={(event) => onChange('shortDescription', event.target.value)}
        />
      </Field>
      <Field label="Details" hint="Optional. Anything the short description does not cover." error={error('body')}>
        <RichTextEditor label="Details" defaultValue={value.body} onChange={(body) => onChange('body', body)} />
      </Field>
      {files && (
        <Field label="Files" optional hint={FILES_HINT} error={error('files')}>
          <FilePicker value={value.files} onChange={(picked) => onChange('files', picked)} />
        </Field>
      )}
    </>
  )
}
