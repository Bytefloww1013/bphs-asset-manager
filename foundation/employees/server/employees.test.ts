// The employees module's own rules, through the API, with every module installed (`server/testing/setup.ts`).
import { describe, expect, it } from 'vitest'
import type { ServerModule } from '#kernel/modules.ts'
import { installModules, serverModules } from '#kernel/registry.ts'
import { setup } from '#kernel/testing/index.ts'
import type { EmployeeReference, EmployeeReferences } from './index.ts'

/** A fresh server with a Super Admin signed in, and a way to add a Laptop in Good condition. */
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
  return { t, cookie, good, make }
}

describe('employees', () => {
  it('names the field and the limit when an employee value is refused', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const post = (body: Record<string, unknown>) =>
      t.call('POST', '/api/employees', {
        cookie,
        body: { code: 'E-9000', firstName: 'Ana', lastName: 'Cole', ...body },
      })
    const fields = (res: { data: any }) => res.data.details.fields

    expect(fields(await post({ code: 'E'.repeat(41) }))).toEqual({ code: 'Employee ID can be at most 40 characters' })
    expect(fields(await post({ firstName: 'A'.repeat(81) }))).toEqual({
      firstName: 'First name can be at most 80 characters',
    })
    expect(fields(await post({ lastName: 'C'.repeat(81) }))).toEqual({
      lastName: 'Last name can be at most 80 characters',
    })
    expect(fields(await post({ department: 'D'.repeat(81) }))).toEqual({
      department: 'Department can be at most 80 characters',
    })
    expect(fields(await post({ jobTitle: 'J'.repeat(121) }))).toEqual({
      jobTitle: 'Job title can be at most 120 characters',
    })
    expect(fields(await post({ firstName: '  ' }))).toEqual({ firstName: 'Required' })

    expect((await post({})).status).toBe(201)
    const duplicate = await post({ code: 'e-9000' })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ code: 'Employee ID e-9000 already exists.' })
  })

  it('blocks archiving while the employee holds assets', async () => {
    const { t, cookie, good, make } = await seed()
    const asset = (await make('BPHS-1', { holderId: t.person.id })).data
    expect(asset.state).toBe('assigned')
    expect((await t.call('POST', `/api/employees/${t.person.id}/archive`, { cookie })).data.error).toBe('holds_assets')
    await t.call('POST', `/api/assignments/${asset.assignmentId}/return`, {
      cookie,
      body: { conditionRatingId: good.id },
    })
    expect((await t.call('POST', `/api/employees/${t.person.id}/archive`, { cookie })).data.state).toBe('archived')
    expect((await t.call('DELETE', `/api/employees/${t.person.id}`, { cookie })).status).toBe(409)
  })

  it('says why an employee cannot be deleted, in the list and when refusing', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, assetBrands, conditionRatings } = (await t.call('GET', '/api/lookups', { cookie }))
      .data as Lists
    const add = async (code: string, lastName: string) =>
      (await t.call('POST', '/api/employees', { cookie, body: { code, firstName: 'Test', lastName } })).data
    const holder = await add('E-1', 'Holder')
    const assessor = await add('E-2', 'Assessor')
    const spare = await add('E-3', 'Spare')
    expect(spare.deleteBlocked).toBeNull()
    await t.call('POST', '/api/assets', {
      cookie,
      body: {
        tag: 'DEL-1',
        typeId: assetTypes[0]!.id,
        brandId: assetBrands[0]!.id,
        conditionRatingId: conditionRatings[0]!.id,
        holderId: holder.id,
        assessedById: assessor.id,
      },
    })

    const rows = (await t.call('GET', '/api/employees', { cookie })).data as {
      id: number
      deleteBlocked: string | null
    }[]
    const reason = (id: number) => rows.find((row) => row.id === id)!.deleteBlocked
    expect(reason(holder.id)).toBe('Has assignment history. Archive instead; history is never deleted.')
    expect(reason(assessor.id)).toBe('Assessed the condition on 1 record. Archive instead; history is never deleted.')
    expect(reason(t.person.id)).toBe(
      'Linked to the account p.raghunathan@bphs.local. Link that account to someone else on Users first.',
    )
    expect(reason(spare.id)).toBeNull()

    const refuse = async (id: number) => (await t.call('DELETE', `/api/employees/${id}`, { cookie })).data
    expect(await refuse(assessor.id)).toMatchObject({
      error: 'has_history',
      message:
        'Test Assessor cannot be deleted. Assessed the condition on 1 record. Archive instead; history is never deleted.',
    })
    expect(await refuse(t.person.id)).toMatchObject({
      error: 'linked_user',
      message: expect.stringContaining('Linked to the account p.raghunathan@bphs.local'),
    })
    expect((await t.call('DELETE', `/api/employees/${spare.id}`, { cookie })).status).toBe(204)

    // Unlinked, the same employee can go.
    t.sqlite.prepare('update users set employee_id = null where id = ?').run(t.superUser.id)
    expect((await t.call('DELETE', `/api/employees/${t.person.id}`, { cookie })).status).toBe(204)
  })

  it('asks every module what it has on an employee: the figures of each, and the first blocker in registry order', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const spare = (
      await t.call('POST', '/api/employees', { cookie, body: { code: 'E-1', firstName: 'Test', lastName: 'Spare' } })
    ).data
    const installed = serverModules()
    // The probes borrow a manifest: the hooks read only their answers.
    const manifest = installed[0]?.manifest
    if (!manifest) throw new Error('no modules installed')
    // A module that has `reference` on the spare employee, and nothing on anyone else.
    const answering = (reference: EmployeeReference): ServerModule => {
      const references: EmployeeReferences = (_db, _viewer, ids) =>
        new Map((ids ?? [spare.id]).filter((id) => id === spare.id).map((id) => [id, reference]))
      return { manifest, hooks: { 'employee.references': [references] } }
    }
    try {
      installModules([
        ...installed,
        answering({ figures: { assetsHeld: 2 }, archiveBlocker: { code: 'first', reason: 'is needed by the first.' } }),
        answering({
          figures: { openGrievancesOwned: 1 },
          deleteBlocker: { code: 'second', reason: 'Kept by the second.' },
          archiveBlocker: { code: 'second', reason: 'is needed by the second.' },
        }),
      ])
      const rows = (await t.call('GET', '/api/employees', { cookie })).data as { id: number }[]
      expect(rows.find((row) => row.id === spare.id)).toMatchObject({
        assetsHeld: 2,
        digitalHeld: 0,
        openGrievancesOwned: 1,
        hasHistory: false,
        deleteBlocked: 'Kept by the second.',
      })
      // With nothing from any module, the linked account is what keeps them.
      expect(rows.find((row) => row.id === t.person.id)).toMatchObject({
        assetsHeld: 0,
        deleteBlocked:
          'Linked to the account p.raghunathan@bphs.local. Link that account to someone else on Users first.',
      })
      expect((await t.call('POST', `/api/employees/${spare.id}/archive`, { cookie })).data).toMatchObject({
        error: 'first',
        message: 'Test Spare is needed by the first.',
      })
      expect((await t.call('DELETE', `/api/employees/${spare.id}`, { cookie })).data).toMatchObject({
        error: 'second',
        message: 'Test Spare cannot be deleted. Kept by the second.',
      })
      // Restoring asks nobody.
      installModules(installed)
      expect((await t.call('POST', `/api/employees/${spare.id}/archive`, { cookie })).data.state).toBe('archived')
      installModules([
        ...installed,
        answering({ archiveBlocker: { code: 'first', reason: 'is needed by the first.' } }),
      ])
      expect((await t.call('POST', `/api/employees/${spare.id}/restore`, { cookie })).data.state).toBe('active')
    } finally {
      installModules(installed)
    }
  })
})
