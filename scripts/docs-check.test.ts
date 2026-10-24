import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { missingPaths, missingSections, quotedPaths, REQUIRED_SECTIONS } from './docs-check.ts'
import { BEGIN, END, interval, renderTable, withTable, type ModuleFacts } from './docs-gen.ts'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A throwaway repo with these files (empty). */
const repo = (files: readonly string[]) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'docs-check-'))
  made.push(dir)
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), '')
  }
  return dir
}

describe('quotedPaths', () => {
  it('takes code spans that are paths, with their line, and relative link targets', () => {
    const doc = [
      '# Title',
      'See `server/app.ts:42` and `#kernel/http.ts`, `@/lib/nav.ts` and `@shared/levels.ts`.',
      'Also [the guide](docs/modules.md#tiers) and ``modules/tasks/``.',
    ].join('\n')
    expect(quotedPaths(doc)).toEqual([
      { path: 'server/app.ts', line: 2, kind: 'code' },
      { path: 'server/http.ts', line: 2, kind: 'code' },
      { path: 'web/src/lib/nav.ts', line: 2, kind: 'code' },
      { path: 'shared/levels.ts', line: 2, kind: 'code' },
      { path: 'docs/modules.md', line: 3, kind: 'link' },
      { path: 'modules/tasks/', line: 3, kind: 'code' },
    ])
  })

  it('leaves out commands, placeholders, globs, URLs, anchors, history and fenced code', () => {
    const doc = [
      '`bun run docs:check`, `modules/<id>/`, `server/routes/*.ts`, `{server,shared}/x.ts`, `/api/tasks`, `RUNBOOK.md`',
      '`git show 6925196:SECURITYREVIEW.md`, `text/csv`, [site](https://example.com), [up](#tiers), [mail](mailto:a@b.c)',
      '```bash',
      'cp server/gone.ts docs/',
      '```',
    ].join('\n')
    expect(quotedPaths(doc)).toEqual([{ path: 'text/csv', line: 2, kind: 'code' }])
  })
})

describe('missingSections', () => {
  it('names each required section a README lacks, in any order, among others', () => {
    const all = REQUIRED_SECTIONS.map((section) => `## ${section}`)
    expect(missingSections([...all].reverse().join('\n') + '\n## Jobs\n')).toEqual([])
    expect(missingSections(all.filter((line) => line !== '## Hooks').join('\n'))).toEqual(['Hooks'])
    expect(missingSections('### Tables\n## Tables extra')).toEqual([...REQUIRED_SECTIONS])
    expect(missingSections(undefined)).toEqual([...REQUIRED_SECTIONS])
  })
})

describe('missingPaths', () => {
  const dir = () =>
    repo(['server/app.ts', 'modules/tasks/server/schema.ts', 'modules/tasks/README.md', 'docs/modules.md', 'README.md'])

  it('finds a path from the repo root, the doc, or any module folder', () => {
    const root = dir()
    const doc = '`server/app.ts`, `server/schema.ts`, `modules/tasks/`, [guide](docs/modules.md), `text/csv`'
    expect(missingPaths('README.md', doc, root)).toEqual([])
    expect(missingPaths('modules/tasks/README.md', '`server/schema.ts` and [up](../../README.md)', root)).toEqual([])
  })

  it('reports each one that is gone, with its line', () => {
    const root = dir()
    const doc = 'fine\n`server/old.ts` and [gone](docs/gone.md)\n`modules/ghost/`'
    expect(missingPaths('README.md', doc, root)).toEqual([
      'README.md:2: link to docs/gone.md',
      'README.md:2: `server/old.ts`',
      'README.md:3: `modules/ghost/`',
    ])
  })
})

describe('the module table', () => {
  const facts: ModuleFacts[] = [
    {
      folder: 'foundation/employees',
      manifest: {
        id: 'employees',
        tier: 'foundation',
        label: 'Employees',
        dependsOn: [],
        confidential: false,
        resources: [{ key: 'employees', label: 'Employees', levels: ['none', 'read'], help: {}, workspace: false }],
      },
      workspaces: [],
      jobs: [],
    },
    {
      folder: 'modules/tasks',
      manifest: { id: 'tasks', tier: 'feature', label: 'Tasks', dependsOn: ['employees', 'audit'], confidential: true },
      workspaces: [{ id: 'tasks', label: 'Tasks' }],
      jobs: [
        { name: 'tasks.clock', every: 60_000 },
        { name: 'tasks.purge', every: 21_600_000, atStart: true },
      ],
    },
  ]

  it('has a row per module, linking its README from docs/', () => {
    expect(renderTable(facts).split('\n')).toEqual([
      '| Module | Tier | Confidential | Depends on | Permission resources | Workspaces | Jobs |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| [`employees`](../foundation/employees/README.md) | foundation | - | - | `employees`: none, read | - | - |',
      '| [`tasks`](../modules/tasks/README.md) | feature | yes | `employees`, `audit` | - | `tasks` (Tasks) | `tasks.clock`, every 1 min; `tasks.purge`, every 6 h and at start |',
    ])
    expect([interval(1500), interval(120_000), interval(7_200_000)]).toEqual(['1.5 s', '2 min', '2 h'])
  })

  it('replaces only what is between the markers', () => {
    expect(withTable(`intro\n${BEGIN}\nold\n${END}\nafter\n`, '| t |')).toEqual({
      text: `intro\n${BEGIN}\n\n| t |\n\n${END}\nafter\n`,
    })
    expect(withTable('no markers', '| t |').error).toMatch(/has no/)
  })
})
