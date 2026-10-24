// The custody ledger's own rules, called directly, with every module installed (`server/testing/setup.ts`). The issue and
// return sheets' words, which the services give before these run, are in `server/tests/api.test.ts`.
import { describeError } from '#kernel/lib/errors.ts'
import type { Actor } from '#kernel/lib/actor.ts'
import { GRIEVANCE_ADMIN, setup } from '#kernel/testing/index.ts'
import { describe, expect, it } from 'vitest'
import { custodyKind, heldBy, historyOf, issue, openFor, requireHolder, returnItem } from './index.ts'
import { custodyEmployeeReferences, custodyProgramReferences } from './references.ts'

/** What a call that should fail tells the client. */
function failure(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return describeError(error)
  }
  throw new Error('It did not fail.')
}

/** A fresh server with a laptop, a seat and a program to give out, and the Super Admin to give them. */
async function seed() {
  const t = await setup()
  const cookie = await t.asSuper()
  const lists = (await t.call('GET', '/api/lookups', { cookie })).data
  const laptop = lists.assetTypes.find((x: { name: string }) => x.name === 'Laptop')
  const dell = lists.assetBrands.find((x: { name: string }) => x.name === 'Dell')
  const good = lists.conditionRatings.find((x: { name: string }) => x.name === 'Good')
  const seatType = lists.digitalAssetTypes[0]
  const asset = (
    await t.call('POST', '/api/assets', {
      cookie,
      body: { tag: 'BPHS-0001', typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id },
    })
  ).data as { id: number }
  const seat = (
    await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: seatType.id, account: 'priya@x.example' } })
  ).data as { id: number }
  const program = (await t.call('POST', '/api/programs', { cookie, body: { code: 'P-1', name: 'Harbour House' } }))
    .data as { id: number }
  const actor: Actor = t.superUser
  return { t, actor, asset, seat, program }
}

describe('the custody ledger', () => {
  it('gives an item out once, takes it back once, and keeps who held it', async () => {
    const { t, actor, asset, seat } = await seed()
    const holder = requireHolder(t.db, 'asset', { employeeId: t.person.id })
    const at = new Date('2026-10-01T09:00:00Z')
    const id = issue(t.db, actor, { kind: 'asset', itemId: asset.id, holder, issuedAt: at })

    // Asset 1 is out; seat 1 is another item.
    expect(openFor(t.db, 'asset', [asset.id]).get(asset.id)).toMatchObject({
      id,
      employee: { id: t.person.id, name: 'Priya Raghunathan' },
      program: null,
      issuedAt: at,
      returnedAt: null,
      issuedBy: 'p.raghunathan@bphs.local',
    })
    expect(openFor(t.db, 'digital-asset', [seat.id]).size).toBe(0)
    expect(openFor(t.db, 'asset', []).size).toBe(0)

    expect(failure(() => issue(t.db, actor, { kind: 'asset', itemId: asset.id, holder, issuedAt: at }))).toEqual({
      status: 409,
      code: 'asset_already_assigned',
      message: 'That asset is already assigned. Return it first.',
      details: { assignmentId: id },
    })
    // An assignment of one kind can't be returned as another.
    expect(
      failure(() => returnItem(t.db, actor, { kind: 'digital-asset', assignmentId: id, name: 'BPHS-0001' }, at)),
    ).toMatchObject({ status: 404, message: 'Assignment not found.' })

    const back = new Date('2026-10-02T09:00:00Z')
    returnItem(t.db, actor, { kind: 'asset', assignmentId: id, name: 'BPHS-0001' }, back)
    expect(
      failure(() => returnItem(t.db, actor, { kind: 'asset', assignmentId: id, name: 'BPHS-0001' }, back)),
    ).toEqual({
      status: 409,
      code: 'already_returned',
      message: 'BPHS-0001 has already been returned by you.',
      details: {
        assignmentId: id,
        returnedAt: back.toISOString(),
        returnedBy: 'p.raghunathan@bphs.local',
        returnedByYou: true,
      },
    })
    expect(historyOf(t.db, 'asset', asset.id)).toMatchObject([
      { id, returnedAt: back, returnedBy: 'p.raghunathan@bphs.local' },
    ])
    expect(heldBy(t.db, 'employee', [t.person.id]).get(t.person.id)).toEqual(
      new Map([['asset', { held: 0, total: 1 }]]),
    )
  })

  it('holds its own rules, whatever the caller checked first', async () => {
    const { t, actor, asset, seat, program } = await seed()
    expect(() => custodyKind('boat')).toThrow('No module registers the custody kind "boat".')
    // Only an employee holds a seat.
    expect(failure(() => requireHolder(t.db, 'digital-asset', { programId: program.id }))).toEqual({
      status: 422,
      code: 'validation_failed',
      message: "A program can't hold a digital asset.",
      details: { field: 'programId', fields: { programId: "A program can't hold a digital asset." } },
    })
    expect(failure(() => requireHolder(t.db, 'asset', {}))).toMatchObject({
      status: 422,
      details: { field: 'employeeId' },
    })
    const holder = requireHolder(t.db, 'asset', { employeeId: t.person.id })
    expect(
      failure(() => issue(t.db, actor, { kind: 'asset', itemId: 9999, holder, issuedAt: new Date() })),
    ).toMatchObject({ status: 404, message: 'Asset not found.' })

    t.sqlite.prepare("update assets set status = 'retired' where id = ?").run(asset.id)
    expect(
      failure(() => issue(t.db, actor, { kind: 'asset', itemId: asset.id, holder, issuedAt: new Date() })),
    ).toEqual({
      status: 409,
      code: 'asset_retired',
      message: 'BPHS-0001 is retired and cannot be issued.',
      details: undefined,
    })
    t.sqlite.prepare("update digital_assets set status = 'inactive' where id = ?").run(seat.id)
    expect(
      failure(() => issue(t.db, actor, { kind: 'digital-asset', itemId: seat.id, holder, issuedAt: new Date() })),
    ).toMatchObject({ status: 409, code: 'asset_inactive' })
  })

  it('turns a race on the one-open-per-item index into the same 409, for every kind', async () => {
    const { t, actor, seat } = await seed()
    const holder = requireHolder(t.db, 'digital-asset', { employeeId: t.person.id })
    issue(t.db, actor, { kind: 'digital-asset', itemId: seat.id, holder, issuedAt: new Date() })
    const insert = t.sqlite.prepare(
      "insert into assignments (kind, item_id, employee_id, issued_at, issued_by_id) values ('digital-asset', ?, ?, 1, ?)",
    )
    expect(failure(() => insert.run(seat.id, t.person.id, actor.id))).toEqual({
      status: 409,
      code: 'asset_already_assigned',
      message: 'This asset is already assigned.',
    })
  })

  it('tells what a holder still has, physical before digital, and keeps anyone with history', async () => {
    const { t, actor, asset, seat, program } = await seed()
    const person = requireHolder(t.db, 'digital-asset', { employeeId: t.person.id })
    issue(t.db, actor, { kind: 'digital-asset', itemId: seat.id, holder: person, issuedAt: new Date() })
    const references = () => custodyEmployeeReferences(t.db, actor, [t.person.id]).get(t.person.id)
    expect(references()).toEqual({
      figures: { hasHistory: true, assetsHeld: 0, digitalHeld: 1 },
      deleteBlocker: {
        code: 'has_history',
        reason: 'Has assignment history. Archive instead; history is never deleted.',
      },
      archiveBlocker: { code: 'holds_assets', reason: 'still has 1 digital asset(s). Unassign them before archiving.' },
    })
    const id = issue(t.db, actor, { kind: 'asset', itemId: asset.id, holder: person, issuedAt: new Date() })
    expect(references()?.archiveBlocker?.reason).toBe('still holds 1 asset(s). Return them before archiving.')

    // Someone who can't see Assets sees none of it, but the blockers stand.
    const outsider = t.addUser('g.only@bphs.local', { access: GRIEVANCE_ADMIN })
    expect(custodyEmployeeReferences(t.db, outsider, [t.person.id]).get(t.person.id)).toMatchObject({
      figures: undefined,
      archiveBlocker: { code: 'holds_assets' },
    })
    // One that never held anything is left out: the employee service gives it zero figures.
    expect(custodyEmployeeReferences(t.db, actor, [9999]).size).toBe(0)

    returnItem(t.db, actor, { kind: 'asset', assignmentId: id, name: 'BPHS-0001' }, new Date())
    const site = requireHolder(t.db, 'asset', { programId: program.id })
    issue(t.db, actor, { kind: 'asset', itemId: asset.id, holder: site, issuedAt: new Date() })
    expect(custodyProgramReferences(t.db, [program.id]).get(program.id)).toEqual({
      figures: { assetsHeld: 1, hasHistory: true },
      deleteBlocker: {
        code: 'has_history',
        reason: 'Has assignment history. Deactivate instead; history is never deleted.',
      },
      deactivateBlocker: { code: 'holds_assets', reason: 'still holds 1 asset(s). Return them before deactivating.' },
    })
  })
})
