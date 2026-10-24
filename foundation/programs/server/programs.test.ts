// The programs module's own rules, through the API, with every module installed (`server/testing/setup.ts`).
import { describe, expect, it } from 'vitest'
import type { ServerModule } from '#kernel/modules.ts'
import { installModules, serverModules } from '#kernel/registry.ts'
import { setup } from '#kernel/testing/index.ts'
import type { ProgramReference, ProgramReferences } from './index.ts'

/** A fresh server with a Super Admin signed in, a way to add a Laptop in Good condition, and one to add a program. */
/** The lists `/api/lookups` offers, as far as these tests read them. */
type Lists = Record<'assetTypes' | 'assetBrands' | 'conditionRatings', { id: number; name: string }[]>

async function seed() {
  const t = await setup()
  const cookie = await t.asSuper()
  const { assetTypes, assetBrands, conditionRatings } = (await t.call('GET', '/api/lookups', { cookie })).data as Lists
  const laptop = assetTypes.find((x) => x.name === 'Laptop')!
  const dell = assetBrands.find((x) => x.name === 'Dell')!
  const good = conditionRatings.find((x) => x.name === 'Good')!
  const make = async (tag: string, extra: Record<string, unknown> = {}) =>
    await t.call('POST', '/api/assets', {
      cookie,
      body: { tag, typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id, ...extra },
    })
  const program = async (code: string, name: string, address?: string) =>
    (await t.call('POST', '/api/programs', { cookie, body: { code, name, address } })).data
  return { t, cookie, good, make, program }
}

describe('programs', () => {
  it('adds, edits and lists programs, and keeps the Program ID unique whatever the letter case', async () => {
    const { t, cookie, program } = await seed()
    const created = await t.call('POST', '/api/programs', {
      cookie,
      body: { code: ' P-100 ', name: 'Outreach North', address: '12 Mill Lane' },
    })
    expect(created.status).toBe(201)
    expect(created.data).toMatchObject({
      code: 'P-100',
      name: 'Outreach North',
      address: '12 Mill Lane',
      isActive: true,
      assetsHeld: 0,
      hasHistory: false,
      deleteBlocked: null,
    })
    await program('P-200', 'After School')

    const duplicate = await t.call('POST', '/api/programs', { cookie, body: { code: 'p-100', name: 'Another' } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.data).toMatchObject({
      error: 'duplicate_program',
      message: 'Program ID p-100 already exists.',
      details: { fields: { code: 'Program ID p-100 already exists.' } },
    })
    // The database holds the rule as well.
    expect(() => t.sqlite.prepare("insert into programs (code, name) values ('p-100', 'Direct')").run()).toThrow(
      /UNIQUE/,
    )

    const missing = await t.call('POST', '/api/programs', { cookie, body: { code: '', name: 'N'.repeat(121) } })
    expect(missing.status).toBe(422)
    expect(missing.data.details.fields).toEqual({
      code: 'Required',
      name: 'Program name can be at most 120 characters',
    })

    // An edit may change the case of its own ID, clear the address, and not take another program's ID.
    const edited = await t.call('PATCH', `/api/programs/${created.data.id}`, {
      cookie,
      body: { code: 'p-100', name: 'Outreach North', address: '' },
    })
    expect(edited.data).toMatchObject({ code: 'p-100', address: null })
    expect(
      (await t.call('PATCH', `/api/programs/${created.data.id}`, { cookie, body: { code: 'P-200' } })).status,
    ).toBe(409)
    expect((await t.call('PATCH', '/api/programs/9999', { cookie, body: { name: 'Nobody' } })).status).toBe(404)

    const list = (await t.call('GET', '/api/programs', { cookie })).data
    expect(list.map((p: { name: string }) => p.name)).toEqual(['After School', 'Outreach North'])
    expect((await t.call('GET', '/api/lookups', { cookie })).data.programs).toEqual([
      { id: list[0].id, code: 'P-200', name: 'After School' },
      { id: created.data.id, code: 'p-100', name: 'Outreach North' },
    ])

    const audit = (await t.call('GET', '/api/audit?q=program', { cookie })).data.entries.map(
      (e: { action: string; entityType: string; details: string }) => [e.action, e.entityType, e.details],
    )
    expect(audit).toEqual([
      ['update', 'program', 'program_id=p-100 · program_id: P-100 → p-100; address: 12 Mill Lane → —'],
      ['create', 'program', 'program_id=P-200 · After School'],
      ['create', 'program', 'program_id=P-100 · Outreach North'],
    ])
  })

  it('deactivates a program that has held assets instead of deleting it, and only once it holds none', async () => {
    const { t, cookie, good, make, program } = await seed()
    const admin = await t.asAdmin()
    const outreach = await program('P-100', 'Outreach North')
    const mistake = await program('P-999', 'Typo')
    const asset = (await make('BPHS-0141', { programId: outreach.id })).data

    const holding = await t.call('POST', `/api/programs/${outreach.id}/deactivate`, { cookie })
    expect(holding.status).toBe(409)
    expect(holding.data).toMatchObject({
      error: 'holds_assets',
      message: 'Outreach North still holds 1 asset(s). Return them before deactivating.',
    })

    await t.call('POST', '/api/assignments/return-bulk', {
      cookie,
      body: { ids: [asset.assignmentId], conditionRatingId: good.id },
    })
    const kept = await t.call('DELETE', `/api/programs/${outreach.id}`, { cookie })
    expect(kept.status).toBe(409)
    expect(kept.data).toMatchObject({
      error: 'has_history',
      message:
        'Outreach North cannot be deleted. Has assignment history. Deactivate instead; history is never deleted.',
    })
    expect(
      (await t.call('GET', '/api/programs', { cookie })).data.find((p: { id: number }) => p.id === outreach.id)
        .deleteBlocked,
    ).toBe('Has assignment history. Deactivate instead; history is never deleted.')

    const off = await t.call('POST', `/api/programs/${outreach.id}/deactivate`, { cookie: admin })
    expect(off.data).toMatchObject({ isActive: false, assetsHeld: 0, hasHistory: true })
    // A deactivated program is offered to nobody and refused if asked for; its history still names it.
    expect(
      (await t.call('GET', '/api/lookups', { cookie })).data.programs.map((p: { code: string }) => p.code),
    ).toEqual(['P-999'])
    const refused = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, programId: outreach.id, conditionRatingId: good.id },
    })
    expect(refused.data).toMatchObject({ error: 'program_inactive', message: 'Outreach North is deactivated.' })
    expect((await t.call('GET', '/api/assets/tag/BPHS-0141', { cookie })).data.history[0].program.name).toBe(
      'Outreach North',
    )
    expect((await t.call('POST', `/api/programs/${outreach.id}/reactivate`, { cookie: admin })).data.isActive).toBe(
      true,
    )

    // Deleting is for a program entered by mistake, and for a Super Admin.
    expect((await t.call('DELETE', `/api/programs/${mistake.id}`, { cookie: admin })).status).toBe(403)
    expect((await t.call('DELETE', `/api/programs/${mistake.id}`, { cookie })).status).toBe(204)
    expect((await t.call('GET', '/api/programs', { cookie })).data.map((p: { code: string }) => p.code)).toEqual([
      'P-100',
    ])
  })

  it('asks every module what it has on a program: the figures of each, and the first blocker in registry order', async () => {
    const { t, cookie, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    const installed = serverModules()
    // The probes borrow a manifest: the hooks read only their answers.
    const manifest = installed[0]?.manifest
    if (!manifest) throw new Error('no modules installed')
    const answering = (reference: ProgramReference): ServerModule => {
      const references: ProgramReferences = (_db, ids) =>
        new Map((ids ?? [outreach.id]).filter((id) => id === outreach.id).map((id) => [id, reference]))
      return { manifest, hooks: { 'program.references': [references] } }
    }
    try {
      installModules([
        ...installed,
        answering({
          figures: { assetsHeld: 3 },
          deactivateBlocker: { code: 'first', reason: 'is needed by the first.' },
        }),
        answering({
          figures: { hasHistory: true },
          deleteBlocker: { code: 'second', reason: 'Kept by the second.' },
          deactivateBlocker: { code: 'second', reason: 'is needed by the second.' },
        }),
      ])
      expect((await t.call('GET', '/api/programs', { cookie })).data).toMatchObject([
        { id: outreach.id, assetsHeld: 3, hasHistory: true, deleteBlocked: 'Kept by the second.' },
      ])
      expect((await t.call('POST', `/api/programs/${outreach.id}/deactivate`, { cookie })).data).toMatchObject({
        error: 'first',
        message: 'Outreach North is needed by the first.',
      })
      expect((await t.call('DELETE', `/api/programs/${outreach.id}`, { cookie })).data).toMatchObject({
        error: 'second',
        message: 'Outreach North cannot be deleted. Kept by the second.',
      })
    } finally {
      installModules(installed)
    }
  })
})
