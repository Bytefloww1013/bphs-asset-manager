// Importing programs through the kernel's import route, with the importer this module registers.
import { describe, expect, it } from 'vitest'
import { setup } from '#kernel/testing/index.ts'

describe('importing programs', () => {
  type Values = Record<string, string>
  const rowsOf = (...values: Values[]) => ({ rows: values.map((v, i) => ({ row: i + 2, values: v })) })

  it('imports programs the same way, and never issues anything', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    await t.call('POST', '/api/programs', { cookie, body: { code: 'P-100', name: 'Outreach North' } })
    const body = rowsOf(
      { code: 'p-100', name: 'Outreach North again', address: 'Elsewhere' },
      { code: 'P-200', name: 'Day Program', address: '12 Mill Lane' },
      { code: 'P-300', name: '' },
      { code: 'P-400', name: 'N'.repeat(121) },
      { code: 'P-500', name: 'Riverside' },
    )
    const preview = await t.call('POST', '/api/import/programs/preview', { cookie, body })
    expect(preview.data.summary).toEqual({ read: 5, create: 2, duplicates: 1, errors: 2 })
    expect(preview.data.rows[0].message).toBe('Skip: Program ID already exists')
    expect(preview.data.rows[2].message).toBe('Row 4: missing Program name')
    expect(preview.data.rows[3].message).toMatch(/^Row 5: .*Program name.*120 characters/)

    const assignments = (await t.call('GET', '/api/assignments', { cookie })).data.length
    const run = await t.call('POST', '/api/import/programs', { cookie, body })
    expect(run.data.created).toBe(2)
    const list = (await t.call('GET', '/api/programs', { cookie })).data
    expect(list.map((p: { code: string }) => p.code).sort()).toEqual(['P-100', 'P-200', 'P-500'])
    expect(list.find((p: { code: string }) => p.code === 'P-100')).toMatchObject({
      name: 'Outreach North',
      address: null,
    })
    expect(list.find((p: { code: string }) => p.code === 'P-200')).toMatchObject({
      name: 'Day Program',
      address: '12 Mill Lane',
      isActive: true,
      assetsHeld: 0,
    })
    expect(list.find((p: { code: string }) => p.code === 'P-500').address).toBeNull()
    expect((await t.call('GET', '/api/assignments', { cookie })).data).toHaveLength(assignments)

    const audit = (await t.call('GET', '/api/audit?action=import', { cookie })).data
    expect(
      audit.entries.map((e: { details: string; entityType: string }) => `${e.entityType}:${e.details}`).sort(),
    ).toEqual(['program:program_id=P-200 · Day Program', 'program:program_id=P-500 · Riverside'])
    expect((await t.call('POST', '/api/import/programs', { cookie, body })).data.created).toBe(0)
  })
})
