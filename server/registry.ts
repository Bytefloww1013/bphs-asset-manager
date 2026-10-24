// The module registry, server side (issue #23): the routes, webhooks, jobs and hook answers of every module.
// It never imports the modules: the entry point installs them (`server/index.ts`, `server/seed.ts`, the test setup). Kernel code
// a module imports reaches this file, so importing the modules here would load them halfway through (an ESM cycle).
import { manifests } from '../shared/registry.ts'
import type { Db } from './db/client.ts'
import type { HookName, Job, ModuleRoute, ModuleWebhook, SeedKit, ServerHooks, ServerModule } from './modules.ts'

let installed: readonly ServerModule[] | undefined

/** Called once by the entry point with `SERVER_MODULES` (`server/modules.gen.ts`), before anything reads the registry. */
export function installModules(modules: readonly ServerModule[]) {
  installed = modules
}

/** Every module that has a server side, foundation and dependencies first. */
export function serverModules(): readonly ServerModule[] {
  if (!installed)
    throw new Error('No server modules installed: the entry point calls installModules(SERVER_MODULES) first.')
  return installed
}

/** Every module's answers to one hook, in module order. */
export function hooks<K extends HookName>(name: K): readonly ServerHooks[K][] {
  return serverModules().flatMap((module): readonly ServerHooks[K][] => module.hooks?.[name] ?? [])
}

/** The API routers, in mounting order (Hono answers with the first match). */
export function routes(): readonly ModuleRoute[] {
  return serverModules().flatMap((module) => module.routes ?? [])
}

export function webhooks(): readonly ModuleWebhook[] {
  return serverModules().flatMap((module) => module.webhooks ?? [])
}

export function jobs(): readonly Job[] {
  return serverModules().flatMap((module) => module.jobs ?? [])
}

/** Every module's startup, in dependency order: after the migrations, before anything is served. */
export async function startModules(db: Db) {
  for (const module of serverModules()) await module.startup?.(db)
}

/** Every module's demo data, in dependency order (`bun run db:seed`), and what each says it added. */
export async function seedModules(db: Db, kit: SeedKit): Promise<string[]> {
  const added: string[] = []
  for (const module of serverModules()) if (module.seed) added.push(await module.seed(db, kit))
  return added
}

/** What `bun run modules:gen` can't see from the shared manifests alone. The registry test keeps this empty. */
export function registryProblems(modules: readonly ServerModule[] = serverModules()): string[] {
  const problems: string[] = []
  const shared = manifests()
  const seen = new Map<string, string>()
  const once = (what: string, key: string, owner: string) => {
    const first = seen.get(`${what} ${key}`)
    if (first) problems.push(`${what} "${key}" is declared by both ${first} and ${owner}`)
    else seen.set(`${what} ${key}`, owner)
  }
  for (const module of modules) {
    const { id } = module.manifest
    if (!shared.includes(module.manifest))
      problems.push(`${id}: server/module.ts must use the module's own shared manifest`)
    // Several routers may share the root (`''`): each answers its own paths there.
    for (const route of module.routes ?? []) if (route.base) once('route base', route.base, id)
    for (const webhook of module.webhooks ?? []) once('webhook base', webhook.base, id)
    for (const job of module.jobs ?? []) once('job', job.name, id)
    // A lookup list answers at `/api/<path>`, so it takes that address from every router as well.
    for (const list of module.hooks?.lists ?? []) once('route base', `/${list.path}`, id)
    for (const store of module.hooks?.importers ?? []) once('importer', store.importer.type, id)
  }
  return problems
}
