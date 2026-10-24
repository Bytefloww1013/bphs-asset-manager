// Oxlint JS plugin: the module boundaries (issue #23, ModularArchitecture-plan.md > Decisions > Boundaries), as one rule `boundaries/imports`.
// Each import, `export … from` and `import()` is resolved to a repo path first, so a relative path out of a module is caught as
// well as a `#…` one. It refuses:
//  (a) web code → server code;
//  (b) a foundation module → a feature module;
//  (c) code outside a module → anything but that module's public API (`<side>/index.ts`); the generated registries may import manifests;
//  (d) shared code → server or web code;
//  (e) a confidential module (`confidential: true` in its shared manifest) → foundation/notifications: it never notifies or shows counts;
//  (f) kernel code → a feature module, except through the generated registries.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { imports?: Record<string, string> }
// The package.json subpath imports, plus the website's Vite aliases (vite.config.ts, web/tsconfig.json).
const ALIASES: [string, string][] = [
  ...Object.entries(pkg.imports ?? {}).map(([from, to]): [string, string] => [
    from.replace(/\*$/, ''),
    to.replace(/^\.\//, '').replace(/\*$/, ''),
  ]),
  ['@/', 'web/src/'],
  ['@shared/', 'shared/'],
]
const SIDES = new Set(['server', 'shared', 'web'])
/** The one file per side that the generated registries import. */
const MANIFESTS: Record<string, string> = { shared: 'manifest.ts', server: 'module.ts', web: 'module.ts' }

type Tier = 'kernel' | 'foundation' | 'feature' | 'other'
interface Place {
  /** `kernel`, `<tier folder>/<name>` for a module, or `other` (scripts, root config). */
  owner: string
  tier: Tier
  side: string
  /** The path inside the side folder. */
  rest: string
}

function place(rel: string): Place {
  const [top = '', name = '', side = '', ...rest] = rel.split('/')
  if ((top === 'modules' || top === 'foundation') && name) {
    const tier = top === 'modules' ? 'feature' : 'foundation'
    return { owner: `${top}/${name}`, tier, side: SIDES.has(side) ? side : 'other', rest: rest.join('/') }
  }
  if (SIDES.has(top))
    return { owner: 'kernel', tier: 'kernel', side: top, rest: [name, side, ...rest].filter(Boolean).join('/') }
  return { owner: 'other', tier: 'other', side: 'other', rest: rel }
}

/** The repo path an import points at, or undefined for a package. `fromFile` is absolute. */
export function resolve(fromFile: string, spec: string): string | undefined {
  const bare = spec.replace(/\?.*$/, '')
  if (bare.startsWith('./') || bare.startsWith('../')) {
    return path
      .relative(root, path.resolve(path.dirname(fromFile), bare))
      .split(path.sep)
      .join('/')
  }
  const alias = ALIASES.find(([from]) => bare.startsWith(from))
  return alias ? path.posix.join(alias[1], bare.slice(alias[0].length)) : undefined
}

/** The modules whose shared manifest says `confidential: true`, as `<tier folder>/<name>`. `bun run modules:gen` checks this agrees with the manifests. */
export function confidentialModules(dir = root): Set<string> {
  const found = new Set<string>()
  for (const tier of ['foundation', 'modules']) {
    if (!existsSync(path.join(dir, tier))) continue
    for (const name of readdirSync(path.join(dir, tier))) {
      const manifest = path.join(dir, tier, name, 'shared', 'manifest.ts')
      if (existsSync(manifest) && /\bconfidential:\s*true\b/.test(readFileSync(manifest, 'utf8')))
        found.add(`${tier}/${name}`)
    }
  }
  return found
}

export interface Rules {
  confidential: ReadonlySet<string>
}

const RULES: Rules = { confidential: confidentialModules() }

/** Why importing `toRel` from `fromRel` (repo paths) crosses a boundary, or undefined if it may. */
export function problem(fromRel: string, toRel: string, rules: Rules = RULES): string | undefined {
  const from = place(fromRel)
  const to = place(toRel)
  const registry = from.tier === 'kernel' && path.posix.basename(fromRel) === 'modules.gen.ts'
  if (from.side === 'web' && to.side === 'server') return 'web code may not import server code'
  if (from.side === 'shared' && (to.side === 'server' || to.side === 'web'))
    return 'shared code may not import server or web code'
  if (from.tier === 'foundation' && to.tier === 'feature') return 'a foundation module may not import a feature module'
  if (rules.confidential.has(from.owner) && to.owner === 'foundation/notifications') {
    return 'a confidential module never notifies or shows counts, so it may not import notifications'
  }
  if (from.tier === 'kernel' && to.tier === 'feature' && !registry) {
    return 'kernel code reaches a feature module only through the generated registries'
  }
  if ((to.tier === 'feature' || to.tier === 'foundation') && to.owner !== from.owner) {
    const publicApi = to.side !== 'other' && to.rest === 'index.ts'
    const manifest = registry && MANIFESTS[to.side] === to.rest
    if (!publicApi && !manifest)
      return `import ${to.owner} only through its public API (${to.owner}/{server,shared,web}/index.ts)`
  }
  return undefined
}

interface Node {
  source?: { value?: unknown } | null
}
interface Context {
  filename: string
  report(descriptor: { node: unknown; message: string }): void
}

const imports = {
  meta: { type: 'problem' },
  create(context: Context) {
    const fromRel = path.relative(root, context.filename).split(path.sep).join('/')
    const check = (node: Node) => {
      const spec = node.source?.value
      if (typeof spec !== 'string') return
      const toRel = resolve(context.filename, spec)
      const why = toRel && problem(fromRel, toRel)
      if (why) context.report({ node: node.source, message: `${why}: '${spec}'` })
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    }
  },
}

const plugin = { meta: { name: 'boundaries' }, rules: { imports } }
export default plugin
