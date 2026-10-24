// The module registry, website side (issue #23): the workspaces, nav pages, slots and framework entries of every module.
// It never imports the modules: the entry point installs them (`main.tsx`, the test setup). Kernel code a module imports
// reaches this file, so importing the modules here would load them halfway through (an ESM cycle).
import type { QueryClient } from '@tanstack/react-query'
import type { Importer } from '@shared/importers.ts'
import type { Grantee } from '@shared/permissions.ts'
import { manifests } from '@shared/registry.ts'
import {
  HOME_GROUPS,
  type ExportEntry,
  type ListEditor,
  type NavPage,
  type SlotEntry,
  type SlotName,
  type SlotProps,
  type WebModule,
  type WorkspaceEntry,
} from './modules.ts'

let installed: readonly WebModule[] | undefined

/** Called once by the entry point with `WEB_MODULES` (`modules.gen.ts`), before anything reads the registry. */
export function installModules(modules: readonly WebModule[]) {
  installed = modules
}

/** Every module that has a website side, foundation and dependencies first. */
export function webModules(): readonly WebModule[] {
  if (!installed) throw new Error('No web modules installed: the entry point calls installModules(WEB_MODULES) first.')
  return installed
}

/** What every module draws in one slot, in module order. Given an account, only the entries it may see. */
export function slot<K extends SlotName>(name: K, user?: Grantee): readonly SlotEntry<SlotProps[K]>[] {
  const entries = webModules().flatMap((module): readonly SlotEntry<SlotProps[K]>[] => module.slots?.[name] ?? [])
  return user ? entries.filter((entry) => entry.visible?.(user) ?? true) : entries
}

/** What every module fetches before the app opens, for this account (the `_app` loader). */
export function preloadModules(queryClient: QueryClient, user: Grantee): Promise<unknown[]> {
  return Promise.all(webModules().flatMap((module) => module.preload?.(queryClient, user) ?? []))
}

/** A workspace as the rail draws it: confidential when its module is. */
export type RailWorkspace = WorkspaceEntry & { confidential: boolean }

const declaredWorkspaces = (modules: readonly WebModule[]): RailWorkspace[] =>
  modules
    .flatMap((module) =>
      (module.workspaces ?? []).map((workspace) => ({
        ...workspace,
        confidential: module.manifest.confidential || workspace.confidential === true,
      })),
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

/** The rail, after Home: by `order`, then in module order. */
export function workspaces(): readonly RailWorkspace[] {
  return declaredWorkspaces(webModules())
}

/** Every module's panel pages, in module order. */
export function navPages(): readonly NavPage[] {
  return webModules().flatMap((module) => module.nav ?? [])
}

/** The Export tab's lists: by `order`, then in module order. */
export function exportDatasets(): readonly ExportEntry[] {
  return webModules()
    .flatMap((module) => module.exports ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** The Import page's record types, in module order. */
export function importers(): readonly Importer[] {
  return webModules().flatMap((module) => module.importers ?? [])
}

/** The Lookup lists page's editors, in module order. */
export function listEditors(): readonly ListEditor[] {
  return webModules().flatMap((module) => module.lists ?? [])
}

/** What `bun run modules:gen` can't see from the shared manifests alone. The registry test keeps this empty. */
export function registryProblems(modules: readonly WebModule[] = webModules()): string[] {
  const problems: string[] = []
  const shared = manifests()
  const seen = new Map<string, string>()
  const once = (what: string, key: string, owner: string) => {
    const first = seen.get(`${what} ${key}`)
    if (first) problems.push(`${what} "${key}" is declared by both ${first} and ${owner}`)
    else seen.set(`${what} ${key}`, owner)
  }
  for (const module of modules) {
    const { id, resources = [] } = module.manifest
    if (!shared.includes(module.manifest))
      problems.push(`${id}: web/module.ts must use the module's own shared manifest`)
    for (const workspace of module.workspaces ?? []) {
      once('workspace', workspace.id, id)
      if (!resources.some((resource) => resource.key === workspace.id && resource.workspace))
        problems.push(`${id}: workspace "${workspace.id}" is not one of its permission resources marked as a workspace`)
    }
    for (const resource of resources)
      if (resource.workspace && !module.workspaces?.some((workspace) => workspace.id === resource.key))
        problems.push(
          `${id}: permission resource "${resource.key}" is a workspace, but web/module.ts puts it on no rail`,
        )
    for (const name of Object.keys(module.slots ?? {}) as SlotName[])
      for (const entry of module.slots?.[name] ?? []) once(`${name} slot entry`, entry.id, id)
    for (const dataset of module.exports ?? []) once('export', dataset.filename, id)
    for (const importer of module.importers ?? []) once('importer', importer.type, id)
    for (const editor of module.lists ?? []) once('lookup list', editor.key, id)
  }
  const all = declaredWorkspaces(modules)
  for (const module of modules) {
    const { id } = module.manifest
    for (const page of module.nav ?? []) {
      if (page.to) once('nav page', page.to, id)
      const workspace = all.find((entry) => entry.id === page.workspace)
      const groups = page.workspace === 'me' ? HOME_GROUPS : workspace && (workspace.groups ?? [])
      if (!groups)
        problems.push(`${id}: nav page "${page.label}" is in workspace "${page.workspace}", which no module declares`)
      else if (page.group && !groups.some((group) => group.id === page.group))
        problems.push(
          `${id}: nav page "${page.label}" is in group "${page.group}", which "${page.workspace}" doesn't have`,
        )
      if (page.badge && workspace?.confidential)
        problems.push(`${id}: nav page "${page.label}" has a badge, but "${page.workspace}" is confidential`)
    }
  }
  return problems
}
