import { describe, expect, it } from 'vitest'
import { assets } from '../db/schema.ts'
import { migratedBefore, setup } from './helpers.ts'

const GUID = '4f8c2a1e-9b3d-4c7a-8e21-5d6f0a9b3c47'

async function seed() {
  const t = await setup()
  const cookie = await t.asSuper()
  const { assetTypes, assetBrands, conditionRatings } = await t.lookups(cookie)
  const laptop = assetTypes.find((x) => x.name === 'Laptop')!
  const dell = assetBrands.find((x) => x.name === 'Dell')!
  const lenovo = assetBrands.find((x) => x.name === 'Lenovo')!
  const good = conditionRatings.find((x) => x.name === 'Good')!
  const unknown = t.sqlite.prepare("select id from asset_brands where name = 'Unknown'").get() as { id: number }
  const make = (tag: string, extra: Record<string, unknown> = {}) =>
    t.call('POST', '/api/assets', {
      cookie,
      body: { tag, typeId: laptop.id, brandId: dell.id, conditionRatingId: good.id, ...extra },
    })
  const fields = (res: { data: any }) => res.data.details.fields
  const audit = async (entityType: string) =>
    (
      (await t.call('GET', '/api/audit', { cookie })).data.entries as {
        entityType: string
        action: string
        details: string
      }[]
    )
      .filter((e) => e.entityType === entityType)
      .map((e) => [e.action, e.details])
  return { t, cookie, laptop, dell, lenovo, good, unknown, make, fields, audit }
}

describe('asset brand, model and Entra ObjectId', () => {
  it('needs an active brand, and keeps the model and Entra ObjectId on the row', async () => {
    const { t, cookie, laptop, good, unknown, make, fields } = await seed()
    const missing = await t.call('POST', '/api/assets', {
      cookie,
      body: { tag: 'BF-1', typeId: laptop.id, conditionRatingId: good.id },
    })
    expect(missing.status).toBe(422)
    expect(Object.keys(fields(missing))).toEqual(['brandId'])

    // "Unknown" is archived: it stays on older assets, but nothing new can pick it.
    const archived = await make('BF-1', { brandId: unknown.id })
    expect(archived.status).toBe(422)
    expect(fields(archived)).toEqual({ brandId: 'Choose an active brand.' })
    expect(fields(await make('BF-1', { brandId: 9999 }))).toEqual({ brandId: 'Choose an active brand.' })

    const made = await make('BF-1', { model: ' Latitude 5440 ', entraObjectId: GUID.toUpperCase() })
    expect(made.status).toBe(201)
    expect(made.data).toMatchObject({
      brand: 'Dell',
      brandActive: true,
      model: 'Latitude 5440',
      entraObjectId: GUID,
    })
    const bare = await make('BF-2', { model: '', entraObjectId: '' })
    expect(bare.data).toMatchObject({ model: null, entraObjectId: null })
  })

  it('takes an Entra ObjectId only as a GUID, stores it lowercase, and only once across assets', async () => {
    const { make, fields } = await seed()
    for (const bad of ['not-a-guid', GUID.slice(0, -1), `{${GUID}}`, GUID.replaceAll('-', '')]) {
      const refused = await make('BF-3', { entraObjectId: bad })
      expect(refused.status).toBe(422)
      expect(fields(refused)).toEqual({
        entraObjectId: 'Enter the Entra ObjectId as a GUID, like 4f8c2a1e-9b3d-4c7a-8e21-5d6f0a9b3c47',
      })
    }
    expect((await make('BF-3', { entraObjectId: `  ${GUID}  ` })).data.entraObjectId).toBe(GUID)

    // The same ID in capitals is the same ID.
    const dup = await make('BF-4', { entraObjectId: GUID.toUpperCase() })
    expect(dup.status).toBe(409)
    expect(fields(dup)).toEqual({ entraObjectId: `Entra ObjectId ${GUID} is already on BF-3.` })

    // Leaving it empty is not a value, so any number of assets can go without one.
    expect((await make('BF-5')).status).toBe(201)
    expect((await make('BF-6')).status).toBe(201)
  })

  it('holds the database to one asset per Entra ObjectId, whatever writes to it', async () => {
    const { t, laptop, dell } = await seed()
    const row = { typeId: laptop.id, brandId: dell.id, entraObjectId: GUID }
    t.db
      .insert(assets)
      .values({ tag: 'DB-1', ...row })
      .run()
    expect(() =>
      t.db
        .insert(assets)
        .values({ tag: 'DB-2', ...row })
        .run(),
    ).toThrow(/UNIQUE/)
  })

  it('edits the fields, refuses an archived brand, and audits every change', async () => {
    const { t, cookie, laptop, dell, lenovo, unknown, make, fields, audit } = await seed()
    const first = (await make('BF-10', { model: 'Latitude 5440', entraObjectId: GUID })).data
    const other = (await make('BF-11')).data
    const patch = (id: number, body: Record<string, unknown>) => t.call('PATCH', `/api/assets/${id}`, { cookie, body })

    const taken = await patch(other.id, { entraObjectId: GUID })
    expect(taken.status).toBe(409)
    expect(fields(taken)).toEqual({ entraObjectId: `Entra ObjectId ${GUID} is already on BF-10.` })
    expect(fields(await patch(other.id, { brandId: unknown.id }))).toEqual({ brandId: 'Choose an active brand.' })

    const second = '0b6c1f2e-3d4a-4b5c-9d6e-7f8091a2b3c4'
    const edited = await patch(first.id, {
      tag: 'BF-10',
      typeId: laptop.id,
      brandId: lenovo.id,
      model: 'ThinkPad T14',
      entraObjectId: second,
      serial: '',
    })
    expect(edited.status).toBe(200)
    expect(edited.data).toMatchObject({ brand: 'Lenovo', model: 'ThinkPad T14', entraObjectId: second })
    // Its old ID is free again.
    expect((await patch(other.id, { entraObjectId: GUID })).status).toBe(200)
    expect((await patch(other.id, { brandId: dell.id, model: 'Latitude 7440' })).data.model).toBe('Latitude 7440')

    expect(await audit('asset')).toEqual(
      expect.arrayContaining([
        ['create', `BF-10 · Laptop · Dell Latitude 5440 · Entra ObjectId ${GUID}`],
        ['create', 'BF-11 · Laptop · Dell'],
        [
          'update',
          `BF-10 · brand: Dell → Lenovo; model: Latitude 5440 → ThinkPad T14; Entra ObjectId: ${GUID} → ${second}`,
        ],
        ['update', `BF-11 · Entra ObjectId: — → ${GUID}`],
        ['update', 'BF-11 · model: — → Latitude 7440'],
      ]),
    )
  })

  it('makes an asset on an archived brand pick an active one when it is edited, but leaves it alone otherwise', async () => {
    const { t, cookie, laptop, dell, unknown, fields } = await seed()
    const old = t.db.insert(assets).values({ tag: 'OLD-1', typeId: laptop.id, brandId: unknown.id }).returning().get()
    const row = (await t.call('GET', '/api/assets/tag/OLD-1', { cookie })).data.asset
    expect(row).toMatchObject({ brand: 'Unknown', brandActive: false, model: null, entraObjectId: null })

    // An edit that does not touch the brand keeps it.
    expect((await t.call('PATCH', `/api/assets/${old.id}`, { cookie, body: { serial: 'SN-1' } })).data.brand).toBe(
      'Unknown',
    )
    const kept = await t.call('PATCH', `/api/assets/${old.id}`, { cookie, body: { brandId: unknown.id } })
    expect(fields(kept)).toEqual({ brandId: 'Choose an active brand.' })
    const moved = await t.call('PATCH', `/api/assets/${old.id}`, { cookie, body: { brandId: dell.id } })
    expect(moved.data).toMatchObject({ brand: 'Dell', brandActive: true })
  })

  it('carries brand and model onto assignments and the dashboard', async () => {
    const { t, cookie, good, make } = await seed()
    const asset = (await make('BF-20', { model: 'Latitude 5440', entraObjectId: GUID })).data
    await t.call('POST', '/api/assignments', {
      cookie,
      body: { assetId: asset.id, employeeId: t.person.id, conditionRatingId: good.id },
    })
    const open = (await t.call('GET', '/api/assignments', { cookie })).data
    expect(open[0]).toMatchObject({ assetBrand: 'Dell', assetModel: 'Latitude 5440', assetEntraObjectId: GUID })
    const dashboard = (await t.call('GET', '/api/dashboard', { cookie })).data
    expect(dashboard.longestOut[0]).toMatchObject({
      assetTag: 'BF-20',
      assetBrand: 'Dell',
      assetModel: 'Latitude 5440',
    })
  })
})

describe('bulk paste with brands', () => {
  it('matches the brand by name among active brands and reports a bad row by number', async () => {
    const { t, cookie } = await seed()
    const res = await t.call('POST', '/api/assets/bulk', {
      cookie,
      body: {
        rows: [
          { tag: 'BP-1', type: 'Laptop', brand: 'lenovo', model: 'ThinkPad E14', entraObjectId: GUID.toUpperCase() },
          { tag: 'BP-2', type: 'Laptop', brand: '' },
          { tag: 'BP-3', type: 'Laptop', brand: 'Unknown' },
          { tag: 'BP-4', type: 'Laptop', brand: 'Acme' },
          { tag: 'BP-5', type: 'Laptop', brand: 'Dell', entraObjectId: 'nope' },
          { tag: 'BP-6', type: 'Laptop', brand: 'Dell', entraObjectId: GUID },
          { tag: 'BP-7', type: 'Phone', brand: 'Apple' },
        ],
      },
    })
    expect(res.data).toEqual({
      created: 2,
      errors: [
        { row: 2, message: 'Missing brand.' },
        { row: 3, message: 'No active brand named "Unknown".' },
        { row: 4, message: 'No active brand named "Acme".' },
        {
          row: 5,
          message: 'Entra ObjectId: Enter the Entra ObjectId as a GUID, like 4f8c2a1e-9b3d-4c7a-8e21-5d6f0a9b3c47.',
        },
        { row: 6, message: `Entra ObjectId ${GUID} is already on BP-1.` },
      ],
    })
    const bp1 = (await t.call('GET', '/api/assets/tag/BP-1', { cookie })).data.asset
    expect(bp1).toMatchObject({ brand: 'Lenovo', model: 'ThinkPad E14', entraObjectId: GUID })
    expect((await t.call('GET', '/api/assets/tag/BP-7', { cookie })).data.asset).toMatchObject({
      brand: 'Apple',
      model: null,
      entraObjectId: null,
    })
  })
})

describe('brands on the Lists page', () => {
  it('offers the default brands, not the archived Unknown', async () => {
    const { t, cookie } = await seed()
    const offered = (await t.lookups(cookie)).assetBrands.map((b) => b.name)
    expect(offered).toEqual(['Apple', 'Dell', 'HP', 'Lenovo', 'Logitech', 'Microsoft', 'Samsung'])
    const listed = (await t.call('GET', '/api/asset-brands', { cookie })).data as { name: string; isActive: boolean }[]
    expect(listed.at(-1)).toMatchObject({ name: 'Unknown', isActive: false })
  })

  it('adds, renames and archives a brand, refuses duplicates, and audits each change', async () => {
    const { t, cookie, audit } = await seed()
    const made = await t.call('POST', '/api/asset-brands', { cookie, body: { name: 'Acer' } })
    expect(made.status).toBe(201)
    expect(made.data).toMatchObject({ name: 'Acer', isActive: true, assetCount: 0 })
    const dup = await t.call('POST', '/api/asset-brands', { cookie, body: { name: 'dell' } })
    expect(dup.status).toBe(409)
    expect(dup.data.details.fields).toEqual({ name: 'A brand named "dell" already exists.' })

    const id = made.data.id
    await t.call('PATCH', `/api/asset-brands/${id}`, { cookie, body: { name: 'Acer Inc' } })
    const archived = await t.call('PATCH', `/api/asset-brands/${id}`, { cookie, body: { isActive: false } })
    expect(archived.data.isActive).toBe(false)
    expect((await t.lookups(cookie)).assetBrands.map((b) => b.name)).not.toContain('Acer Inc')
    expect((await t.call('DELETE', `/api/asset-brands/${id}`, { cookie })).status).toBe(204)
    expect(await audit('assetbrand')).toEqual([
      ['delete', 'unused brand "Acer Inc"'],
      ['update', 'Acer Inc · active: true → false'],
      ['update', 'Acer Inc · name: Acer → Acer Inc'],
      ['create', 'Acer'],
    ])
  })

  it('will not delete a brand in use, nor archive or delete the last active one', async () => {
    const { t, cookie, dell, make } = await seed()
    await make('BR-1')
    const inUse = await t.call('DELETE', `/api/asset-brands/${dell.id}`, { cookie })
    expect(inUse.status).toBe(409)
    expect(inUse.data.message).toBe('1 asset(s) use "Dell". Deactivate it instead.')
    // Archiving a brand in use is fine: its assets keep it.
    expect((await t.call('PATCH', `/api/asset-brands/${dell.id}`, { cookie, body: { isActive: false } })).status).toBe(
      200,
    )
    expect((await t.call('GET', '/api/assets/tag/BR-1', { cookie })).data.asset).toMatchObject({
      brand: 'Dell',
      brandActive: false,
    })

    const brands = (await t.call('GET', '/api/asset-brands', { cookie })).data as { id: number; isActive: boolean }[]
    const active = brands.filter((b) => b.isActive)
    for (const brand of active.slice(1))
      expect((await t.call('DELETE', `/api/asset-brands/${brand.id}`, { cookie })).status).toBe(204)
    const last = active[0]!.id
    expect((await t.call('PATCH', `/api/asset-brands/${last}`, { cookie, body: { isActive: false } })).data.error).toBe(
      'last_active',
    )
    expect((await t.call('DELETE', `/api/asset-brands/${last}`, { cookie })).data.error).toBe('last_active')
  })
})

describe('migration 0023', () => {
  it('backfills an archived Unknown brand onto every asset and loses nothing around it', () => {
    const { sqlite, next } = migratedBefore('0023_', { foreignKeys: true })
    sqlite.exec(`
      insert into employees (id, code, first_name, last_name) values (1, 'E-1', 'Sam', 'First');
      insert into programs (id, code, name) values (1, 'PRG-1', 'Harbour House');
      insert into users (id, name, email, password_hash) values (1, 'Admin', 'admin@x.example', 'x');
      insert into asset_types (id, name) values (1, 'Laptop'), (2, 'Phone');
      insert into condition_ratings (id, name, score) values (1, 'Good', 80);
      insert into assets (id, tag, type_id, serial, status, created_at) values
        (1, 'A-1', 1, 'SN-1', 'in_service', 100), (4, 'A-4', 2, null, 'retired', 200), (7, 'A-7', 1, 'SN-7', 'in_service', 300);
      insert into assignments (id, asset_id, employee_id, program_id, issued_at, returned_at, issued_by_id, returned_by_id) values
        (2, 1, 1, null, 1000, 2000, 1, 1), (5, 1, null, 1, 3000, null, 1, null), (6, 7, 1, null, 4000, null, 1, null);
      insert into conditions (id, asset_id, assignment_id, kind, rating_id, assessed_by_id, notes, recorded_by_id, recorded_at) values
        (1, 1, null, 'intake', 1, null, null, 1, 100), (3, 1, 2, 'issue', 1, 1, 'Fine', 1, 1000), (9, 7, 6, 'issue', 1, null, null, 1, 4000);
      -- Rows were deleted since: each counter is ahead of the highest id left.
      update sqlite_sequence set seq = 10 where name = 'assets';
      update sqlite_sequence set seq = 8 where name = 'assignments';
      update sqlite_sequence set seq = 12 where name = 'conditions';`)
    const before = {
      assets: sqlite.prepare('select id, tag, type_id, serial, status, created_at from assets order by id').all(),
      assignments: sqlite.prepare('select * from assignments order by id').all(),
      conditions: sqlite.prepare('select * from conditions order by id').all(),
      sequence: sqlite.prepare('select name, seq from sqlite_sequence order by name').all(),
    }

    // The migrator runs a migration inside one transaction with foreign keys on, so the test does too.
    sqlite.exec('begin')
    next()
    sqlite.exec('commit')

    expect(sqlite.prepare('select id, tag, type_id, serial, status, created_at from assets order by id').all()).toEqual(
      before.assets,
    )
    expect(sqlite.prepare('select * from assignments order by id').all()).toEqual(before.assignments)
    expect(sqlite.prepare('select * from conditions order by id').all()).toEqual(before.conditions)
    const sequence = sqlite
      .prepare("select name, seq from sqlite_sequence where name <> 'asset_brands' order by name")
      .all()
    expect(sequence).toEqual(before.sequence)
    expect(sqlite.prepare('select name, is_active from asset_brands').all()).toEqual([
      { name: 'Unknown', is_active: 0 },
    ])
    expect(
      sqlite
        .prepare(
          "select count(*) as n from assets a join asset_brands b on b.id = a.brand_id where b.name = 'Unknown' and a.model is null and a.entra_object_id is null",
        )
        .get(),
    ).toEqual({ n: 3 })
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    // The rebuilt tables keep their rules: one open assignment per asset, and a brand in use cannot be deleted.
    expect(() =>
      sqlite.exec('insert into assignments (asset_id, employee_id, issued_at, issued_by_id) values (1, 1, 5000, 1)'),
    ).toThrow(/UNIQUE/)
    expect(() => sqlite.exec("delete from asset_brands where name = 'Unknown'")).toThrow(/FOREIGN KEY/)
    expect(() => sqlite.exec('delete from assets where id = 7')).toThrow(/FOREIGN KEY/)
  })
})
