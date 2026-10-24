// `bun run docs:check` (issue #23): fails when a doc has gone stale. It checks that
//  - every module folder has a README.md with the required sections (`REQUIRED_SECTIONS`, the ones `bun run new-module`
//    writes), in any order, among any others;
//  - the module table in docs/architecture.md is what `bun run docs:gen` would write;
//  - every repo path a Markdown doc quotes, in `code` or as a relative link, still exists.
// The plans (`*-plan.md`) are left out: they record the work as it was done, old paths included. So are `handoff/` and the
// tool folders. A doc that means a file that is gone (history) quotes it as `git show <commit>:<path>`, which isn't a path.
// Like docs:gen it runs under tsx with the website's tsconfig. CI's `test` job and `verify-done.sh` run it.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ARCHITECTURE, generateDocs } from './docs-gen.ts'

const root = path.resolve(import.meta.dirname, '..')

/** Every module README has these `## ` sections; a module may add its own (Jobs, Notifications, Kinds …). */
export const REQUIRED_SECTIONS = ['Tables', 'Resources and rules', 'Hooks', 'Public API', 'Pages', 'Gotchas'] as const

/** Docs whose quoted paths aren't checked. */
const UNCHECKED = [/-plan\.md$/, /^handoff\//, /^\.impeccable\//, /^\.rtk\//]

/** The import aliases a doc may quote a path with (package.json `imports`, the website's tsconfig `paths`). */
const ALIASES: readonly [string, string][] = [
  ['#kernel/', 'server/'],
  ['#shared/', 'shared/'],
  ['#foundation/', 'foundation/'],
  ['#modules/', 'modules/'],
  ['@/', 'web/src/'],
  ['@shared/', 'shared/'],
]

/** A repo-relative path with at least one `/`: no spaces, globs or placeholders (`*`, `<id>`, `{a,b}`, `…`). */
const PATH_LIKE = /^(\.{1,2}\/)*[\w.@$()+[\]-]+(\/[\w.@$()+[\]-]+)*\/?$/

export interface Quoted {
  path: string
  line: number
  /** A link is always relative to its doc; a code span may be relative to the repo, its doc or a module folder. */
  kind: 'code' | 'link'
}

/** The paths a Markdown doc quotes: code spans that look like a path, and relative link targets. Fenced code is skipped. */
export function quotedPaths(markdown: string): Quoted[] {
  const quoted: Quoted[] = []
  let fence: string | undefined
  markdown.split('\n').forEach((text, i) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1]
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker
      return
    }
    if (fence) return
    const line = i + 1
    for (const [, target = ''] of text.matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      if (/^(\w+:|#)/.test(target)) continue // a URL, `mailto:` or an anchor in the same doc
      const file = decodeURIComponent(target.replace(/[#?].*$/, ''))
      if (file) quoted.push({ path: file, line, kind: 'link' })
    }
    for (const [, , span = ''] of text.matchAll(/(`+)(.+?)\1(?!`)/g)) {
      let candidate = span.trim().replace(/:\d+(-\d+)?$/, '') // `server/app.ts:42`
      for (const [alias, folder] of ALIASES)
        if (candidate.startsWith(alias)) candidate = folder + candidate.slice(alias.length)
      if (candidate.includes('/') && PATH_LIKE.test(candidate)) quoted.push({ path: candidate, line, kind: 'code' })
    }
  })
  return quoted
}

/** The Markdown files git knows of (tracked, or new and not ignored), repo-relative, minus `UNCHECKED`. */
export function markdownDocs(dir = root): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md'], {
    cwd: dir,
    encoding: 'utf8',
  })
  const files = out.split('\n').filter((file) => file && existsSync(path.join(dir, file)))
  return [...new Set(files)].filter((file) => !UNCHECKED.some((pattern) => pattern.test(file))).sort()
}

/** `foundation/<id>` and `modules/<id>`, every module folder there is. */
export function moduleFolders(dir = root): string[] {
  return ['foundation', 'modules'].flatMap((top) =>
    existsSync(path.join(dir, top))
      ? readdirSync(path.join(dir, top), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${top}/${entry.name}`)
          .sort()
      : [],
  )
}

/** The required sections a module README lacks (all of them if it has no README). */
export function missingSections(readme: string | undefined): string[] {
  if (readme === undefined) return [...REQUIRED_SECTIONS]
  const headings = new Set([...readme.matchAll(/^## +(.+?)\s*$/gm)].map(([, heading]) => heading))
  return REQUIRED_SECTIONS.filter((section) => !headings.has(section))
}

/**
 * Each quoted path in `doc` that doesn't exist. A code span is checked only when it starts at a top-level repo entry, or at
 * something in its doc's folder (a module README quoting `server/schema.ts`). It exists if it is there from the repo root,
 * from the doc's folder, or from any module folder (a guide quoting a module's `web/module.ts`).
 */
export function missingPaths(doc: string, markdown: string, dir = root): string[] {
  const top = new Set(readdirSync(dir))
  const docDir = path.dirname(path.join(dir, doc))
  const bases = [dir, docDir, ...moduleFolders(dir).map((folder) => path.join(dir, folder))]
  const missing: string[] = []
  for (const quoted of quotedPaths(markdown)) {
    const first = quoted.path.split('/')[0] ?? ''
    if (quoted.kind === 'link') {
      if (!existsSync(path.resolve(docDir, quoted.path))) missing.push(`${doc}:${quoted.line}: link to ${quoted.path}`)
      continue
    }
    const relative = first === '.' || first === '..'
    if (!relative && !top.has(first) && !existsSync(path.join(docDir, first))) continue
    const found = relative
      ? existsSync(path.resolve(docDir, quoted.path))
      : bases.some((base) => existsSync(path.join(base, quoted.path)))
    if (!found) missing.push(`${doc}:${quoted.line}: \`${quoted.path}\``)
  }
  return missing
}

/** Everything docs:check finds wrong. */
export async function checkDocs(dir = root): Promise<string[]> {
  const problems: string[] = []
  for (const folder of moduleFolders(dir)) {
    const file = path.join(dir, folder, 'README.md')
    const missing = missingSections(existsSync(file) ? readFileSync(file, 'utf8') : undefined)
    if (!existsSync(file)) problems.push(`${folder} has no README.md`)
    else if (missing.length) problems.push(`${folder}/README.md lacks ${missing.map((s) => `"## ${s}"`).join(', ')}`)
  }
  const { errors, changed } = await generateDocs(dir, true)
  problems.push(...errors)
  if (changed) problems.push(`the module table in ${ARCHITECTURE} is out of date: run \`bun run docs:gen\``)
  for (const doc of markdownDocs(dir))
    for (const missing of missingPaths(doc, readFileSync(path.join(dir, doc), 'utf8'), dir))
      problems.push(`${missing} doesn't exist`)
  return problems
}

if (process.argv[1] === import.meta.filename) {
  const problems = await checkDocs()
  for (const problem of problems) console.error(`docs:check: ${problem}`)
  if (problems.length) process.exitCode = 1
  else console.log('docs:check: the docs are current')
}
