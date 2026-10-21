/**
 * The formatting a rich-text body may carry. The editor offers exactly this and the server keeps exactly this: anything else in
 * what a browser sends is removed before it is stored. No images, no inline styles, no scripts.
 */
export const RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
] as const

/** The only schemes a link may use. */
export const RICH_TEXT_LINK_SCHEMES = ['http', 'https', 'mailto'] as const

/** The longest body, counted in characters of its plain text. */
export const RICH_TEXT_MAX_CHARS = 100_000

/** A link's address if it uses an allowed scheme, otherwise null. Relative and protocol-relative addresses are refused. */
export function richTextHref(raw: string | undefined): string | null {
  const href = raw?.trim() ?? ''
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase()
  if (!scheme || !(RICH_TEXT_LINK_SCHEMES as readonly string[]).includes(scheme)) return null
  if (scheme !== 'mailto' && !/^https?:\/\/[^/\s]/i.test(href)) return null
  return href
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
    const code = name[1]!.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

/**
 * The plain text of sanitised rich-text HTML, for search, previews and Excel. Each block (paragraph, heading, list item, quote)
 * and each line break starts a new line; stripping the tags alone would run a heading into the paragraph after it.
 */
export function richTextToPlain(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h2|h3|li|ul|ol|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
