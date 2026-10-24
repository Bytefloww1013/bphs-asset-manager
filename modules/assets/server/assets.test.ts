// The physical assets' API: assets and their assignments, the lookup lists they use, and assets a program holds.
import { describe, expect, it, vi } from 'vitest'
import { createDb, runMigrations } from '#kernel/db/client.ts'
import { setup } from '#kernel/testing/index.ts'
import type { Lookups } from '../shared/index.ts'
import { DEFAULT_RATINGS, DEFAULT_TYPES, ensureDefaultLists } from './lists.ts'
import { assetTypes, assets, conditionRatings } from './schema.ts'

async function seed() {
  const t = await setup()
  const cookie = await t.asSuper()
  const { assetTypes, assetBrands, conditionRatings } = (await t.call('GET', '/api/lookups', { cookie }))
    .data as Lookups
  const laptop = assetTypes.find((x) => x.name === 'Laptop')!
  const dell = assetBrands.find((x) => x.name === 'Dell')!
  const good = conditionRatings.find((x) => x.name === 'Good')!
  const fair = conditionRatings.find((x) => x.name === 'Fair')!
  const make = async (tag: string, extra: Record<string, unknown> = {}) =>
    await t.call('POST', '/api/assets', {
      cookie,
      body: { tag, typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id, ...extra },
    })
  const program = async (code: string, name: string, address?: string) =>
    (await t.call('POST', '/api/programs', { cookie, body: { code, name, address } })).data
  return { t, cookie, laptop, dell, good, fair, make, program }
}

describe('assets, assignments and the one-active-assignment rule', () => {
  it('creates an asset in storage with an intake condition and an audit entry', async () => {
    const { t, cookie, make } = await seed()
    const asset = (await make('bphs-0150')).data
    expect(asset.tag).toBe('BPHS-0150')
    expect(asset.state).toBe('in_storage')
    expect(asset.condition.rating).toBe('Good')
    const audit = await t.call('GET', '/api/audit', { cookie })
    expect(audit.data.entries[0]).toMatchObject({
      action: 'create',
      entityType: 'asset',
      details: 'BPHS-0150 · Laptop · Dell',
    })
    const dup = await t.call('POST', '/api/assets', {
      cookie,
      body: { tag: 'BPHS-0150', typeId: asset.typeId, brandId: asset.brandId, conditionRatingId: 1 },
    })
    expect(dup.status).toBe(409)
  })

  it('names the field and the limit when a value is refused, so a form can show it under that field', async () => {
    const { t, cookie, laptop, dell, good, make } = await seed()
    const asset = (await make('BPHS-0400')).data
    const post = (body: Record<string, unknown>) =>
      t.call('POST', '/api/assets', {
        cookie,
        body: { tag: 'BPHS-0401', typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id, ...body },
      })
    const fields = (res: { data: any }) => res.data.details.fields

    const serial = await post({ serial: 'S'.repeat(81) })
    expect(serial.status).toBe(422)
    expect(serial.data.message).toBe('Serial number can be at most 80 characters')
    expect(fields(serial)).toEqual({ serial: 'Serial number can be at most 80 characters' })
    expect(fields(await post({ tag: 'T'.repeat(41) }))).toEqual({ tag: 'Asset tag can be at most 40 characters' })
    expect(fields(await post({ notes: 'N'.repeat(1001) }))).toEqual({ notes: 'Notes can be at most 1000 characters' })

    // Rules the schema cannot see name their field in the same place.
    const duplicate = await post({ tag: 'bphs-0400' })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ tag: 'Asset tag BPHS-0400 already exists.' })
    expect(fields(await post({ typeId: 9999 }))).toEqual({ typeId: 'Choose an active asset type.' })

    // The edit sheet sends tag, type and serial together.
    const edit = await t.call('PATCH', `/api/assets/${asset.id}`, {
      cookie,
      body: { tag: asset.tag, typeId: laptop.id, serial: 'S'.repeat(81) },
    })
    expect(edit.status).toBe(422)
    expect(fields(edit)).toEqual({ serial: 'Serial number can be at most 80 characters' })
  })

  it('issues once, refuses a second holder, and records both condition snapshots', async () => {
    const { t, cookie, good, fair, make } = await seed()
    const asset = (await make('BPHS-0141')).data
    const issued = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(issued.status).toBe(201)
    expect(issued.data.issueRating).toBe('Good')

    const second = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(second.status).toBe(409)
    expect(second.data.error).toBe('asset_already_assigned')
    // The database refuses it as well.
    expect(() =>
      t.sqlite
        .prepare(
          "insert into assignments (kind, item_id, employee_id, issued_at, issued_by_id) values ('asset', ?, ?, ?, ?)",
        )
        .run(asset.id, t.person.id, Date.now(), t.superUser.id),
    ).toThrow(/UNIQUE/)

    const ret = await t.call('POST', `/api/assignments/${issued.data.id}/return`, {
      cookie,
      body: { conditionRatingId: fair.id, notes: 'Cracked corner' },
    })
    expect(ret.status).toBe(204)

    const detail = await t.call('GET', '/api/assets/tag/bphs-0141', { cookie })
    expect(detail.data.asset.state).toBe('in_storage')
    expect(detail.data.history).toHaveLength(1)
    expect(detail.data.history[0]).toMatchObject({ issueRating: 'Good', returnRating: 'Fair' })
    expect(detail.data.conditions).toHaveLength(3) // intake + issue + return
    expect(detail.data.asset.condition.rating).toBe('Fair')
  })

  it('records nobody as the assessor when the field is sent empty, and the signed-in user only when it is not sent', async () => {
    const { t, cookie, laptop, dell, good } = await seed()
    const assessors = async (tag: string) =>
      (await t.call('GET', `/api/assets/tag/${tag}`, { cookie })).data.conditions.map(
        (c: { kind: string; assessedBy: string | null }) => [c.kind, c.assessedBy],
      )
    const create = (tag: string, extra: Record<string, unknown>) =>
      t.call('POST', '/api/assets', {
        cookie,
        body: { tag, typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id, ...extra },
      })

    // Not sent: the signed-in user's own employee, at intake, issue and return.
    const own = (await create('BPHS-0160', {})).data
    const ownIssue = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: own.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    await t.call('POST', `/api/assignments/${ownIssue.data.id}/return`, {
      cookie,
      body: { conditionRatingId: good.id },
    })
    expect((await assessors('BPHS-0160')).sort()).toEqual([
      ['intake', 'Priya Raghunathan'],
      ['issue', 'Priya Raghunathan'],
      ['return', 'Priya Raghunathan'],
    ])

    // Sent empty: nobody, at each of the three.
    const none = (await create('BPHS-0161', { assessedById: null })).data
    const noneIssue = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: none.id, employeeId: t.person.id, conditionRatingId: good.id, assessedById: null },
    })
    expect(noneIssue.status).toBe(201)
    const noneReturn = await t.call('POST', `/api/assignments/${noneIssue.data.id}/return`, {
      cookie,
      body: { conditionRatingId: good.id, assessedById: null },
    })
    expect(noneReturn.status).toBe(204)
    expect((await assessors('BPHS-0161')).sort()).toEqual([
      ['intake', null],
      ['issue', null],
      ['return', null],
    ])

    // A bulk return and an asset created already issued follow the same rule.
    const issuedNow = await create('BPHS-0162', { assessedById: null, holderId: t.person.id })
    expect(issuedNow.status).toBe(201)
    const open = (await t.call('GET', '/api/assignments', { cookie })).data.find(
      (a: { assetTag: string }) => a.assetTag === 'BPHS-0162',
    )
    const bulk = await t.call('POST', '/api/assignments/return-bulk', {
      cookie,
      body: { ids: [open.id], conditionRatingId: good.id, assessedById: null },
    })
    expect(bulk.data.returned).toEqual([open.id])
    expect((await assessors('BPHS-0162')).every(([, who]: [string, string | null]) => who === null)).toBe(true)

    // An unknown employee is still refused.
    const unknown = await create('BPHS-0163', { assessedById: 9999 })
    expect(unknown.status).toBe(422)
    expect(unknown.data.details.fields).toEqual({ assessedById: 'Choose who assessed the condition.' })
  })

  it('reports who already returned an assignment (the race-conflict case)', async () => {
    const { t, cookie, good, make } = await seed()
    const asset = (await make('BPHS-0141')).data
    const issued = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    const other = await t.asAdmin()
    const first = await t.call('POST', `/api/assignments/${issued.data.id}/return`, {
      cookie: other,
      body: { conditionRatingId: good.id },
    })
    expect(first.status).toBe(204)
    const late = await t.call('POST', `/api/assignments/${issued.data.id}/return`, {
      cookie,
      body: { conditionRatingId: good.id },
    })
    expect(late.status).toBe(409)
    expect(late.data.error).toBe('already_returned')
    expect(late.data.message).toBe('BPHS-0141 has already been returned by m.oyelaran@bphs.local.')
    expect(late.data.details).toMatchObject({ returnedBy: 'm.oyelaran@bphs.local', returnedByYou: false })
    expect(Date.parse(late.data.details.returnedAt)).toBeLessThanOrEqual(Date.now())

    // The same person again, from another tab say: it was not "another user".
    const again = await t.call('POST', `/api/assignments/${issued.data.id}/return`, {
      cookie: other,
      body: { conditionRatingId: good.id },
    })
    expect(again.status).toBe(409)
    expect(again.data.message).toBe('BPHS-0141 has already been returned by you.')
    expect(again.data.details).toMatchObject({ returnedBy: 'm.oyelaran@bphs.local', returnedByYou: true })
    // A bulk return passes the same sentence on for the row it could not close.
    const bulk = await t.call('POST', '/api/assignments/return-bulk', {
      cookie,
      body: { ids: [issued.data.id], conditionRatingId: good.id },
    })
    expect(bulk.data).toEqual({
      returned: [],
      failed: [{ id: issued.data.id, message: 'BPHS-0141 has already been returned by m.oyelaran@bphs.local.' }],
    })
  })

  it('cannot retire an assigned asset, but can retire and reinstate one in storage', async () => {
    const { t, cookie, good, make } = await seed()
    const asset = (await make('BPHS-0141')).data
    await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect((await t.call('POST', `/api/assets/${asset.id}/retire`, { cookie })).status).toBe(409)

    const spare = (await make('BPHS-0142')).data
    const retired = await t.call('POST', `/api/assets/${spare.id}/retire`, { cookie })
    expect(retired.data.state).toBe('retired')
    const issueRetired = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: spare.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(issueRetired.data.error).toBe('asset_retired')
    expect((await t.call('POST', `/api/assets/${spare.id}/reinstate`, { cookie })).data.state).toBe('in_storage')
  })

  it('deletes an asset with no history, and never one with history', async () => {
    const { t, cookie, good, make } = await seed()
    const clean = (await make('BPHS-0150')).data

    const used = (await make('BPHS-0141')).data
    await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: used.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    const refused = await t.call('DELETE', `/api/assets/${used.id}`, { cookie })
    expect(refused.status).toBe(409)
    expect(refused.data.error).toBe('has_history')

    expect((await t.call('DELETE', `/api/assets/${clean.id}`, { cookie })).status).toBe(204)
    expect((await t.call('GET', '/api/assets/tag/BPHS-0150', { cookie })).status).toBe(404)
  })

  it('bulk-adds rows independently and reports the bad ones by row number', async () => {
    const { t, cookie } = await seed()
    const res = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: {
        rows: [
          { tag: 'bphs-0201', type: 'laptop', brand: 'dell', serial: 'A1' },
          { tag: 'BPHS-0202', type: 'Hoverboard', brand: 'Dell' },
          { tag: 'BPHS-0203', type: 'Phone', brand: 'Apple', condition: 'Fair', holder: 'E-1042' },
          { tag: 'BPHS-0201', type: 'Phone', brand: 'Apple' },
        ],
      },
    })
    expect(res.data.created).toBe(2)
    expect(res.data.errors.map((e: { row: number }) => e.row)).toEqual([2, 4])
    const assets = (await t.call('GET', '/api/assets', { cookie })).data
    expect(assets.find((a: { tag: string }) => a.tag === 'BPHS-0203').state).toBe('assigned')
  })

  it('holds bulk rows to the limits of Add asset and does not create the ones that break them', async () => {
    const { t, cookie } = await seed()
    const res = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: {
        rows: [
          { tag: 'T'.repeat(305), type: 'Laptop', brand: 'Dell', serial: 'S'.repeat(500) },
          { tag: 'BPHS-0301', type: 'Laptop', brand: 'Dell', serial: 'S'.repeat(81) },
          { tag: 'bphs-0302', type: 'Laptop', brand: 'Dell', serial: 'S'.repeat(80) },
        ],
      },
    })
    expect(res.status).toBe(200)
    expect(res.data.created).toBe(1)
    expect(res.data.errors).toEqual([
      { row: 1, message: expect.stringMatching(/Asset tag.*40 characters/) },
      { row: 2, message: expect.stringMatching(/Serial number.*80 characters/) },
    ])
    const stored = (await t.call('GET', '/api/assets', { cookie })).data as { tag: string; serial: string | null }[]
    const tags = stored.map((a) => a.tag)
    expect(tags).toContain('BPHS-0302')
    expect(tags).not.toContain('BPHS-0301')
    expect(stored.every((a) => a.tag.length <= 40 && (a.serial ?? '').length <= 80)).toBe(true)
  })

  it('keeps asset tags to characters that work on a label and in an address, wherever the tag comes from', async () => {
    const { t, cookie, laptop, dell, good, make } = await seed()
    const create = (tag: string) =>
      t.call('POST', '/api/assets', {
        cookie,
        body: { tag, typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id },
      })
    const characters = 'Asset tag can only contain letters, digits, spaces, hyphens, underscores and dots'

    for (const tag of ['A/B', '50%', 'Q?X#Y', 'TAG\\1', 'É-1']) {
      const refused = await create(tag)
      expect(refused.status, tag).toBe(422)
      expect(refused.data.details.fields).toEqual({ tag: characters })
    }
    // "." and ".." can be stored but never opened: a URL treats them as "here" and "one level up".
    for (const tag of ['.', '..', '...'])
      expect((await create(tag)).data.details.fields, tag).toEqual({ tag: 'Asset tag cannot be only dots' })

    for (const tag of ['tag with space', 'a_b.c-1', '.5']) {
      const made = await create(tag)
      expect(made.status, tag).toBe(201)
      expect(made.data.tag).toBe(tag.toUpperCase())
      expect(
        (await t.call('GET', `/api/assets/tag/${encodeURIComponent(made.data.tag)}`, { cookie })).status,
        tag,
      ).toBe(200)
    }

    // The same rule for a rename and for pasted rows.
    const asset = (await make('BPHS-0500')).data
    const rename = await t.call('PATCH', `/api/assets/${asset.id}`, { cookie, body: { tag: 'BPHS/0500' } })
    expect(rename.status).toBe(422)
    expect(rename.data.details.fields).toEqual({ tag: characters })
    const pasted = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: {
        rows: [
          { tag: 'BPHS/0501', type: 'Laptop', brand: 'Dell' },
          { tag: '..', type: 'Laptop', brand: 'Dell' },
          { tag: 'BPHS-0502', type: 'Laptop', brand: 'Dell' },
        ],
      },
    })
    expect(pasted.data).toEqual({
      created: 1,
      errors: [
        { row: 1, message: `Asset tag: ${characters}.` },
        { row: 2, message: 'Asset tag: Asset tag cannot be only dots.' },
      ],
    })

    // An asset tagged before the rule existed is still found, and can still be edited as long as its tag is left alone.
    const old = t.db.insert(assets).values({ tag: 'OLD/TAG', typeId: laptop.id, brandId: dell.id }).returning().get()
    expect((await t.call('GET', '/api/assets/tag/OLD%2FTAG', { cookie })).status).toBe(200)
    const edited = await t.call('PATCH', `/api/assets/${old.id}`, { cookie, body: { serial: 'SN-1' } })
    expect(edited.status).toBe(200)
    expect(edited.data).toMatchObject({ tag: 'OLD/TAG', serial: 'SN-1' })
  })

  it('reports a row that fails for an unforeseen reason and carries on with the rest of a bulk request', async () => {
    const { t, cookie, good, make } = await seed()
    // Two faults the service does not check for: a constraint raised by the database, and an error that is nobody's rule at all.
    t.sqlite.exec(`
      create trigger test_refuse before insert on assets when new.tag = 'BOOM-409' begin select raise(abort, 'refused by a trigger'); end;
      create trigger test_break before insert on assets when new.tag = 'BOOM-500' begin select json('{'); end;`)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const pasted = await t.call('POST', '/api/assets/bulk', {
        cookie,
        body: {
          rows: ['OK-1', 'BOOM-409', 'BOOM-500', 'BOOM-500', 'OK-2'].map((tag) => ({
            tag,
            type: 'Laptop',
            brand: 'Dell',
          })),
        },
      })
      expect(pasted.status).toBe(200)
      expect(pasted.data).toEqual({
        created: 2,
        errors: [
          { row: 2, message: 'That change conflicts with existing records.' },
          { row: 3, message: 'Something went wrong on the server.' },
          { row: 4, message: 'Something went wrong on the server.' },
        ],
      })
      // Our own fault is logged for whoever runs the server, once, however many rows hit it.
      expect(logged).toHaveBeenCalledTimes(1)
      const tags = ((await t.call('GET', '/api/assets', { cookie })).data as { tag: string }[]).map((a) => a.tag)
      expect(tags).toEqual(expect.arrayContaining(['OK-1', 'OK-2']))
      expect(tags.some((tag) => tag.startsWith('BOOM'))).toBe(false)

      // The same for a bulk return: the middle one cannot be closed, the two around it are.
      const issued: number[] = []
      for (const tag of ['R-1', 'R-2', 'R-3']) {
        const asset = (await make(tag)).data
        issued.push(
          (
            await t.call('POST', '/api/assignments', {
              cookie,
              body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
            })
          ).data.id,
        )
      }
      t.sqlite.exec(
        `create trigger test_stuck before update on assignments when old.id = ${issued[1]} begin select raise(abort, 'refused by a trigger'); end;`,
      )
      const returned = await t.call('POST', '/api/assignments/return-bulk', {
        cookie,
        body: { ids: issued, conditionRatingId: good.id },
      })
      expect(returned.status).toBe(200)
      expect(returned.data).toEqual({
        returned: [issued[0], issued[2]],
        failed: [{ id: issued[1], message: 'That change conflicts with existing records.' }],
      })
      expect(((await t.call('GET', '/api/assignments', { cookie })).data as { id: number }[]).map((a) => a.id)).toEqual(
        [issued[1]],
      )
    } finally {
      logged.mockRestore()
    }
  })

  it("says how many rows a paste may hold in words, not in the validator's", async () => {
    const { t, cookie } = await seed()
    const none = await t.call('POST', '/api/assets/bulk', { cookie, body: { rows: [] } })
    expect(none.status).toBe(422)
    expect(none.data.message).toBe('Paste at least one row')
    expect(none.data.details.fields.rows).toBe('Paste at least one row')

    const rows = Array.from({ length: 501 }, (_, i) => ({
      tag: `BPHS-${String(i + 1000)}`,
      type: 'Laptop',
      brand: 'Dell',
    }))
    const many = await t.call('POST', '/api/assets/bulk', { cookie, body: { rows } })
    expect(many.status).toBe(422)
    expect(many.data.message).toBe('Paste at most 500 rows at a time')
    expect(many.data.details.fields.rows).toBe('Paste at most 500 rows at a time')
  })
})

describe('the lookup lists the assets use', () => {
  it('names the field and the limit when a list name is refused', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const fields = (res: { data: any }) => res.data.details.fields
    expect(fields(await t.call('POST', '/api/asset-types', { cookie, body: { name: 'T'.repeat(61) } }))).toEqual({
      name: 'Name can be at most 60 characters',
    })
    expect(
      fields(await t.call('POST', '/api/condition-ratings', { cookie, body: { name: 'R'.repeat(41), score: 50 } })),
    ).toEqual({ name: 'Name can be at most 40 characters' })

    const duplicate = await t.call('POST', '/api/asset-types', { cookie, body: { name: 'laptop' } })
    expect(duplicate.status).toBe(409)
    expect(fields(duplicate)).toEqual({ name: 'An asset type named "laptop" already exists.' })
  })

  it('answers a write with the same row the lists show, when other rows have history of their own', async () => {
    const { t, cookie, laptop, fair, make } = await seed()
    const first = (await make('ROW-1', { holderId: t.person.id })).data
    await t.call('POST', `/api/assignments/${first.assignmentId}/return`, {
      cookie,
      body: { conditionRatingId: fair.id, notes: 'scuffed' },
    })
    await make('ROW-2', { holderId: t.person.id })
    await make('ROW-3')

    const { daysOut: _a, ...changed } = (
      await t.call('PATCH', `/api/assets/${first.id}`, { cookie, body: { serial: 'SN-77' } })
    ).data
    const { daysOut: _b, ...listed } = (await t.call('GET', '/api/assets', { cookie })).data.find(
      (row: { id: number }) => row.id === first.id,
    )
    expect(changed).toEqual(listed)
    expect(changed).toMatchObject({
      state: 'in_storage',
      hasHistory: true,
      condition: { rating: 'Fair', notes: 'scuffed' },
    })
    expect(changed.lastReturnedAt).not.toBeNull()

    const type = (await t.call('PATCH', `/api/asset-types/${laptop.id}`, { cookie, body: { name: 'Renamed' } })).data
    expect(type).toEqual(
      (await t.call('GET', '/api/asset-types', { cookie })).data.find((row: { id: number }) => row.id === type.id),
    )
    expect(type.assetCount).toBe(3)
    const rating = (await t.call('PATCH', `/api/condition-ratings/${fair.id}`, { cookie, body: { name: 'Worn' } })).data
    expect(rating).toEqual(
      (await t.call('GET', '/api/condition-ratings', { cookie })).data.find(
        (row: { id: number }) => row.id === rating.id,
      ),
    )
    expect(rating.snapshotCount).toBe(1)
  })

  it('protects types in use', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const { assetTypes, assetBrands, conditionRatings } = (await t.call('GET', '/api/lookups', { cookie }))
      .data as Lookups
    await t.call('POST', '/api/assets', {
      cookie,
      body: {
        tag: 'X-1',
        typeId: assetTypes[0]!.id,
        brandId: assetBrands[0]!.id,
        conditionRatingId: conditionRatings[0]!.id,
      },
    })
    const refused = await t.call('DELETE', `/api/asset-types/${assetTypes[0]!.id}`, { cookie })
    expect(refused.status).toBe(409)
    expect((await t.call('DELETE', `/api/asset-types/${assetTypes[1]!.id}`, { cookie })).status).toBe(204)
    expect(
      (await t.call('POST', '/api/asset-types', { cookie, body: { name: assetTypes[0]!.name.toUpperCase() } })).status,
    ).toBe(409)
  })

  it('keeps at least one rating and one type active, whoever asks', async () => {
    const t = await setup()
    const admin = await t.asAdmin()
    const superAdmin = await t.asSuper()
    for (const [path, noun] of [
      ['/api/condition-ratings', 'condition rating'],
      ['/api/asset-types', 'asset type'],
      ['/api/digital-asset-types', 'digital asset type'],
    ] as const) {
      const items = (await t.call('GET', path, { cookie: admin })).data as { id: number; name: string }[]
      const [last, ...rest] = items
      for (const item of rest)
        expect((await t.call('PATCH', `${path}/${item.id}`, { cookie: admin, body: { isActive: false } })).status).toBe(
          200,
        )

      // The last one stays on, for an Admin and for a Super Admin, and cannot be deleted either although nothing uses it.
      for (const cookie of [admin, superAdmin]) {
        const refused = await t.call('PATCH', `${path}/${last!.id}`, { cookie, body: { isActive: false } })
        expect(refused.status).toBe(409)
        expect(refused.data).toMatchObject({
          error: 'last_active',
          message: `"${last!.name}" is the only active ${noun}. Activate or add another first.`,
        })
      }
      expect((await t.call('DELETE', `${path}/${last!.id}`, { cookie: superAdmin })).data.error).toBe('last_active')
      const stillActive = (
        (await t.call('GET', path, { cookie: admin })).data as { id: number; isActive: boolean }[]
      ).filter((item) => item.isActive)
      expect(stillActive.map((item) => item.id)).toEqual([last!.id])
      // It can still be renamed, and an inactive one can still be deleted.
      expect((await t.call('PATCH', `${path}/${last!.id}`, { cookie: admin, body: { name: 'Renamed' } })).status).toBe(
        200,
      )
      expect((await t.call('DELETE', `${path}/${rest[0]!.id}`, { cookie: superAdmin })).status).toBe(204)

      // With a second one active, the first can go.
      expect(
        (await t.call('PATCH', `${path}/${rest[1]!.id}`, { cookie: admin, body: { isActive: true } })).status,
      ).toBe(200)
      expect((await t.call('PATCH', `${path}/${last!.id}`, { cookie: admin, body: { isActive: false } })).status).toBe(
        200,
      )
    }
    const lookups = (await t.call('GET', '/api/lookups', { cookie: admin })).data
    expect(lookups.conditionRatings).toHaveLength(1)
    expect(lookups.assetTypes).toHaveLength(1)
    expect(lookups.digitalAssetTypes).toHaveLength(1)
    expect(
      (await t.call('GET', '/api/audit?action=update', { cookie: admin })).data.entries.some((e: { details: string }) =>
        /only active/.test(e.details),
      ),
    ).toBe(false)
  })

  it('fills the lists with the defaults on a new database only, never again once there are users', async () => {
    const fresh = createDb(':memory:')
    runMigrations(fresh.db)
    ensureDefaultLists(fresh.db)
    expect(
      fresh.db
        .select()
        .from(assetTypes)
        .all()
        .map((row) => row.name),
    ).toEqual(DEFAULT_TYPES)
    expect(fresh.db.select().from(conditionRatings).all()).toHaveLength(DEFAULT_RATINGS.length)

    // A list emptied in a database that is in use stays as its admins left it at the next start.
    const t = await setup()
    t.db.delete(assetTypes).run()
    ensureDefaultLists(t.db)
    expect(t.db.select().from(assetTypes).all()).toEqual([])
  })

  it('gives each rating a score that sets the order, and lets no two share one', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const scale = async () =>
      (await t.call('GET', '/api/condition-ratings', { cookie })).data.map((r: { name: string; score: number }) => [
        r.name,
        r.score,
      ])
    expect(await scale()).toEqual([
      ['New', 100],
      ['Good', 80],
      ['Fair', 60],
      ['Poor', 30],
      ['Damaged', 10],
    ])
    expect(
      (await t.call('GET', '/api/lookups', { cookie })).data.conditionRatings.map((r: { score: number }) => r.score),
    ).toEqual([100, 80, 60, 30, 10])

    // A new rating needs a whole score from 1 to 100 that nothing else has.
    const add = (body: Record<string, unknown>) => t.call('POST', '/api/condition-ratings', { cookie, body })
    const fields = (res: { data: any }) => res.data.details.fields
    expect(fields(await add({ name: 'Worn' }))).toEqual({ score: 'Give the rating a score from 1 to 100.' })
    for (const score of [0, 101, 45.5])
      expect(fields(await add({ name: 'Worn', score })), String(score)).toEqual({
        score: 'The score must be a whole number from 1 to 100.',
      })
    const taken = await add({ name: 'Worn', score: 60 })
    expect(taken.status).toBe(409)
    expect(taken.data.error).toBe('duplicate_score')
    expect(fields(taken)).toEqual({ score: '"Fair" already has the score 60. Choose another.' })
    const worn = await add({ name: 'Worn', score: 45 })
    expect(worn.status).toBe(201)
    expect(worn.data).toMatchObject({ name: 'Worn', score: 45, isActive: true })
    expect((await scale()).map(([name]: [string]) => name)).toEqual(['New', 'Good', 'Fair', 'Worn', 'Poor', 'Damaged'])

    // Changing a score moves the rating, is refused when taken (also by a deactivated rating), and is audited.
    const damaged = (await t.call('GET', '/api/condition-ratings', { cookie })).data.find(
      (r: { name: string }) => r.name === 'Damaged',
    )
    await t.call('PATCH', `/api/condition-ratings/${damaged.id}`, { cookie, body: { isActive: false } })
    const clash = await t.call('PATCH', `/api/condition-ratings/${worn.data.id}`, { cookie, body: { score: 10 } })
    expect(clash.data.error).toBe('duplicate_score')
    expect(
      (await t.call('PATCH', `/api/condition-ratings/${worn.data.id}`, { cookie, body: { score: 45 } })).status,
    ).toBe(200)
    const moved = await t.call('PATCH', `/api/condition-ratings/${worn.data.id}`, { cookie, body: { score: 90 } })
    expect(moved.data.score).toBe(90)
    expect((await scale()).map(([name]: [string]) => name)).toEqual(['New', 'Worn', 'Good', 'Fair', 'Poor', 'Damaged'])
    expect(
      (await t.call('GET', '/api/lookups', { cookie })).data.conditionRatings.map((r: { name: string }) => r.name),
    ).toEqual(['New', 'Worn', 'Good', 'Fair', 'Poor'])
    const audit = (await t.call('GET', '/api/audit', { cookie: await t.asSuper() })).data.entries.map(
      (e: { details: string }) => e.details,
    )
    expect(audit).toContain('Worn · score: 45 → 90')
    expect(audit).toContain('Worn · score 45')

    // The old reorder endpoint is gone.
    expect((await t.call('PUT', '/api/condition-ratings/order', { cookie, body: { ids: [1] } })).status).toBe(404)
  })

  it('goes by the score, not the name, for the condition watch and the default rating', async () => {
    const { t, cookie, make } = await seed()
    const ratings = (await t.call('GET', '/api/condition-ratings', { cookie })).data as { id: number; name: string }[]
    const id = (name: string) => ratings.find((r) => r.name === name)!.id
    for (const [tag, rating] of [
      ['W-1', 'New'],
      ['W-2', 'Good'],
      ['W-3', 'Fair'],
      ['W-4', 'Poor'],
      ['W-5', 'Damaged'],
    ] as const)
      await make(tag, { conditionRatingId: id(rating) })
    const watch = async () =>
      (await t.call('GET', '/api/dashboard', { cookie })).data.poorCondition
        .map((r: { assetTag: string; rating: string }) => `${r.assetTag} ${r.rating}`)
        .sort()
    expect(await watch()).toEqual(['W-4 Poor', 'W-5 Damaged'])

    // Renamed: still watched. (This emptied the panel when it went by the names "poor" and "damaged".)
    await t.call('PATCH', `/api/condition-ratings/${id('Poor')}`, { cookie, body: { name: 'Worn out' } })
    await t.call('PATCH', `/api/condition-ratings/${id('Damaged')}`, { cookie, body: { name: 'Broken' } })
    expect(await watch()).toEqual(['W-4 Worn out', 'W-5 Broken'])

    // The line is the score: 50 is off the watch, 49 is on it, whatever the rating is called.
    await t.call('PATCH', `/api/condition-ratings/${id('Poor')}`, { cookie, body: { score: 50 } })
    expect(await watch()).toEqual(['W-5 Broken'])
    await t.call('PATCH', `/api/condition-ratings/${id('Fair')}`, { cookie, body: { score: 49 } })
    expect(await watch()).toEqual(['W-3 Fair', 'W-5 Broken'])

    // A pasted row with no condition gets the rating closest to 80, even after "Good" is renamed.
    await t.call('PATCH', `/api/condition-ratings/${id('Good')}`, { cookie, body: { name: 'Fine' } })
    const pasted = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: { rows: [{ tag: 'W-6', type: 'Laptop', brand: 'Dell' }] },
    })
    expect(pasted.data).toMatchObject({ created: 1, errors: [] })
    expect((await t.call('GET', '/api/assets/tag/W-6', { cookie })).data.asset.condition.rating).toBe('Fine')
  })
})

describe('assets a program holds', () => {
  it('assigns an asset to a program like issuing it to a person, and returns it the same way', async () => {
    const { t, cookie, good, fair, make, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    const asset = (await make('BPHS-0141')).data

    const issued = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, programId: outreach.id, conditionRatingId: good.id },
    })
    expect(issued.status).toBe(201)
    expect(issued.data).toMatchObject({
      assetTag: 'BPHS-0141',
      employee: null,
      program: { id: outreach.id, code: 'P-100', name: 'Outreach North' },
      issueRating: 'Good',
    })

    // It has left storage and shows among the open assignments, with the program as its holder.
    const row = (await t.call('GET', '/api/assets', { cookie })).data[0]
    expect(row).toMatchObject({
      state: 'assigned',
      holder: null,
      program: { code: 'P-100' },
      assignmentId: issued.data.id,
    })
    expect((await t.call('GET', '/api/assignments', { cookie })).data).toHaveLength(1)
    expect((await t.call('GET', '/api/programs', { cookie })).data[0]).toMatchObject({
      assetsHeld: 1,
      hasHistory: true,
    })

    // To move it to a person it is returned first.
    const toPerson = await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    expect(toPerson.status).toBe(409)
    expect(toPerson.data).toMatchObject({
      error: 'asset_already_assigned',
      message: 'BPHS-0141 is already assigned to Outreach North.',
    })
    expect((await t.call('POST', `/api/assets/${asset.id}/retire`, { cookie })).data.message).toBe(
      'BPHS-0141 is assigned to Outreach North. Return it before retiring.',
    )

    expect(
      (
        await t.call('POST', `/api/assignments/${issued.data.id}/return`, {
          cookie,
          body: { conditionRatingId: fair.id },
        })
      ).status,
    ).toBe(204)
    const detail = (await t.call('GET', '/api/assets/tag/BPHS-0141', { cookie })).data
    expect(detail.asset).toMatchObject({ state: 'in_storage', holder: null, program: null })
    expect(detail.history).toEqual([
      expect.objectContaining({
        employee: null,
        program: { id: outreach.id, code: 'P-100', name: 'Outreach North' },
        issueRating: 'Good',
        returnRating: 'Fair',
      }),
    ])
    expect(detail.conditions.map((c: { kind: string }) => c.kind)).toEqual(['return', 'issue', 'intake'])
    expect(
      (
        await t.call('POST', '/api/assignments', {
          cookie,
          body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
        })
      ).status,
    ).toBe(201)

    const audit = (await t.call('GET', '/api/audit?q=BPHS-0141', { cookie })).data.entries.map(
      (e: { action: string; details: string }) => [e.action, e.details],
    )
    expect(audit.slice(1)).toEqual([
      ['return', 'BPHS-0141 ← program P-100 · Fair'],
      ['issue', 'BPHS-0141 → program P-100 · Good'],
      ['create', 'BPHS-0141 · Laptop · Dell'],
    ])
  })

  it('wants exactly one holder: an employee or a program, not both and not neither', async () => {
    const { t, cookie, good, make, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    const asset = (await make('BPHS-0141')).data
    const issue = (body: Record<string, unknown>) =>
      t.call('POST', '/api/assignments', { cookie, body: { assetId: asset.id, conditionRatingId: good.id, ...body } })

    const both = await issue({ employeeId: t.person.id, programId: outreach.id })
    expect(both.status).toBe(422)
    expect(both.data.details.fields).toEqual({ programId: 'Choose an employee or a program, not both' })
    const neither = await issue({})
    expect(neither.status).toBe(422)
    expect(neither.data.details.fields).toEqual({ employeeId: 'Choose an employee or a program' })
    expect((await issue({ employeeId: null, programId: null })).status).toBe(422)
    expect((await issue({ programId: 9999 })).status).toBe(404)
    expect((await t.call('GET', '/api/assignments', { cookie })).data).toEqual([])

    // A new asset may start with one holder or none.
    const twoHolders = await make('BPHS-0142', { holderId: t.person.id, programId: outreach.id })
    expect(twoHolders.status).toBe(422)
    expect(twoHolders.data.details.fields).toEqual({ programId: 'Choose an employee or a program, not both' })
    const started = await make('BPHS-0143', { programId: outreach.id })
    expect(started.status).toBe(201)
    expect(started.data).toMatchObject({ state: 'assigned', holder: null, program: { code: 'P-100' } })

    // The database refuses both shapes itself, whatever the app let through.
    const insert = t.sqlite.prepare(
      "insert into assignments (kind, item_id, employee_id, program_id, issued_at, issued_by_id) values ('asset', ?, ?, ?, ?, ?)",
    )
    expect(() => insert.run(asset.id, t.person.id, outreach.id, Date.now(), t.superUser.id)).toThrow(/CHECK/)
    expect(() => insert.run(asset.id, null, null, Date.now(), t.superUser.id)).toThrow(/CHECK/)
    expect(() =>
      t.sqlite.prepare('update assignments set employee_id = ? where program_id is not null').run(t.person.id),
    ).toThrow(/CHECK/)
  })

  it('counts an asset a program holds as assigned on the dashboard, and keeps top holders to people', async () => {
    const { t, cookie, make, program } = await seed()
    const outreach = await program('P-100', 'Outreach North')
    await make('D-1', { programId: outreach.id })
    await make('D-2', { holderId: t.person.id })
    await make('D-3')
    const { data } = await t.call('GET', '/api/dashboard', { cookie })
    expect(data.totals).toEqual({ total: 3, assigned: 2, inStorage: 1, retired: 0 })
    expect(data.byType[0]).toMatchObject({ total: 3, free: 1 })
    expect(data.topHolders).toEqual([{ employee: expect.objectContaining({ id: t.person.id }), count: 1 }])
    expect(
      data.longestOut.map((row: { assetTag: string; employee: unknown; program: { name: string } | null }) => [
        row.assetTag,
        row.employee === null,
        row.program?.name ?? null,
      ]),
    ).toEqual([
      ['D-1', true, 'Outreach North'],
      ['D-2', false, null],
    ])
  })
})
