// The digital assets API: Asset IDs, the License/Account checks, issuing and unassigning, and the types list.
import { describe, expect, it } from 'vitest'
import { setup } from '#kernel/testing/index.ts'

describe('digital assets and digital asset types', () => {
  /** Unassign the way the page does: naming the assignment the seat has right now (or one that cannot exist, when it has none). */
  async function unassign(t: Awaited<ReturnType<typeof setup>>, id: number, cookie: string) {
    const { asset } = (await t.call('GET', `/api/digital-assets/${id}`, { cookie })).data as {
      asset: { assignmentId: number | null }
    }
    return t.call('POST', `/api/digital-assets/${id}/unassign`, {
      cookie,
      body: { assignmentId: asset.assignmentId ?? 999_999 },
    })
  }

  it('refuses an unassign that was confirmed against an earlier holder', async () => {
    const t = await setup()
    const cookie = await t.asSuper()
    const typeId = ((await t.call('GET', '/api/lookups', { cookie })).data.digitalAssetTypes as { id: number }[])[0]!.id
    const person = async (code: string, firstName: string, lastName: string) =>
      (await t.call('POST', '/api/employees', { cookie, body: { code, firstName, lastName } })).data as { id: number }
    const marcus = await person('E-9001', 'Marcus', 'Stale')
    const priya = await person('E-9002', 'Priya', 'Newer')
    const seat = (
      await t.call('POST', '/api/digital-assets', {
        cookie,
        body: { typeId, account: 'stale.tab@bphs.org', employeeId: marcus.id },
      })
    ).data
    const path = `/api/digital-assets/${seat.id}`

    // Tab A opens the confirmation for Marcus. Tab B unassigns him and issues the seat to Priya.
    const stale = { assignmentId: seat.assignmentId as number }
    expect((await t.call('POST', `${path}/unassign`, { cookie, body: stale })).status).toBe(200)
    const reissued = (await t.call('POST', `${path}/issue`, { cookie, body: { employeeId: priya.id } })).data

    // Tab A confirms: Priya keeps the seat.
    const late = await t.call('POST', `${path}/unassign`, { cookie, body: stale })
    expect(late.status).toBe(409)
    expect(late.data).toMatchObject({
      error: 'assignment_changed',
      message: `${seat.code} is now issued to Priya Newer. Nothing was unassigned.`,
    })
    expect((await t.call('GET', path, { cookie })).data.asset).toMatchObject({
      state: 'active',
      assignmentId: reissued.assignmentId,
      employee: { id: priya.id },
    })

    // The seat alone is not enough to say whose assignment ends.
    expect((await t.call('POST', `${path}/unassign`, { cookie })).status).toBeGreaterThanOrEqual(400)
    expect((await t.call('GET', path, { cookie })).data.asset.employee).toMatchObject({ id: priya.id })
  })

  async function seed() {
    const t = await setup()
    const cookie = await t.asSuper()
    const admin = await t.asAdmin()
    const types = (await t.call('GET', '/api/lookups', { cookie })).data.digitalAssetTypes as {
      id: number
      name: string
    }[]
    const m365 = types.find((x) => x.name === 'M365-BusinessStandard')!
    const zoho = types.find((x) => x.name === 'Zoho')!
    const make = async (account: string, extra: Record<string, unknown> = {}) =>
      await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: m365.id, account, ...extra } })
    const employee = async (code: string, firstName: string, lastName: string) =>
      (await t.call('POST', '/api/employees', { cookie, body: { code, firstName, lastName } })).data as {
        id: number
        name: string
      }
    const audit = async () =>
      (await t.call('GET', '/api/audit?limit=100', { cookie })).data.entries as {
        action: string
        entityType: string
        details: string
      }[]
    return { t, cookie, admin, types, m365, zoho, make, employee, audit }
  }

  it('gives each one the next Asset ID, which is never typed, never edited and never reused', async () => {
    const { t, cookie, make, m365 } = await seed()
    const first = await make(' p.raghunathan@bphs.org ')
    expect(first.status).toBe(201)
    expect(first.data).toMatchObject({
      code: 'DA-00001',
      type: 'M365-BusinessStandard',
      account: 'p.raghunathan@bphs.org',
      status: 'in_service',
      state: 'not_issued',
      employee: null,
      issuedAt: null,
      hasHistory: false,
    })
    expect((await make('m.oyelaran@bphs.org')).data.code).toBe('DA-00002')

    // A code sent with the request is not what it gets, and an edit cannot change it.
    const typed = await t.call('POST', '/api/digital-assets', {
      cookie,
      body: { typeId: m365.id, account: 'seat 3', code: 'DA-99999' },
    })
    expect(typed.data.code).toBe('DA-00003')
    expect(
      (
        await t.call('PATCH', `/api/digital-assets/${typed.data.id}`, {
          cookie,
          body: { code: 'DA-00001', account: 'seat three' },
        })
      ).data,
    ).toMatchObject({ code: 'DA-00003', account: 'seat three' })

    // Deleting the newest does not free its number.
    expect((await t.call('DELETE', `/api/digital-assets/${typed.data.id}`, { cookie })).status).toBe(204)
    expect((await make('seat 4')).data.code).toBe('DA-00004')
    expect((await t.call('GET', '/api/digital-assets', { cookie })).data.map((d: { code: string }) => d.code)).toEqual([
      'DA-00001',
      'DA-00002',
      'DA-00004',
    ])
  })

  it('checks the type and the License/Account, and refuses a value that labels itself as a credential', async () => {
    const { t, cookie, make, m365, zoho } = await seed()
    const secret = await make('j.doe@bphs.org password: hunter2')
    expect(secret.status).toBe(422)
    expect(secret.data.details.fields).toEqual({
      account: 'Enter the email address or license reference only, never a password or key.',
    })
    expect((await make('')).data.details.fields).toEqual({ account: 'Required' })
    expect((await make('x'.repeat(201))).data.details.fields).toEqual({
      account: 'License/Account can be at most 200 characters',
    })
    expect((await t.call('GET', '/api/digital-assets', { cookie })).data).toEqual([])

    await t.call('PATCH', `/api/digital-asset-types/${zoho.id}`, { cookie, body: { isActive: false } })
    const inactiveType = await t.call('POST', '/api/digital-assets', {
      cookie,
      body: { typeId: zoho.id, account: 'seat' },
    })
    expect(inactiveType.status).toBe(422)
    expect(inactiveType.data.details.fields).toEqual({ typeId: 'Choose an active digital asset type.' })
    expect(
      (await t.call('POST', '/api/digital-assets', { cookie, body: { typeId: 9999, account: 'seat' } })).status,
    ).toBe(422)

    const seat = (await make('seat 1')).data
    const edited = await t.call('PATCH', `/api/digital-assets/${seat.id}`, {
      cookie,
      body: { account: 'token=abc123' },
    })
    expect(edited.status).toBe(422)
    expect(
      (await t.call('PATCH', `/api/digital-assets/${seat.id}`, { cookie, body: { typeId: zoho.id } })).status,
    ).toBe(422)
    expect(
      (
        await t.call('PATCH', `/api/digital-assets/${seat.id}`, {
          cookie,
          body: { typeId: m365.id, account: 'seat 1' },
        })
      ).data.account,
    ).toBe('seat 1')
    expect((await t.call('PATCH', '/api/digital-assets/9999', { cookie, body: { account: 'x' } })).status).toBe(404)
    expect((await t.call('GET', '/api/digital-assets/9999', { cookie })).status).toBe(404)
  })

  it('reads the status from the assignment: Active while issued, Not Issued when free', async () => {
    const { t, cookie, make, employee, audit } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const seat = (await make('ana.lima@bphs.org', { employeeId: ana.id })).data
    expect(seat).toMatchObject({
      state: 'active',
      status: 'in_service',
      employee: { id: ana.id, code: 'E-2001', name: 'Ana Lima' },
      hasHistory: true,
    })
    expect(Date.now() - new Date(seat.issuedAt).getTime()).toBeLessThan(5000)

    const free = (await make('spare@bphs.org')).data
    expect(free.state).toBe('not_issued')
    const issued = await t.call('POST', `/api/digital-assets/${free.id}/issue`, {
      cookie,
      body: { employeeId: ana.id },
    })
    expect(issued.status).toBe(200)
    expect(issued.data).toMatchObject({ state: 'active', employee: { id: ana.id } })

    // One seat, one person: issuing it again is refused, by the service and by the database.
    const again = await t.call('POST', `/api/digital-assets/${free.id}/issue`, {
      cookie,
      body: { employeeId: t.person.id },
    })
    expect(again.status).toBe(409)
    expect(again.data).toMatchObject({
      error: 'asset_already_assigned',
      message: 'DA-00002 is already issued to Ana Lima. Unassign it first.',
    })
    expect(() =>
      t.sqlite
        .prepare(
          "insert into assignments (kind, item_id, employee_id, issued_at, issued_by_id) values ('digital-asset', ?, ?, 1, ?)",
        )
        .run(free.id, t.person.id, t.superUser.id),
    ).toThrow(/UNIQUE/)

    const unassigned = await unassign(t, free.id, cookie)
    expect(unassigned.data).toMatchObject({ state: 'not_issued', employee: null, issuedAt: null, hasHistory: true })
    expect((await unassign(t, free.id, cookie)).data).toMatchObject({
      error: 'not_assigned',
      message: 'DA-00002 is not issued to anyone.',
    })

    const log = await audit()
    expect(log.filter((e) => e.entityType === 'digitalasset').map((e) => `${e.action} ${e.details}`)).toEqual([
      'return DA-00002 ← E-2001 · M365-BusinessStandard',
      'issue DA-00002 → E-2001 · M365-BusinessStandard',
      'create DA-00002 · M365-BusinessStandard · spare@bphs.org',
      'issue DA-00001 → E-2001 · M365-BusinessStandard',
      'create DA-00001 · M365-BusinessStandard · ana.lima@bphs.org',
    ])
  })

  it('marks one inactive only while nobody has it, and will not issue it until it is reactivated', async () => {
    const { t, cookie, make, employee } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const seat = (await make('ana.lima@bphs.org', { employeeId: ana.id })).data

    const held = await t.call('POST', `/api/digital-assets/${seat.id}/deactivate`, { cookie })
    expect(held.status).toBe(409)
    expect(held.data).toMatchObject({
      error: 'asset_assigned',
      message: 'DA-00001 is issued to Ana Lima. Unassign it first.',
    })

    await unassign(t, seat.id, cookie)
    expect((await t.call('POST', `/api/digital-assets/${seat.id}/deactivate`, { cookie })).data).toMatchObject({
      status: 'inactive',
      state: 'inactive',
    })

    const refused = await t.call('POST', `/api/digital-assets/${seat.id}/issue`, {
      cookie,
      body: { employeeId: ana.id },
    })
    expect(refused.status).toBe(409)
    expect(refused.data).toMatchObject({
      error: 'asset_inactive',
      message: 'DA-00001 is inactive. Reactivate it before issuing.',
    })

    expect((await t.call('POST', `/api/digital-assets/${seat.id}/reactivate`, { cookie })).data.state).toBe(
      'not_issued',
    )
    expect(
      (await t.call('POST', `/api/digital-assets/${seat.id}/issue`, { cookie, body: { employeeId: ana.id } })).data
        .state,
    ).toBe('active')
  })

  it('keeps the history of who had it, issued today or on an earlier date and never on a future one', async () => {
    const { t, cookie, admin, make, employee } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const ben = await employee('E-2002', 'Ben', 'Okafor')
    const seat = (await make('shared.seat@bphs.org')).data
    const issue = async (body: Record<string, unknown>, as = cookie) =>
      await t.call('POST', `/api/digital-assets/${seat.id}/issue`, { cookie: as, body })

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
    const future = await issue({ employeeId: ana.id, issuedAt: tomorrow })
    expect(future.status).toBe(422)
    expect(future.data.details.fields).toEqual({ issuedAt: 'The issue date cannot be in the future.' })
    expect((await issue({ employeeId: ana.id, issuedAt: '2026-01-05' })).status).toBe(422)

    const earlier = '2026-03-02T12:00:00.000Z'
    expect((await issue({ employeeId: ana.id, issuedAt: earlier })).data).toMatchObject({
      state: 'active',
      issuedAt: earlier,
    })
    await unassign(t, seat.id, admin)

    // The next holder cannot be dated to before the last one gave it up.
    const overlap = await issue({ employeeId: ben.id, issuedAt: earlier })
    expect(overlap.status).toBe(422)
    expect(overlap.data.details.fields).toEqual({
      issuedAt: 'The issue date cannot be before DA-00001 was last unassigned.',
    })
    expect((await issue({ employeeId: ben.id }, admin)).status).toBe(200)

    const detail = (await t.call('GET', `/api/digital-assets/${seat.id}`, { cookie })).data
    expect(detail.asset).toMatchObject({ code: 'DA-00001', state: 'active', employee: { name: 'Ben Okafor' } })
    expect(detail.history).toMatchObject([
      {
        employee: { code: 'E-2002', name: 'Ben Okafor' },
        returnedAt: null,
        issuedBy: 'm.oyelaran@bphs.local',
        returnedBy: null,
      },
      {
        employee: { code: 'E-2001', name: 'Ana Lima' },
        issuedAt: earlier,
        issuedBy: 'p.raghunathan@bphs.local',
        returnedBy: 'm.oyelaran@bphs.local',
      },
    ])
    expect(detail.history[1].returnedAt).not.toBeNull()

    // Not to an archived employee, and not to nobody.
    const cal = await employee('E-2003', 'Cal', 'Reyes')
    await t.call('POST', `/api/employees/${cal.id}/archive`, { cookie })
    const other = (await make('other@bphs.org')).data
    const archived = await t.call('POST', `/api/digital-assets/${other.id}/issue`, {
      cookie,
      body: { employeeId: cal.id },
    })
    expect(archived.data).toMatchObject({ error: 'employee_archived', message: 'Cal Reyes is archived.' })
    expect(
      (await t.call('POST', `/api/digital-assets/${other.id}/issue`, { cookie, body: { employeeId: 9999 } })).status,
    ).toBe(404)
    expect((await t.call('POST', `/api/digital-assets/${other.id}/issue`, { cookie, body: {} })).status).toBe(422)
    // Adding one with an employee who cannot take it adds nothing.
    expect((await make('third@bphs.org', { employeeId: cal.id })).status).toBe(409)
    expect((await t.call('GET', '/api/digital-assets', { cookie })).data).toHaveLength(2)
  })

  it('lets only a Super Admin delete one, and only one that was never issued', async () => {
    const { t, cookie, admin, make, employee, audit } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const used = (await make('used@bphs.org', { employeeId: ana.id })).data
    const mistake = (await make('mistake@bphs.org')).data

    expect((await t.call('DELETE', `/api/digital-assets/${mistake.id}`, { cookie: admin })).status).toBe(403)
    await unassign(t, used.id, cookie)
    const kept = await t.call('DELETE', `/api/digital-assets/${used.id}`, { cookie })
    expect(kept.status).toBe(409)
    expect(kept.data).toMatchObject({
      error: 'has_history',
      message: 'DA-00001 has assignment history. Mark it inactive instead; history is never deleted.',
    })
    expect((await t.call('DELETE', `/api/digital-assets/${mistake.id}`, { cookie })).status).toBe(204)
    expect((await audit())[0]).toMatchObject({
      action: 'delete',
      entityType: 'digitalasset',
      details: 'DA-00002 · M365-BusinessStandard · mistake@bphs.org',
    })
  })

  it('keeps an employee with a digital asset from being archived or deleted, and says why', async () => {
    const { t, cookie, make, employee } = await seed()
    const ana = await employee('E-2001', 'Ana', 'Lima')
    const seat = (await make('ana.lima@bphs.org', { employeeId: ana.id })).data
    const row = async () =>
      (await t.call('GET', '/api/employees', { cookie })).data.find((e: { id: number }) => e.id === ana.id)
    expect(await row()).toMatchObject({ assetsHeld: 0, digitalHeld: 1, hasHistory: true })

    const archive = await t.call('POST', `/api/employees/${ana.id}/archive`, { cookie })
    expect(archive.status).toBe(409)
    expect(archive.data).toMatchObject({
      error: 'holds_assets',
      message: 'Ana Lima still has 1 digital asset(s). Unassign them before archiving.',
    })
    const remove = await t.call('DELETE', `/api/employees/${ana.id}`, { cookie })
    expect(remove.status).toBe(409)
    expect(remove.data).toMatchObject({
      error: 'has_history',
      message: 'Ana Lima cannot be deleted. Has assignment history. Archive instead; history is never deleted.',
    })

    await unassign(t, seat.id, cookie)
    expect(await row()).toMatchObject({ digitalHeld: 0, hasHistory: true })
    // The history still names them, so they can be archived now but never deleted.
    expect((await t.call('DELETE', `/api/employees/${ana.id}`, { cookie })).status).toBe(409)
    expect((await t.call('POST', `/api/employees/${ana.id}/archive`, { cookie })).status).toBe(200)
  })

  it('manages digital asset types by the rules of asset types', async () => {
    const { t, cookie, admin, make, m365, types, audit } = await seed()
    const path = '/api/digital-asset-types'
    const created = await t.call('POST', path, { cookie: admin, body: { name: ' Adobe-CC ' } })
    expect(created.status).toBe(201)
    expect(created.data).toEqual({ id: created.data.id, name: 'Adobe-CC', isActive: true, assetCount: 0 })
    const duplicate = await t.call('POST', path, { cookie: admin, body: { name: 'zoho' } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.data).toMatchObject({
      error: 'duplicate_name',
      message: 'A digital asset type named "zoho" already exists.',
      details: { fields: { name: 'A digital asset type named "zoho" already exists.' } },
    })
    // The two registers keep their own lists: a name used by one is free in the other.
    expect((await t.call('POST', path, { cookie: admin, body: { name: 'Laptop' } })).status).toBe(201)

    expect(
      (await t.call('PATCH', `${path}/${created.data.id}`, { cookie: admin, body: { name: 'Adobe Creative Cloud' } }))
        .data.name,
    ).toBe('Adobe Creative Cloud')
    expect(
      (await t.call('PATCH', `${path}/${created.data.id}`, { cookie: admin, body: { name: 'Relias' } })).status,
    ).toBe(409)
    expect((await t.call('PATCH', `${path}/9999`, { cookie: admin, body: { name: 'Nothing' } })).status).toBe(404)

    // In use: deactivate, not delete. Deleting is for a Super Admin.
    await make('seat 1')
    expect((await t.call('GET', path, { cookie })).data.find((x: { id: number }) => x.id === m365.id).assetCount).toBe(
      1,
    )
    expect((await t.call('DELETE', `${path}/${created.data.id}`, { cookie: admin })).status).toBe(403)
    const inUse = await t.call('DELETE', `${path}/${m365.id}`, { cookie })
    expect(inUse.status).toBe(409)
    expect(inUse.data).toMatchObject({
      error: 'in_use',
      message: '1 digital asset(s) use "M365-BusinessStandard". Deactivate it instead.',
    })
    expect((await t.call('DELETE', `${path}/${created.data.id}`, { cookie })).status).toBe(204)
    // The four it starts with come from the migration, not the demo data.
    expect(types.map((x) => x.name)).toEqual(['M365-BusinessStandard', 'M365-PowerBI', 'Relias', 'Zoho'])

    const log = (await audit())
      .filter((e) => e.entityType === 'digitalassettype')
      .map((e) => `${e.action} ${e.details}`)
    expect(log).toContain('create Adobe-CC')
    expect(log).toContain('update Adobe Creative Cloud · name: Adobe-CC → Adobe Creative Cloud')
    expect(log).toContain('delete unused type "Adobe Creative Cloud"')
  })
})
