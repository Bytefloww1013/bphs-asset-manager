// `bun run docs:gen [--check]` (issue #23): writes the module table in `docs/architecture.md`, between its two marker
// comments, from every module folder, in registry order (`app.modules.ts`): its shared manifest (tier, dependencies,
// permission resources), its website side (workspaces) and its server side (jobs). It runs under tsx with the website's
// tsconfig, because plain Node can't load a `web/module.ts` (`.tsx` imports and the `@/` alias).
// `--check` writes nothing and fails if the table is out of date; `bun run docs:check` runs the same check.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SharedManifest } from '../shared/modules.ts'
import { findModules, planModules } from './gen-modules.ts'
import { confidentialModules } from './oxlint-boundaries.ts'

const root = path.resolve(import.meta.dirname, '..')
export const ARCHITECTURE = 'docs/architecture.md'
export const BEGIN = '<!-- modules:begin (written by `bun run docs:gen`; do not edit by hand) -->'
export const END = '<!-- modules:end -->'

/** What the table says about one module. */
export interface ModuleFacts {
  /** `foundation/<id>` or `modules/<id>`. */
  folder: string
  manifest: SharedManifest
  workspaces: readonly { id: string; label: string }[]
  jobs: readonly { name: string; every: number; atStart?: boolean }[]
}

/** The default export of a module side, if it has that side. Loaded by path, so no tool follows it as an import. */
async function side<T>(dir: string, folder: string, file: string): Promise<T | undefined> {
  const target = path.join(dir, folder, file)
  if (!existsSync(target)) return undefined
  return ((await import(pathToFileURL(target).href)) as { default: T }).default
}

/** Every module, in registry order (dependencies first); or what is wrong. */
export async function moduleFacts(dir = root): Promise<{ facts: ModuleFacts[]; errors: string[] }> {
  const { found, errors } = await findModules(dir)
  const { FEATURES } = (await import(pathToFileURL(path.join(dir, 'app.modules.ts')).href)) as {
    FEATURES: readonly string[]
  }
  const plan = planModules(found, FEATURES, confidentialModules(dir))
  errors.push(...plan.errors)
  if (errors.length) return { facts: [], errors }
  const facts: ModuleFacts[] = []
  for (const module of plan.modules) {
    const web = await side<{ workspaces?: ModuleFacts['workspaces'] }>(dir, module.folder, 'web/module.ts')
    const server = await side<{ jobs?: ModuleFacts['jobs'] }>(dir, module.folder, 'server/module.ts')
    facts.push({
      folder: module.folder,
      manifest: module.manifest,
      workspaces: (web?.workspaces ?? []).map(({ id, label }) => ({ id, label })),
      jobs: (server?.jobs ?? []).map(({ name, every, atStart }) => ({ name, every, atStart })),
    })
  }
  return { facts, errors }
}

/** 21_600_000 → `6 h`, 60_000 → `1 min`. */
export const interval = (ms: number) =>
  ms % 3_600_000 === 0 ? `${ms / 3_600_000} h` : ms % 60_000 === 0 ? `${ms / 60_000} min` : `${ms / 1000} s`

const code = (text: string) => `\`${text}\``
const list = (items: readonly string[], separator = ', ') => (items.length ? items.join(separator) : '-')

/** The Markdown table, links relative to `docs/`. */
export function renderTable(facts: readonly ModuleFacts[]): string {
  const rows = facts.map(({ folder, manifest, workspaces, jobs }) => [
    `[${code(manifest.id)}](../${folder}/README.md)`,
    manifest.tier,
    manifest.confidential ? 'yes' : '-',
    list(manifest.dependsOn.map(code)),
    list(
      (manifest.resources ?? []).map((resource) => `${code(resource.key)}: ${resource.levels.join(', ')}`),
      '; ',
    ),
    list(workspaces.map((workspace) => `${code(workspace.id)} (${workspace.label})`)),
    list(
      jobs.map((job) => `${code(job.name)}, every ${interval(job.every)}${job.atStart ? ' and at start' : ''}`),
      '; ',
    ),
  ])
  const head = ['Module', 'Tier', 'Confidential', 'Depends on', 'Permission resources', 'Workspaces', 'Jobs']
  return [head, head.map(() => '---'), ...rows].map((cells) => `| ${cells.join(' | ')} |`).join('\n')
}

/** `text` with the table between its markers replaced, or why it can't be. */
export function withTable(text: string, table: string): { text?: string; error?: string } {
  const begin = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  if (begin < 0 || end < begin) return { error: `${ARCHITECTURE} has no "${BEGIN}" … "${END}" markers` }
  return { text: `${text.slice(0, begin + BEGIN.length)}\n\n${table}\n\n${text.slice(end)}` }
}

/** Writes the table (not with `check`), and says what is wrong or whether it changed. */
export async function generateDocs(dir = root, check = false): Promise<{ errors: string[]; changed: boolean }> {
  const { facts, errors } = await moduleFacts(dir)
  if (errors.length) return { errors, changed: false }
  const file = path.join(dir, ARCHITECTURE)
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const after = withTable(before, renderTable(facts))
  if (after.error !== undefined || after.text === undefined) return { errors: [after.error ?? ''], changed: false }
  const changed = after.text !== before
  if (changed && !check) writeFileSync(file, after.text)
  return { errors: [], changed }
}

if (process.argv[1] === import.meta.filename) {
  const check = process.argv.includes('--check')
  const { errors, changed } = await generateDocs(root, check)
  if (errors.length) {
    for (const error of errors) console.error(`docs:gen: ${error}`)
    process.exitCode = 1
  } else if (check && changed) {
    console.error(`docs:gen: the module table in ${ARCHITECTURE} is out of date. Run \`bun run docs:gen\`.`)
    process.exitCode = 1
  } else console.log(changed ? `docs:gen: wrote ${ARCHITECTURE}` : 'docs:gen: up to date')
}
