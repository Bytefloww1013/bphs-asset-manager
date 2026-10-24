import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { REQUIRED_SECTIONS } from './docs-check.ts'
import { addFeature, idProblems, names, render, scaffold } from './new-module.ts'

const FEATURE_FILES = [
  'README.md',
  'server/index.ts',
  'server/module.ts',
  'server/proof-widgets.test.ts',
  'server/routes.ts',
  'server/schema.ts',
  'server/service.ts',
  'shared/index.ts',
  'shared/manifest.ts',
  'shared/schemas.ts',
  'shared/types.ts',
  'web/api.ts',
  'web/index.ts',
  'web/module.ts',
  'web/proof-widgets-page.tsx',
  'web/queries.ts',
  'web/routes/route.tsx',
]
const APP = "// The feature modules.\nexport const FEATURES = ['assets', 'tasks'] as const\n"

const made: string[] = []
const scratch = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'new-module-'))
  made.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('new-module', () => {
  it('names a module’s parts from its id', () => {
    expect(names('proof-widgets', 'feature')).toMatchObject({
      id: 'proof-widgets',
      Label: 'Proof widgets',
      label: 'proof widgets',
      camel: 'proofWidgets',
      Pascal: 'ProofWidgets',
      table: 'proof_widgets',
      tier: 'feature',
    })
    expect(names('kiosk', 'foundation')).toMatchObject({ Label: 'Kiosk', camel: 'kiosk', table: 'kiosk' })
  })

  it('refuses an id that isn’t kebab-case, is taken, or is a kernel path', () => {
    // Not proof-widgets: docs/verify/new-module-proof.sh runs these tests with that module in place.
    expect(idProblems('kiosk-loans')).toEqual([])
    for (const id of ['Proof', '1st', 'proof_widgets', 'proof--widgets', 'proof-', ''])
      expect(idProblems(id)[0]).toMatch(/must be kebab-case/)
    expect(idProblems('assets')).toEqual(['modules/assets already exists'])
    expect(idProblems('employees')).toEqual(['foundation/employees already exists'])
    expect(idProblems('users')).toEqual(['"users" is one of the kernel\'s own paths'])
    expect(idProblems('login')).toEqual(['"login" is one of the kernel\'s own paths'])
    expect(idProblems('lookups')).toEqual(['"lookups" is one of the kernel\'s own paths'])
  })

  it('refuses an id whose table another module already has', () => {
    const dir = scratch()
    mkdirSync(path.join(dir, 'modules', 'other', 'server'), { recursive: true })
    writeFileSync(path.join(dir, 'modules', 'other', 'server', 'schema.ts'), "sqliteTable('proof_widgets', {})")
    expect(idProblems('proof-widgets', dir)).toEqual([
      `the table proof_widgets is already in ${path.join('modules', 'other', 'server', 'schema.ts')}`,
    ])
  })

  it('fills in every placeholder, in each tier’s files', () => {
    const feature = render(names('proof-widgets', 'feature'))
    const foundation = render(names('proof-widgets', 'foundation'))
    expect(feature.map((entry) => entry.file)).toEqual(FEATURE_FILES)
    expect(foundation.map((entry) => entry.file)).toEqual(FEATURE_FILES)
    for (const { file, text } of [...feature, ...foundation]) expect(text, file).not.toMatch(/\{\{\w+\}\}/)

    const text = (files: typeof feature, file: string) => files.find((entry) => entry.file === file)?.text ?? ''
    expect(text(feature, 'shared/manifest.ts')).toMatch(/tier: 'feature'[\s\S]*workspace: true/)
    expect(text(foundation, 'shared/manifest.ts')).toMatch(/tier: 'foundation'[\s\S]*workspace: false/)
    expect(text(feature, 'web/module.ts')).toContain("workspaces: [{ id: 'proof-widgets'")
    expect(text(foundation, 'web/module.ts')).not.toContain('workspaces')
    expect(text(feature, 'server/schema.ts')).toContain("export const proofWidgets = sqliteTable('proof_widgets', {")
    expect(text(feature, 'server/routes.ts')).toContain("requires('proof-widgets', 'edit')")
    expect(text(foundation, 'README.md')).toMatch(/^# `proof-widgets` \(foundation\)$/m)
    // The README `bun run docs:check` asks of every module, its sections in that order.
    const headings = [...text(feature, 'README.md').matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual(REQUIRED_SECTIONS)
  })

  it('adds a feature to the end of FEATURES, on one line or several', () => {
    expect(addFeature(APP, 'proof-widgets')).toBe(
      "// The feature modules.\nexport const FEATURES = ['assets', 'tasks', 'proof-widgets'] as const\n",
    )
    expect(addFeature("export const FEATURES = [\n  'assets',\n  'tasks',\n] as const\n", 'x')).toBe(
      "export const FEATURES = ['assets', 'tasks', 'x'] as const\n",
    )
    expect(addFeature('export const FEATURES = [] as const', 'x')).toBe("export const FEATURES = ['x'] as const")
    expect(() => addFeature('export const OTHER = []', 'x')).toThrow(/no `export const FEATURES/)
  })

  it('writes the module, lists a feature module in app.modules.ts, and never overwrites a file', () => {
    const dir = scratch()
    writeFileSync(path.join(dir, 'app.modules.ts'), APP)
    const written = scaffold('proof-widgets', 'feature', dir)
    expect(written).toEqual([
      ...FEATURE_FILES.map((file) => path.join('modules', 'proof-widgets', file)),
      'app.modules.ts',
    ])
    expect(readFileSync(path.join(dir, 'app.modules.ts'), 'utf8')).toContain("'tasks', 'proof-widgets'] as const")
    expect(() => scaffold('proof-widgets', 'feature', dir)).toThrow(/EEXIST/)

    expect(scaffold('kiosk', 'foundation', dir)).toHaveLength(FEATURE_FILES.length)
    expect(readFileSync(path.join(dir, 'foundation', 'kiosk', 'shared', 'manifest.ts'), 'utf8')).toContain(
      "id: 'kiosk'",
    )
    expect(readFileSync(path.join(dir, 'app.modules.ts'), 'utf8')).not.toContain('kiosk')
  })
})
