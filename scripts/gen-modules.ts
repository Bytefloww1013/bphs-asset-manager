// `bun run modules:gen [--check]` (issue #23): writes the generated module registries, `shared/modules.gen.ts`,
// `server/modules.gen.ts` and `web/src/modules.gen.ts`, from `app.modules.ts` and each module's shared manifest.
// Every module is in: the foundation modules by name, then the feature modules in the order `app.modules.ts` lists them, which
// must be every folder in `modules/`. Dependencies come first. It refuses a feature module the list leaves out, an unknown
// or cyclic dependency, a foundation module that depends on a feature module, and an id, permission resource, notification
// kind or audit entity type declared twice. It reads only the shared manifests (plain Node
// can't import the website's .tsx), so duplicate route bases and workspace ids are caught by the registry tests instead.
// `--check` writes nothing and fails if a registry is out of date (CI, quick-check, verify-done).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SharedManifest } from '../shared/modules.ts'
import { confidentialModules } from './oxlint-boundaries.ts'

const root = path.resolve(import.meta.dirname, '..')
const TIER_FOLDER = { foundation: 'foundation', feature: 'modules' } as const

/** A module folder and the sides it has. */
export interface Found {
  /** `foundation/<name>` or `modules/<name>`. */
  folder: string
  manifest: SharedManifest
  server: boolean
  web: boolean
}

/** Every module folder, foundation first, each in name order, with its shared manifest. */
export async function findModules(dir = root): Promise<{ found: Found[]; errors: string[] }> {
  const found: Found[] = []
  const errors: string[] = []
  for (const top of Object.values(TIER_FOLDER)) {
    const base = path.join(dir, top)
    if (!existsSync(base)) continue
    const names = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    for (const name of names) {
      const folder = `${top}/${name}`
      const file = path.join(base, name, 'shared', 'manifest.ts')
      if (!existsSync(file)) {
        errors.push(`${folder} has no shared/manifest.ts`)
        continue
      }
      const { default: manifest } = (await import(pathToFileURL(file).href)) as { default?: SharedManifest }
      if (!manifest) {
        errors.push(`${folder}/shared/manifest.ts has no default export`)
        continue
      }
      const has = (side: string) => existsSync(path.join(base, name, side, 'module.ts'))
      found.push({ folder, manifest, server: has('server'), web: has('web') })
    }
  }
  return { found, errors }
}

/** Every module in registry order, or what is wrong. `confidential` is what lint rule (e) reads from the files. */
export function planModules(
  found: readonly Found[],
  features: readonly string[],
  confidential: ReadonlySet<string>,
): { modules: Found[]; errors: string[] } {
  const errors: string[] = []
  const byId = new Map<string, Found>()
  for (const module of found) {
    const { id, tier, confidential: secret, notificationKinds = {} } = module.manifest
    const home = `${TIER_FOLDER[tier]}/${id}`
    if (module.folder !== home)
      errors.push(`${module.folder}: its manifest says ${tier} module "${id}", which belongs in ${home}`)
    const taken = byId.get(id)
    if (taken) errors.push(`module id "${id}" is used by both ${taken.folder} and ${module.folder}`)
    else byId.set(id, module)
    if (secret !== confidential.has(module.folder))
      errors.push(
        `${module.folder}: write \`confidential: ${secret}\` as a literal in shared/manifest.ts, where lint rule (e) reads it`,
      )
    if (secret && Object.keys(notificationKinds).length)
      errors.push(`${module.folder}: a confidential module never notifies, so it declares no notification kinds`)
    if (secret && module.manifest.auditEntityTypes?.length)
      errors.push(
        `${module.folder}: a confidential module keeps its own audit log, so it declares no audit entity types`,
      )
    for (const kind of module.manifest.employeeNotificationKinds ?? [])
      if (!(kind in notificationKinds))
        errors.push(`${module.folder}: employee notification kind "${kind}" is not one of its notification kinds`)
    // The access form explains each level a resource offers, and only those.
    for (const { key, levels, help } of module.manifest.resources ?? []) {
      for (const level of levels)
        if (!help[level])
          errors.push(`${module.folder}: permission resource "${key}" doesn't explain its level "${level}"`)
      for (const level of Object.keys(help))
        if (!(levels as readonly string[]).includes(level))
          errors.push(`${module.folder}: permission resource "${key}" explains "${level}", a level it doesn't offer`)
    }
  }
  const modules = [...byId.values()]

  const listed = new Set<string>()
  for (const id of features) {
    const module = byId.get(id)
    if (listed.has(id)) errors.push(`app.modules.ts lists "${id}" twice`)
    else if (!module) errors.push(`app.modules.ts lists "${id}", but there is no modules/${id}`)
    else if (module.manifest.tier === 'foundation')
      errors.push(`app.modules.ts lists "${id}", a foundation module, which is always on`)
    listed.add(id)
  }
  // The list sets the order, so a feature module it leaves out would have none.
  for (const module of modules)
    if (module.manifest.tier === 'feature' && !listed.has(module.manifest.id))
      errors.push(`${module.folder} isn't listed in app.modules.ts, which lists every feature module in registry order`)

  const order: Found[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (module: Found, trail: readonly string[]) => {
    const { id, tier, dependsOn } = module.manifest
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') {
      errors.push(`dependency cycle: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}`)
      return
    }
    state.set(id, 'visiting')
    for (const dep of dependsOn) {
      const target = byId.get(dep)
      if (!target) errors.push(`${module.folder} depends on "${dep}", which doesn't exist`)
      else if (tier === 'foundation' && target.manifest.tier === 'feature')
        errors.push(`${module.folder} is a foundation module, so it can't depend on the feature module "${dep}"`)
      else visit(target, [...trail, id])
    }
    state.set(id, 'done')
    order.push(module)
  }
  const foundation = modules.filter((module) => module.manifest.tier === 'foundation')
  foundation.sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : 1))
  const listedFeatures = features.map((id) => byId.get(id)).filter((module) => module?.manifest.tier === 'feature')
  for (const module of [...foundation, ...listedFeatures]) if (module) visit(module, [])

  const owners: Record<'permission resource' | 'notification kind' | 'audit entity type', Map<string, string>> = {
    'permission resource': new Map(),
    'notification kind': new Map(),
    'audit entity type': new Map(),
  }
  const claim = (what: keyof typeof owners, key: string, folder: string) => {
    const owner = owners[what].get(key)
    if (owner) errors.push(`${what} "${key}" is declared by both ${owner} and ${folder}`)
    else owners[what].set(key, folder)
  }
  for (const { folder, manifest } of modules) {
    for (const resource of manifest.resources ?? []) claim('permission resource', resource.key, folder)
    for (const kind of Object.keys(manifest.notificationKinds ?? {})) claim('notification kind', kind, folder)
    for (const type of manifest.auditEntityTypes ?? []) claim('audit entity type', type, folder)
  }

  return { modules: errors.length ? [] : order, errors }
}

const HEADER = '// Generated by `bun run modules:gen` from app.modules.ts and the module manifests. Do not edit.'

/** `digital-assets` → `digitalAssets` + suffix. */
const binding = (id: string, suffix: string) =>
  id.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase()) + suffix

/** The three registry files, by repo path. */
export function render(modules: readonly Found[]): Record<string, string> {
  const registry = (options: {
    side: 'shared' | 'server' | 'web'
    file: string
    suffix: string
    typeImport?: string
    doc: string
    declaration: string
    tail?: string
  }) => {
    const { side, file, suffix } = options
    const included = side === 'shared' ? modules : modules.filter((module) => module[side])
    const names = included.map((module) => binding(module.manifest.id, suffix))
    const lines = [HEADER]
    if (options.typeImport) lines.push(options.typeImport)
    included.forEach((module, i) => lines.push(`import ${names[i]} from '#${module.folder}/${side}/${file}'`))
    const list = names.length ? `[\n${names.map((name) => `  ${name},\n`).join('')}]` : '[]'
    lines.push('', `/** ${options.doc} */`, `${options.declaration} = ${list}${options.tail ?? ''}`)
    return `${lines.join('\n')}\n`
  }
  return {
    'shared/modules.gen.ts': registry({
      side: 'shared',
      file: 'manifest.ts',
      suffix: 'Manifest',
      doc: "Every module's shared manifest, in dependency order. Read it through `shared/registry.ts`.",
      declaration: 'export const SHARED_MANIFESTS',
      tail: ' as const',
    }),
    'server/modules.gen.ts': registry({
      side: 'server',
      file: 'module.ts',
      suffix: 'Server',
      typeImport: "import type { ServerModule } from './modules.ts'",
      doc: "Every module's server side, in dependency order. Read it through `server/registry.ts`.",
      declaration: 'export const SERVER_MODULES: readonly ServerModule[]',
    }),
    'web/src/modules.gen.ts': registry({
      side: 'web',
      file: 'module.ts',
      suffix: 'Web',
      typeImport: "import type { WebModule } from './modules.ts'",
      doc: "Every module's website side, in dependency order. Read it through `web/src/registry.ts`.",
      declaration: 'export const WEB_MODULES: readonly WebModule[]',
    }),
  }
}

/** Writes the registries that changed (none with `check`), and says which those are. */
export async function generate(dir = root, check = false): Promise<{ errors: string[]; changed: string[] }> {
  const { found, errors } = await findModules(dir)
  const { FEATURES } = (await import(pathToFileURL(path.join(dir, 'app.modules.ts')).href)) as {
    FEATURES: readonly string[]
  }
  const plan = planModules(found, FEATURES, confidentialModules(dir))
  errors.push(...plan.errors)
  if (errors.length) return { errors, changed: [] }
  const changed: string[] = []
  for (const [file, text] of Object.entries(render(plan.modules))) {
    const target = path.join(dir, file)
    if (existsSync(target) && readFileSync(target, 'utf8') === text) continue
    changed.push(file)
    if (!check) writeFileSync(target, text)
  }
  return { errors, changed }
}

if (process.argv[1] === import.meta.filename) {
  const check = process.argv.includes('--check')
  const { errors, changed } = await generate(root, check)
  if (errors.length) {
    for (const error of errors) console.error(`modules:gen: ${error}`)
    process.exitCode = 1
  } else if (check && changed.length) {
    console.error(`modules:gen: out of date: ${changed.join(', ')}. Run \`bun run modules:gen\`.`)
    process.exitCode = 1
  } else console.log(changed.length ? `modules:gen: wrote ${changed.join(', ')}` : 'modules:gen: up to date')
}
