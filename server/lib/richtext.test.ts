import { describe, expect, it } from 'vitest'
import { RICH_TEXT_MAX_CHARS, richTextHref, richTextToPlain } from '../../shared/richtext.ts'
import { HttpError } from './errors.ts'
import { cleanRichText, requireRichText } from './richtext.ts'

const clean = (input: string) => cleanRichText(input).html

/** What the editor sends for a body that uses every allowed format. */
const EDITOR_OUTPUT =
  '<h2>What happened</h2><p>Leave was <strong>withdrawn</strong>, for the <em>second</em> time, <u>in public</u>, <s>in March</s> in April.<br />A second line.</p>' +
  '<h3>Asked for</h3><ul><li><p>Reinstatement</p></li><li><p>A written reason</p></li></ul><ol><li><p>Statement taken</p></li></ol>' +
  '<blockquote><p>You know where the door is.</p></blockquote>' +
  '<p><a href="https://intranet.example.org/leave/457" rel="noopener noreferrer" target="_blank">Request</a> and <a href="mailto:hr@example.org" rel="noopener noreferrer" target="_blank">HR</a></p>'

describe('cleanRichText', () => {
  it('keeps every allowed format exactly as the editor sent it, and a second pass changes nothing', () => {
    expect(clean(EDITOR_OUTPUT)).toBe(EDITOR_OUTPUT)
    expect(clean(clean(EDITOR_OUTPUT))).toBe(EDITOR_OUTPUT)
  })

  it('drops empty paragraphs at either end and keeps the ones between', () => {
    expect(cleanRichText('<p></p><p><br></p><p>One</p><p></p><p>Two</p><p> </p><p></p>').html).toBe('<p>One</p><p></p><p>Two</p>')
    expect(cleanRichText('<p></p><p><br></p>')).toEqual({ html: '', text: '' })
  })

  it('removes script tags and what is inside them', () => {
    expect(clean('<p>Before</p><script>alert(1)</script><p>After</p>')).toBe('<p>Before</p><p>After</p>')
    expect(clean('<p>a<script src="https://evil.example/x.js"></script>b</p>')).toBe('<p>ab</p>')
    expect(clean('<scr<script>ipt>alert(1)</script>')).not.toMatch(/<script/i)
    expect(clean('<style>p{display:none}</style><p>Shown</p>')).toBe('<p>Shown</p>')
  })

  it('removes event handlers', () => {
    expect(clean('<p onclick="alert(1)" onmouseover="alert(2)">Text</p>')).toBe('<p>Text</p>')
    expect(clean('<a href="https://example.org" onclick="alert(1)">x</a>')).toBe('<a href="https://example.org" rel="noopener noreferrer" target="_blank">x</a>')
    expect(clean('<img src="x" onerror="alert(1)"><p>Text</p>')).toBe('<p>Text</p>')
    expect(clean('<svg onload="alert(1)"><circle /></svg><p>Text</p>')).toBe('<p>Text</p>')
  })

  it('turns a link to anything but http, https or mailto back into plain text', () => {
    for (const href of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java&#x0A;script:alert(1)',
      '&#106;avascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//evil.example/path',
      '/relative/path',
      'ftp://example.org/file',
      'https:evil.example',
    ]) {
      const html = clean(`<p><a href="${href}">Click</a></p>`)
      expect(html, href).toBe('<p>Click</p>')
    }
    expect(clean('<p><a>No address</a></p>')).toBe('<p>No address</p>')
  })

  it('writes rel and target itself and keeps no other attribute of a link', () => {
    expect(clean('<a href="https://example.org/a?b=1&amp;c=2" rel="opener" target="_top" class="x" style="color:red" id="y" data-z="1">x</a>')).toBe(
      '<a href="https://example.org/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank">x</a>',
    )
    expect(clean('<a href="MAILTO:hr@example.org">x</a>')).toBe('<a href="MAILTO:hr@example.org" rel="noopener noreferrer" target="_blank">x</a>')
  })

  it('removes inline styles, classes and every other attribute', () => {
    expect(clean('<p style="position:fixed;background:url(javascript:alert(1))" class="big" id="x" dir="rtl">Text</p>')).toBe('<p>Text</p>')
    expect(clean('<ol start="5" type="a"><li value="9">One</li></ol>')).toBe('<ol><li>One</li></ol>')
    expect(clean('<h2 style="color:red"><span style="font-size:40px">Title</span></h2>')).toBe('<h2>Title</h2>')
  })

  it('drops tags that are not allowed and keeps the words inside them', () => {
    expect(clean('<h1>Big</h1><h4>Small</h4><div><span>Words</span></div>')).toBe('BigSmallWords')
    expect(clean('<p>A <code>term</code> and <mark>mark</mark></p><hr><pre>block</pre>')).toBe('<p>A term and mark</p>block')
    expect(clean('<table><tr><td>Cell</td></tr></table>')).toBe('Cell')
    expect(clean('<form action="https://evil.example"><input name="q"><button>Go</button></form>')).toBe('Go')
    expect(clean('<iframe src="https://evil.example">inside</iframe><p>Text</p>')).toBe('<p>Text</p>')
    expect(clean('<math><mtext><script>alert(1)</script></mtext></math><p>Text</p>')).toBe('<p>Text</p>')
    expect(clean('<p>Photo: <img src="https://example.org/a.png" alt="desk"></p>')).toBe('<p>Photo: </p>')
  })

  it('maps the older tags for the same formatting, as pasted from other editors', () => {
    expect(clean('<p><b>bold</b> <i>italic</i> <strike>gone</strike> <del>gone too</del></p>')).toBe('<p><strong>bold</strong> <em>italic</em> <s>gone</s> <s>gone too</s></p>')
  })

  it('closes what was left open and escapes text that looks like a tag', () => {
    expect(clean('<p><strong>open<em>nested</p><p>next')).toBe('<p><strong>open<em>nested</em></strong></p><p>next</p>')
    expect(clean('<p>5 &lt; 6 &amp; 7 &gt; 2</p>')).toBe('<p>5 &lt; 6 &amp; 7 &gt; 2</p>')
    expect(clean('plain words, no tags')).toBe('plain words, no tags')
  })

  it('gives the plain text alongside the HTML', () => {
    expect(cleanRichText(EDITOR_OUTPUT).text).toBe(
      [
        'What happened',
        'Leave was withdrawn, for the second time, in public, in March in April.',
        'A second line.',
        'Asked for',
        'Reinstatement',
        'A written reason',
        'Statement taken',
        'You know where the door is.',
        'Request and HR',
      ].join('\n'),
    )
  })
})

describe('requireRichText', () => {
  const problem = (run: () => unknown) => {
    try {
      run()
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, code: error.code, details: error.details }
      throw error
    }
    return null
  }

  it('refuses a body with no text in it, unless it is optional', () => {
    for (const empty of ['', '   ', '<p></p>', '<p> </p><p><br /></p>', '<script>alert(1)</script>']) {
      expect(problem(() => requireRichText(empty, 'body')), empty).toMatchObject({ status: 422, code: 'body_required', details: { field: 'body' } })
      expect(requireRichText(empty, 'body', { optional: true }), empty).toEqual({ html: '', text: '' })
    }
  })

  it('counts the limit in characters of text, not of HTML', () => {
    const atLimit = `<p><strong>${'a'.repeat(RICH_TEXT_MAX_CHARS)}</strong></p>`
    expect(requireRichText(atLimit, 'body').text).toHaveLength(RICH_TEXT_MAX_CHARS)
    expect(problem(() => requireRichText(`<p>${'a'.repeat(RICH_TEXT_MAX_CHARS + 1)}</p>`, 'body'))).toMatchObject({ status: 422, code: 'body_too_long' })
  })
})

describe('richTextToPlain', () => {
  it('starts a new line for each block and line break, so a heading does not run into the paragraph after it', () => {
    expect(richTextToPlain('<h2>Heading</h2><p>plain</p>')).toBe('Heading\nplain')
    expect(richTextToPlain('<p>one<br />two</p><ul><li><p>three</p></li><li>four</li></ul>')).toBe('one\ntwo\nthree\nfour')
    expect(richTextToPlain('<blockquote><p>said</p><p>this</p></blockquote><p>after</p>')).toBe('said\nthis\nafter')
  })

  it('decodes entities once, and leaves text that only looks like a tag as text', () => {
    expect(richTextToPlain('<p>5 &lt; 6 &amp; 7 &gt; 2, &quot;q&quot; &#39;a&#39; &#x41;&nbsp;B</p>')).toBe('5 < 6 & 7 > 2, "q" \'a\' A B')
    expect(richTextToPlain('<p>&amp;lt;script&amp;gt;</p>')).toBe('&lt;script&gt;')
    expect(richTextToPlain('<p>&lt;b&gt;not bold&lt;/b&gt;</p>')).toBe('<b>not bold</b>')
  })
})

describe('richTextHref', () => {
  it('accepts http, https and mailto addresses and nothing else', () => {
    expect(richTextHref('https://example.org/a')).toBe('https://example.org/a')
    expect(richTextHref(' http://example.org ')).toBe('http://example.org')
    expect(richTextHref('mailto:hr@example.org')).toBe('mailto:hr@example.org')
    for (const bad of [undefined, '', 'example.org', '/path', '//example.org', 'javascript:alert(1)', 'data:text/html,x', 'https:/one-slash', 'https://']) {
      expect(richTextHref(bad), String(bad)).toBeNull()
    }
  })
})
