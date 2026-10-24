import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SharedManifest } from '../shared/modules.ts'
import { findModules, generate, planModules, render, type Found } from './gen-modules.ts'

const root = path.resolve(import.meta.dirname, '..')

/** A module in `folder` whose manifest matches it, changed by `manifest`. */
const found = (folder: string, manifest: Partial<SharedManifest> = {}, sides = { server: true, web: true }): Found => {
  const [top = '', id = ''] = folder.split('/')
  const tier = top === 'foundation' ? 'foundation' : 'feature'
  return { folder, ...sides, manifest: { id, tier, label: id, dependsOn: [], confidential: false, ...manifest } }
}
const resource = { key: 'x', label: 'X', levels: ['none'], help: { none: 'Hidden.' }, workspace: false } as const
const none: ReadonlySet<string> = new Set()
const order = (plan: ReturnType<typeof planModules>) => plan.modules.map((module) => module.folder)

describe('planModules', () => {
  it('puts each dependency first, then foundation by name, then features in app.modules.ts order', () => {
    const plan = planModules(
      [
        found('foundation/audit', { dependsOn: ['employees'] }),
        found('foundation/employees'),
        found('modules/assets', { dependsOn: ['tasks', 'audit'] }),
        found('modules/tasks'),
        found('modules/zeta'),
      ],
      ['zeta', 'assets', 'tasks'],
      none,
    )
    expect(plan.errors).toEqual([])
    expect(order(plan)).toEqual([
      'foundation/employees',
      'foundation/audit',
      'modules/zeta',
      'modules/tasks',
      'modules/assets',
    ])
  })

  it.each<[string, Found[], string[], string[], RegExp]>([
    [
      'an unknown dependency',
      [found('modules/a', { dependsOn: ['ghost'] })],
      ['a'],
      [],
      /"ghost", which doesn't exist/,
    ],
    [
      'a feature module app.modules.ts leaves out',
      [found('modules/a'), found('modules/b')],
      ['a'],
      [],
      /modules\/b isn't listed in app.modules.ts/,
    ],
    [
      'a dependency app.modules.ts leaves out',
      [found('modules/a', { dependsOn: ['b'] }), found('modules/b')],
      ['a'],
      [],
      /modules\/b isn't listed in app.modules.ts/,
    ],
    [
      'a foundation → feature dependency',
      [found('foundation/f', { dependsOn: ['a'] }), found('modules/a')],
      ['a'],
      [],
      /foundation module, so it can't depend on the feature module "a"/,
    ],
    [
      'a cycle',
      [found('modules/a', { dependsOn: ['b'] }), found('modules/b', { dependsOn: ['a'] })],
      ['a', 'b'],
      [],
      /dependency cycle: a → b → a/,
    ],
    ['an unknown listed module', [], ['ghost'], [], /lists "ghost", but there is no modules\/ghost/],
    ['a listed foundation module', [found('foundation/f')], ['f'], [], /a foundation module, which is always on/],
    ['a module listed twice', [found('modules/a')], ['a', 'a'], [], /lists "a" twice/],
    ['a folder that is not its id', [found('modules/a', { id: 'b' })], ['b'], [], /belongs in modules\/b/],
    ['a tier in the wrong folder', [found('modules/a', { tier: 'foundation' })], [], [], /belongs in foundation\/a/],
    ['an id used twice', [found('foundation/a'), found('modules/a')], [], [], /module id "a" is used by both/],
    [
      'a resource declared twice',
      [found('modules/a', { resources: [resource] }), found('modules/b', { resources: [resource] })],
      ['a', 'b'],
      [],
      /permission resource "x" is declared by both modules\/a and modules\/b/,
    ],
    [
      'a resource level with no help',
      [found('modules/a', { resources: [{ ...resource, levels: ['none', 'read'] }] })],
      ['a'],
      [],
      /permission resource "x" doesn't explain its level "read"/,
    ],
    [
      'help for a level the resource doesn’t offer',
      [found('modules/a', { resources: [{ ...resource, help: { none: 'Hidden.', assign: 'Assign.' } }] })],
      ['a'],
      [],
      /permission resource "x" explains "assign", a level it doesn't offer/,
    ],
    [
      'a notification kind declared twice',
      [found('modules/a', { notificationKinds: { k: 'K' } }), found('modules/b', { notificationKinds: { k: 'K' } })],
      ['a', 'b'],
      [],
      /notification kind "k" is declared by both/,
    ],
    [
      'an employee notification kind it doesn’t declare',
      [found('modules/a', { notificationKinds: { k: 'K' }, employeeNotificationKinds: ['k', 'other'] })],
      ['a'],
      [],
      /employee notification kind "other" is not one of its notification kinds/,
    ],
    [
      'an audit entity type declared twice',
      [found('modules/a', { auditEntityTypes: ['t'] }), found('foundation/b', { auditEntityTypes: ['t'] })],
      ['a'],
      [],
      /audit entity type "t" is declared by both/,
    ],
    [
      'a confidential module with notification kinds',
      [found('modules/g', { confidential: true, notificationKinds: { k: 'K' } })],
      ['g'],
      ['modules/g'],
      /a confidential module never notifies/,
    ],
    [
      'a confidential module with audit entity types',
      [found('modules/g', { confidential: true, auditEntityTypes: ['g'] })],
      ['g'],
      ['modules/g'],
      /a confidential module keeps its own audit log/,
    ],
    [
      'confidential: true that lint rule (e) can’t read',
      [found('modules/g', { confidential: true })],
      ['g'],
      [],
      /as a literal/,
    ],
    ['confidential: false where the file reads as true', [found('modules/g')], ['g'], ['modules/g'], /as a literal/],
  ])('refuses %s', (_what, modules, features, confidential, error) => {
    const plan = planModules(modules, features, new Set(confidential))
    expect(plan.errors.join('\n')).toMatch(error)
    expect(plan.modules).toEqual([])
  })
})

describe('render', () => {
  it('imports each side through the subpath imports, and leaves out a module without that side', () => {
    const files = render([
      found('foundation/employees', {}, { server: true, web: false }),
      found('modules/digital-assets'),
    ])
    expect(Object.keys(files)).toEqual(['shared/modules.gen.ts', 'server/modules.gen.ts', 'web/src/modules.gen.ts'])
    expect(files['shared/modules.gen.ts']).toContain(
      "import employeesManifest from '#foundation/employees/shared/manifest.ts'",
    )
    expect(files['shared/modules.gen.ts']).toContain('[\n  employeesManifest,\n  digitalAssetsManifest,\n] as const')
    expect(files['server/modules.gen.ts']).toContain(
      "import digitalAssetsServer from '#modules/digital-assets/server/module.ts'",
    )
    expect(files['web/src/modules.gen.ts']).not.toContain('employees')
    expect(files['web/src/modules.gen.ts']).toContain('WEB_MODULES: readonly WebModule[] = [\n  digitalAssetsWeb,\n]')
    expect(render([])['server/modules.gen.ts']).toContain('SERVER_MODULES: readonly ServerModule[] = []\n')
  })
})

describe('findModules', () => {
  it('reads each folder’s shared manifest and notes which sides it has', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bphs-gen-modules-'))
    try {
      const write = (file: string, text: string) => {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        writeFileSync(path.join(dir, file), text)
      }
      const manifest = (id: string, tier: string) =>
        `export default { id: '${id}', tier: '${tier}', label: '${id}', dependsOn: [], confidential: false }\n`
      write('foundation/audit/shared/manifest.ts', manifest('audit', 'foundation'))
      write('foundation/audit/server/module.ts', 'export default {}\n')
      write('modules/tasks/shared/manifest.ts', manifest('tasks', 'feature'))
      write('modules/tasks/web/module.ts', 'export default {}\n')
      write('modules/stray/README.md', '# no manifest\n')
      write('modules/README.md', '# a file, not a module\n')
      const { found: modules, errors } = await findModules(dir)
      expect(modules.map(({ folder, server, web }) => ({ folder, server, web }))).toEqual([
        { folder: 'foundation/audit', server: true, web: false },
        { folder: 'modules/tasks', server: false, web: true },
      ])
      expect(errors).toEqual(['modules/stray has no shared/manifest.ts'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the committed registries', () => {
  it('are what `bun run modules:gen` writes', async () => {
    expect(await generate(root, true)).toEqual({ errors: [], changed: [] })
  })
})
