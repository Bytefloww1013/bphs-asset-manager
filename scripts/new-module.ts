// `bun run new-module <name> [--foundation]` (issue #23): scaffolds a module from `scripts/templates/module/`: its
// manifests, table, service, routes, page, queries, a test and a README with the required sections. A feature module goes
// in `modules/<name>` and is added to `FEATURES` in `app.modules.ts`; a foundation one goes in `foundation/<name>`.
// Then it formats what it wrote and rewrites the generated registries. The migration and the route tree are left to the
// commands it prints, as they are for any change. The guide is `docs/modules.md`.
//
// Templates end in `.tmpl`, so no tool reads them as code. `<file>.feature.tmpl` and `<file>.foundation.tmpl` are one
// file's two tiers. `{{id}}`, `{{Label}}`, `{{label}}`, `{{camel}}`, `{{Pascal}}`, `{{table}}`, `{{tier}}` and
// `{{where}}` are filled in, in file names too.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { generate } from './gen-modules.ts'

const root = path.resolve(import.meta.dirname, '..')
const TEMPLATES = path.join(import.meta.dirname, 'templates', 'module')
const TIER_FOLDER = { foundation: 'foundation', feature: 'modules' } as const
/** The kernel's own API paths (`server/app.ts`); its pages are read from `web/src/routes/`. */
const KERNEL_API = ['api', 'auth', 'import', 'lists', 'lookups', 'users', 'webhooks']

export type Tier = keyof typeof TIER_FOLDER

/** What the templates' placeholders are filled in with. */
export type Names = Record<'id' | 'Label' | 'label' | 'camel' | 'Pascal' | 'table' | 'tier' | 'where', string>

export function names(id: string, tier: Tier): Names {
  const words = id.split('-')
  const label = words.join(' ')
  const Pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  return {
    id,
    Label: label.charAt(0).toUpperCase() + label.slice(1),
    label,
    camel: Pascal.charAt(0).toLowerCase() + Pascal.slice(1),
    Pascal,
    table: words.join('_'),
    tier,
    where:
      tier === 'feature'
        ? 'a workspace (last on the rail)'
        : "no workspace: a feature module lists the page in its nav, as Assets' lists Employees",
  }
}

/** The page names the kernel's routes take: `login`, `users`, `me` and the rest. */
function kernelPages(dir: string): string[] {
  const routes = path.join(dir, 'web', 'src', 'routes')
  const entries = [routes, path.join(routes, '_app')].flatMap((folder) =>
    existsSync(folder) ? readdirSync(folder) : [],
  )
  return entries.filter((entry) => !entry.startsWith('_')).map((entry) => entry.split('.')[0] ?? entry)
}

/** Why `id` can't be a new module's, or nothing when it can. */
export function idProblems(id: string, dir = root): string[] {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id))
    return [`"${id}" must be kebab-case: lower-case letters and digits, a letter first, words joined by single hyphens`]
  const problems: string[] = []
  for (const top of Object.values(TIER_FOLDER))
    if (existsSync(path.join(dir, top, id))) problems.push(`${top}/${id} already exists`)
  if (new Set([...KERNEL_API, ...kernelPages(dir)]).has(id)) problems.push(`"${id}" is one of the kernel's own paths`)
  if (problems.length) return problems
  const { table } = names(id, 'feature')
  const schemas = [
    path.join('server', 'db', 'schema.ts'),
    ...Object.values(TIER_FOLDER).flatMap((top) =>
      existsSync(path.join(dir, top))
        ? readdirSync(path.join(dir, top)).map((name) => path.join(top, name, 'server', 'schema.ts'))
        : [],
    ),
  ]
  const taken = schemas.find(
    (file) =>
      existsSync(path.join(dir, file)) && readFileSync(path.join(dir, file), 'utf8').includes(`sqliteTable('${table}'`),
  )
  if (taken) problems.push(`the table ${table} is already in ${taken}`)
  return problems
}

/** Every template file under `folder`, as a path relative to the templates folder. */
function templates(folder = TEMPLATES): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name)
    return entry.isDirectory() ? templates(full) : [path.relative(TEMPLATES, full)]
  })
}

/** The module's files for this tier: each path (relative to its folder) and its text. */
export function render(values: Names): { file: string; text: string }[] {
  const fill = (text: string) =>
    text.replaceAll(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (!(key in values)) throw new Error(`unknown placeholder ${match}`)
      return values[key as keyof Names]
    })
  const other = values.tier === 'feature' ? 'foundation' : 'feature'
  return templates()
    .filter((file) => !file.endsWith(`.${other}.tmpl`))
    .map((file) => ({
      file: fill(file.replace(new RegExp(`(\\.${values.tier})?\\.tmpl$`), '')),
      text: fill(readFileSync(path.join(TEMPLATES, file), 'utf8')),
    }))
    .sort((a, b) => a.file.localeCompare(b.file))
}

/** `app.modules.ts` with `id` added at the end of `FEATURES`. */
export function addFeature(source: string, id: string): string {
  const list = /export const FEATURES = \[([^\]]*)\] as const/
  const match = list.exec(source)
  if (!match) throw new Error('app.modules.ts has no `export const FEATURES = [...] as const`')
  const ids = [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((found) => found[1])
  return source.replace(
    list,
    `export const FEATURES = [${[...ids, id].map((name) => `'${name}'`).join(', ')}] as const`,
  )
}

/** Writes the module, and lists a feature module in `app.modules.ts`. Returns the paths written, relative to `dir`. */
export function scaffold(id: string, tier: Tier, dir = root): string[] {
  const folder = path.join(TIER_FOLDER[tier], id)
  const written = render(names(id, tier)).map(({ file, text }) => {
    const target = path.join(dir, folder, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, text, { flag: 'wx' })
    return path.join(folder, file)
  })
  if (tier === 'feature') {
    const app = path.join(dir, 'app.modules.ts')
    writeFileSync(app, addFeature(readFileSync(app, 'utf8'), id))
    written.push('app.modules.ts')
  }
  return written
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2)
  const tier: Tier = args.includes('--foundation') ? 'foundation' : 'feature'
  const [id, ...extra] = args.filter((arg) => arg !== '--foundation')
  const problems = !id || extra.length ? ['usage: bun run new-module <name> [--foundation]'] : idProblems(id)
  if (problems.length || !id) {
    for (const problem of problems) console.error(`new-module: ${problem}`)
    process.exit(1)
  }
  const written = scaffold(id, tier)
  execFileSync(path.join(root, 'node_modules', '.bin', 'oxfmt'), [path.join(TIER_FOLDER[tier], id), 'app.modules.ts'], {
    cwd: root,
    stdio: 'ignore',
  })
  const { errors, changed } = await generate(root)
  for (const error of errors) console.error(`modules:gen: ${error}`)
  console.log(
    `new-module: wrote ${written.length} files in ${TIER_FOLDER[tier]}/${id}${tier === 'feature' ? ', and its line in app.modules.ts' : ''}`,
  )
  if (changed.length) console.log(`modules:gen: wrote ${changed.join(', ')}`)
  console.log(`Next:
  1. bun run db:generate --name ${names(id, tier).table}   the migration that makes its table
  2. bun run dev                                    writes the route tree; the page is at /${id}
  3. Fill in its README.md and the manifest's comment. docs/modules.md says how to grow it.
  4. bun run docs:gen                               adds it to the module table in docs/architecture.md`)
  if (errors.length) process.exit(1)
}
