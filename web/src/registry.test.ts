import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { manifests } from '@shared/registry.ts'
import type { SharedManifest } from '@shared/modules.ts'
import type { Grantee } from '@shared/permissions.ts'
import { expectToday } from '@shared/testing.ts'
import type { NavPage } from './modules.ts'
import {
  exportDatasets,
  importers,
  installModules,
  listEditors,
  preloadModules,
  registryProblems,
  slot,
  webModules,
  workspaces,
} from './registry.ts'

const icon = (() => null) as unknown as NavPage['icon']

describe('the website registry', () => {
  it('has no clashing workspaces or slot entries, and each module uses its own manifest', () => {
    expect(registryProblems()).toEqual([])
  })

  it('keeps the shared registry’s order', () => {
    const ids = webModules().map((module) => module.manifest.id)
    expect(ids).toEqual(
      manifests()
        .map((manifest) => manifest.id)
        .filter((id) => ids.includes(id)),
    )
  })

  it('puts today’s workspaces on the rail, in order, with Reviews and Grievances confidential', () => {
    expectToday(
      workspaces().map((workspace) => `${workspace.id}${workspace.confidential ? ' (confidential)' : ''}`),
      ['assets', 'maintenance', 'tasks', 'reviews (confidential)', 'grievances (confidential)'],
    )
    expect(slot('employee.detail')).toEqual([])
  })

  // The Import & Export and Lookup lists pages draw these in this order, as they did before the frameworks moved to the kernel.
  it('has today’s exports, importers and lookup lists, in today’s order', () => {
    expect(exportDatasets().map((dataset) => dataset.filename)).toEqual([
      'physical-assets',
      'digital-assets',
      'employees',
      'programs',
      'active-assignments',
    ])
    expect(importers().map((importer) => importer.type)).toEqual(['employees', 'programs'])
    // The Lookup lists page draws each column in registry order, so where the side column's list is registered changes nothing.
    const column = (name: 'main' | 'side') =>
      listEditors()
        .filter((editor) => (editor.column ?? 'main') === name)
        .map((editor) => editor.key)
    expect(column('main')).toEqual(['asset-types', 'asset-brands', 'digital-asset-types'])
    expect(column('side')).toEqual(['condition-ratings'])
  })

  it('draws a slot’s entries in module order, leaving out those the account may not see', () => {
    const [manifest] = manifests()
    if (!manifest) throw new Error('no modules')
    const entry = (id: string, visible?: (user: Grantee) => boolean) => ({ id, component: () => null, visible })
    const installed = webModules()
    const reader: Grantee = { access: { assets: 'read' }, superAdmin: false }
    try {
      installModules([
        { manifest, slots: { 'home.widgets': [entry('first'), entry('admins', (user) => user.superAdmin)] } },
        { manifest, slots: { 'home.widgets': [entry('second')], 'employee.detail': [entry('other')] } },
      ])
      const ids = (user?: Grantee) => slot('home.widgets', user).map((widget) => widget.id)
      expect(ids()).toEqual(['first', 'admins', 'second'])
      expect(ids(reader)).toEqual(['first', 'second'])
      expect(ids({ ...reader, superAdmin: true })).toEqual(['first', 'admins', 'second'])
    } finally {
      installModules(installed)
    }
  })

  it('preloads what each module asks for, for that account, and waits for all of it', async () => {
    const [manifest] = manifests()
    if (!manifest) throw new Error('no modules')
    const installed = webModules()
    const queryClient = new QueryClient()
    const asked: string[] = []
    const reader: Grantee = { access: { assets: 'read' }, superAdmin: false }
    try {
      installModules([
        { manifest },
        { manifest, preload: (_client, user) => (user.superAdmin ? undefined : Promise.resolve(asked.push('reader'))) },
        { manifest, preload: (client) => client.fetchQuery({ queryKey: ['x'], queryFn: () => asked.push('x') }) },
      ])
      await preloadModules(queryClient, reader)
      expect(asked).toEqual(['reader', 'x'])
      expect(queryClient.getQueryData(['x'])).toBe(2)
      await preloadModules(queryClient, { ...reader, superAdmin: true })
      expect(asked).toEqual(['reader', 'x', 'x'])
    } finally {
      installModules(installed)
    }
  })

  it('finds clashes the generator can’t see', () => {
    const manifest = manifests().find((candidate) => candidate.id === 'assets')
    if (!manifest) throw new Error('no assets module')
    const workspace = (id: string) => ({ id, label: id, icon, home: '/' as const })
    const entry = { id: 'card', component: () => null }
    const foreign: SharedManifest = { ...manifest }
    const problems = registryProblems([
      { manifest, workspaces: [workspace('assets')], slots: { 'employee.detail': [entry] } },
      { manifest, workspaces: [workspace('assets'), workspace('employees')], slots: { 'employee.detail': [entry] } },
      { manifest: foreign },
    ])
    expect(problems).toEqual([
      'workspace "assets" is declared by both assets and assets',
      'assets: workspace "employees" is not one of its permission resources marked as a workspace',
      'employee.detail slot entry "card" is declared by both assets and assets',
      "assets: web/module.ts must use the module's own shared manifest",
      'assets: permission resource "assets" is a workspace, but web/module.ts puts it on no rail',
    ])
  })

  it('refuses an export, importer or lookup list declared twice', () => {
    const assets = webModules().find((module) => module.manifest.id === 'assets')
    const digital = webModules().find((module) => module.manifest.id === 'digital-assets')
    const [dataset] = exportDatasets()
    const [importer] = importers()
    const [editor] = listEditors()
    if (!assets || !digital || !dataset || !importer || !editor) throw new Error('no digital-assets entries')
    const twice = {
      ...digital,
      exports: [...(digital.exports ?? []), dataset],
      // The importers are the foundation modules': digital-assets declares none of its own.
      importers: [...(digital.importers ?? []), importer, importer],
      lists: [...(digital.lists ?? []), editor],
    }
    // digital-assets' nav page is in the assets workspace.
    expect(registryProblems([assets, twice])).toEqual([
      'export "physical-assets" is declared by both assets and digital-assets',
      'importer "employees" is declared by both digital-assets and digital-assets',
      'lookup list "asset-types" is declared by both assets and digital-assets',
    ])
  })

  it('checks each nav page’s workspace, group and badge', () => {
    const assets = webModules().find((module) => module.manifest.id === 'assets')
    const digital = webModules().find((module) => module.manifest.id === 'digital-assets')
    const tasks = webModules().find((module) => module.manifest.id === 'tasks')
    const grievances = webModules().find((module) => module.manifest.id === 'grievances')
    if (!assets || !digital || !tasks || !grievances)
      throw new Error('no assets, digital-assets, tasks or grievances module')
    const stray: NavPage[] = [
      { workspace: 'nowhere', label: 'Stray', icon },
      { workspace: 'assets', group: 'nope', label: 'Lost', icon },
      { workspace: 'grievances', to: '/grievances/new', label: 'Counted', icon, badge: 'unread' },
      { workspace: 'tasks', to: '/tasks', label: 'Again', icon },
    ]
    expect(
      registryProblems([assets, grievances, { ...digital, nav: [...(digital.nav ?? []), ...stray] }, tasks]),
    ).toEqual([
      'digital-assets: nav page "Stray" is in workspace "nowhere", which no module declares',
      'digital-assets: nav page "Lost" is in group "nope", which "assets" doesn\'t have',
      'digital-assets: nav page "Counted" has a badge, but "grievances" is confidential',
      'nav page "/tasks" is declared by both digital-assets and tasks',
    ])
  })
})
