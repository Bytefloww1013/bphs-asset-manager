import sanitizeHtml from 'sanitize-html'
import { RICH_TEXT_MAX_CHARS, RICH_TEXT_TAGS, richTextHref, richTextToPlain } from '../../shared/richtext.ts'
import { HttpError } from './errors.ts'

export interface RichText {
  /** Sanitised HTML: the only form a browser is ever given back to display. */
  html: string
  /** The same body as plain text, for search, previews and Excel. */
  text: string
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...RICH_TEXT_TAGS],
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  // A tag that is not allowed is dropped and its text kept, except these, whose content is never text a person wrote.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title', 'iframe', 'svg', 'math', 'template'],
  transformTags: {
    // What other editors and a paste from Word send for the same formatting.
    b: 'strong',
    i: 'em',
    strike: 's',
    del: 's',
    // The server writes rel and target itself and keeps nothing else the browser sent. A link to anywhere but http, https or
    // mailto stops being a link: the tag goes, its text stays.
    a: (_tagName, attribs) => {
      const href = richTextHref(attribs.href)
      const kept: sanitizeHtml.Attributes = href ? { href, rel: 'noopener noreferrer', target: '_blank' } : {}
      return { tagName: href ? 'a' : 'span', attribs: kept }
    },
  },
}

/** Sanitises a body the browser sent. Run on every write; what the browser sends is never trusted. */
export function cleanRichText(input: string): RichText {
  // Empty paragraphs at either end are an editor's leftovers (it keeps one after a closing list or quote), not writing.
  const html = sanitizeHtml(input, OPTIONS)
    .trim()
    .replace(/^(?:<p>(?:\s|<br \/>)*<\/p>\s*)+|(?:\s*<p>(?:\s|<br \/>)*<\/p>)+$/g, '')
  return { html, text: richTextToPlain(html) }
}

/** As `cleanRichText`, and refuses a body that is empty (unless `optional`) or longer than the limit. */
export function requireRichText(input: string, field: string, options: { optional?: boolean } = {}): RichText {
  const body = cleanRichText(input)
  if (!body.text && !options.optional)
    throw new HttpError(422, 'body_required', 'Write something before saving.', { field })
  if (body.text.length > RICH_TEXT_MAX_CHARS) {
    throw new HttpError(
      422,
      'body_too_long',
      `This is too long. The limit is ${RICH_TEXT_MAX_CHARS.toLocaleString('en-US')} characters.`,
      { field },
    )
  }
  // A body of nothing but empty paragraphs is stored as nothing.
  return body.text ? body : { html: '', text: '' }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** A note typed as plain text, as a body: a paragraph for each block of it, with its line breaks kept. Nothing in it is read as markup. */
export function plainToRichText(text: string): RichText {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/[&<>"]/g, (m) => ESCAPES[m]!).replace(/\r?\n/g, '<br />')}</p>`)
  return cleanRichText(paragraphs.join(''))
}
