import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { employeeImporter } from '#foundation/employees/shared/index.ts'
import { programImporter } from '#foundation/programs/shared/index.ts'
import { manifests } from '../shared/registry.ts'
import { expectToday } from '../shared/testing.ts'
import { createDb } from './db/client.ts'
import type { Env } from './http.ts'
import { describeError } from './lib/errors.ts'
import { defineLookupList, type ServerModule } from './modules.ts'
import { hooks, jobs, registryProblems, routes, serverModules, webhooks } from './registry.ts'
import type { AuthUser } from './services/auth.ts'

/** A lookup list at `/api/asset-types`, for the clash checks. */
const assetTypeList = defineLookupList({
  path: 'asset-types',
  resource: 'assets',
  list: () => [],
  createSchema: z.object({}),
  create: () => ({}),
  updateSchema: z.object({}),
  update: () => ({}),
  remove: () => {},
})

describe('the server registry', () => {
  it('has no clashing route bases, webhook bases, job names, lookup lists or importers, and each module uses its own manifest', () => {
    expect(registryProblems()).toEqual([])
  })

  it('keeps the shared registry’s order', () => {
    const ids = serverModules().map((module) => module.manifest.id)
    expect(ids).toEqual(
      manifests()
        .map((manifest) => manifest.id)
        .filter((id) => ids.includes(id)),
    )
  })

  // What server/app.ts mounts and server/index.ts runs: the foundation modules' first, then each feature
  // module's. Paths never overlap, so the mounting order changes nothing a request sees.
  it('has today’s routers, the webhook, the timed jobs, the lookup lists and the importers', () => {
    expectToday(
      routes().map((route) => route.base),
      [
        '/employees',
        '/programs',
        '',
        '/me',
        '/notices',
        '',
        '/assets',
        '/assignments',
        '/digital-assets',
        '/grievances',
        '/maintenance',
        '/reviews',
        '/tasks',
        '/me/tasks',
      ],
    )
    expect(webhooks().map((webhook) => webhook.base)).toEqual(['/maintenance'])
    expect(jobs().map(({ name, every, atStart }) => ({ name, every, atStart }))).toEqual([
      { name: 'notifications.purge', every: 21_600_000, atStart: true },
      { name: 'notifications.overdue-reminders', every: 21_600_000, atStart: true },
      { name: 'tasks.clock', every: 60_000, atStart: undefined },
    ])
    expect(hooks('employee.references').map((references) => references.name)).toEqual([
      'custodyEmployeeReferences',
      'conditionEmployeeReferences',
      'grievanceEmployeeReferences',
      // Before Reviews, as before the split: the first answer names the blocker an employee refusal shows.
      'maintenanceEmployeeReferences',
      'reviewEmployeeReferences',
    ])
    expect(hooks('program.references').map((references) => references.name)).toEqual(['custodyProgramReferences'])
    expect(hooks('custody.kinds').map((kind) => kind.kind)).toEqual(['asset', 'digital-asset'])
    // The kernel mounts the Import page's and the lookup lists' routers itself, after the Users page's. Each list has a path of
    // its own, so their order changes nothing.
    expect(hooks('lists').map((list) => `${list.path} ${list.resource}`)).toEqual([
      'asset-types assets',
      'asset-brands assets',
      'condition-ratings assets',
      'digital-asset-types assets',
    ])
    expect(hooks('importers').map((store) => store.importer)).toEqual([employeeImporter, programImporter])
  })

  it('keeps notices to Super Admins', async () => {
    const { db, sqlite } = createDb(':memory:')
    const notices = routes().find((route) => route.base === '/notices')
    const app = new Hono<Env>()
    app.use(async (c, next) => {
      c.set('user', { id: 1, superAdmin: false, access: { assets: 'full' } } as AuthUser)
      await next()
    })
    if (notices) app.route('/notices', notices.create(db, {}))
    app.onError((error, c) => c.body(null, describeError(error).status as 403))
    for (const [method, path] of [
      ['GET', '/notices'],
      ['POST', '/notices'],
    ] as const)
      expect(`${method} ${path} ${(await app.request(path, { method })).status}`).toBe(`${method} ${path} 403`)
    sqlite.close()
  })

  it('finds clashes the generator can’t see', () => {
    const manifest = manifests().find((candidate) => candidate.id === 'tasks')
    if (!manifest) throw new Error('no tasks module')
    const [employeeImport, programImport] = hooks('importers')
    if (!employeeImport || !programImport) throw new Error('no importers')
    const module = (extra: Omit<ServerModule, 'manifest'>): ServerModule => ({ manifest, ...extra })
    const create = () => new Hono<Env>()
    const hook = () => new Hono()
    const problems = registryProblems([
      module({
        routes: [
          { base: '', create },
          { base: '/a', create },
        ],
        jobs: [{ name: 'tick', every: 1, run: () => {} }],
      }),
      module({
        routes: [
          { base: '', create },
          { base: '/a', create },
        ],
        webhooks: [{ base: '/zoho', create: hook }],
        hooks: { lists: [{ ...assetTypeList, path: 'a' }, assetTypeList], importers: [employeeImport] },
      }),
      {
        manifest: { ...manifest },
        webhooks: [{ base: '/zoho', create: hook }],
        jobs: [{ name: 'tick', every: 1, run: () => {} }],
        hooks: { lists: [assetTypeList], importers: [{ ...programImport, importer: employeeImporter }] },
      },
    ])
    expect(problems).toEqual([
      'route base "/a" is declared by both tasks and tasks',
      'route base "/a" is declared by both tasks and tasks',
      "tasks: server/module.ts must use the module's own shared manifest",
      'webhook base "/zoho" is declared by both tasks and tasks',
      'job "tick" is declared by both tasks and tasks',
      'route base "/asset-types" is declared by both tasks and tasks',
      'importer "employees" is declared by both tasks and tasks',
    ])
  })
})
