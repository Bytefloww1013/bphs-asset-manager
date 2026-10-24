import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { confidentialModules, problem, resolve, type Rules } from './oxlint-boundaries.ts'

const root = path.resolve(import.meta.dirname, '..')
const rules: Rules = { confidential: new Set(['modules/grievances']) }

describe('resolve', () => {
  const from = path.join(root, 'modules/a/server/routes.ts')

  it('follows relative paths, subpath imports and the Vite aliases to repo paths', () => {
    expect(resolve(from, '../../b/server/x.ts')).toBe('modules/b/server/x.ts')
    expect(resolve(from, './service.ts')).toBe('modules/a/server/service.ts')
    expect(resolve(from, '#modules/b/server/index.ts')).toBe('modules/b/server/index.ts')
    expect(resolve(from, '#foundation/employees/server/index.ts')).toBe('foundation/employees/server/index.ts')
    expect(resolve(from, '#kernel/db/client.ts')).toBe('server/db/client.ts')
    expect(resolve(from, '#shared/dates.ts')).toBe('shared/dates.ts')
    expect(resolve(path.join(root, 'web/src/x.tsx'), '@/lib/api.ts')).toBe('web/src/lib/api.ts')
    expect(resolve(path.join(root, 'web/src/x.tsx'), '@shared/constants.ts')).toBe('shared/constants.ts')
  })

  it('drops a query and leaves packages alone', () => {
    expect(resolve(from, '../web/logo.svg?url')).toBe('modules/a/web/logo.svg')
    expect(resolve(from, 'hono')).toBeUndefined()
    expect(resolve(from, 'node:path')).toBeUndefined()
  })
})

describe('problem', () => {
  it.each([
    ['(a)', 'web/src/a.tsx', 'server/app.ts'],
    ['(a)', 'modules/a/web/page.tsx', 'modules/a/server/service.ts'],
    ['(b)', 'foundation/employees/server/x.ts', 'modules/assets/server/index.ts'],
    ['(c)', 'modules/a/server/x.ts', 'modules/b/server/service.ts'],
    ['(c)', 'modules/a/web/x.tsx', 'foundation/employees/web/queries.ts'],
    ['(c)', 'scripts/x.ts', 'modules/a/server/service.ts'],
    ['(c)', 'server/modules.gen.ts', 'modules/a/server/routes.ts'],
    ['(d)', 'shared/x.ts', 'server/db/client.ts'],
    ['(d)', 'modules/a/shared/types.ts', 'modules/a/web/x.ts'],
    ['(e)', 'modules/grievances/server/x.ts', 'foundation/notifications/server/index.ts'],
    ['(f)', 'server/app.ts', 'modules/assets/server/index.ts'],
    ['(f)', 'web/src/router.tsx', 'modules/assets/web/index.ts'],
  ])('%s refuses %s → %s', (_rule, from, to) => expect(problem(from, to, rules)).toBeDefined())

  it.each([
    ['modules/a/server/x.ts', 'modules/b/server/index.ts'],
    ['modules/a/server/x.ts', 'modules/a/server/service.ts'],
    ['modules/a/web/x.tsx', 'modules/a/shared/types.ts'],
    ['modules/a/server/x.ts', 'server/db/client.ts'],
    ['modules/a/web/x.tsx', 'shared/constants.ts'],
    ['modules/a/server/x.ts', 'foundation/employees/server/index.ts'],
    ['modules/assets/server/x.ts', 'foundation/notifications/server/index.ts'],
    ['server/app.ts', 'foundation/employees/server/index.ts'],
    ['server/modules.gen.ts', 'modules/a/server/module.ts'],
    ['shared/modules.gen.ts', 'modules/a/shared/manifest.ts'],
    ['web/src/modules.gen.ts', 'foundation/employees/web/module.ts'],
  ])('allows %s → %s', (from, to) => expect(problem(from, to, rules)).toBeUndefined())
})

describe('confidentialModules', () => {
  it('finds the modules whose shared manifest says confidential: true', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bphs-boundaries-'))
    try {
      const manifest = (folder: string, text: string) => {
        mkdirSync(path.join(dir, folder, 'shared'), { recursive: true })
        writeFileSync(path.join(dir, folder, 'shared', 'manifest.ts'), text)
      }
      manifest('modules/grievances', "defineSharedManifest({ id: 'grievances', confidential: true })")
      manifest('modules/assets', "defineSharedManifest({ id: 'assets', confidential: false })")
      manifest('foundation/audit', "defineSharedManifest({ id: 'audit' })")
      expect([...confidentialModules(dir)]).toEqual(['modules/grievances'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
