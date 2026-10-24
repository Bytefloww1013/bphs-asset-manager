// Importing employees through the kernel's import route, with the importer this module registers.
import { describe, expect, it } from 'vitest'
import { setup } from '#kernel/testing/index.ts'

describe('importing employees', () => {
  type Values = Record<string, string>
  const rowsOf = (...values: Values[]) => ({ rows: values.map((v, i) => ({ row: i + 2, values: v })) })
  const EMPLOYEES = rowsOf(
    { code: 'E-1402', firstName: 'Rosa', lastName: 'Delgado', department: 'Intake', jobTitle: 'Coordinator' },
    { code: 'e-1042', firstName: 'Priya', lastName: 'Raghunathan', department: 'IT', jobTitle: 'Analyst' },
    { code: '', firstName: 'Kerry', lastName: '', department: 'Finance', jobTitle: '' },
    { code: ' E-1403 ', firstName: 'Zhao, Wen', lastName: 'Lee' },
    { code: 'e-1402', firstName: 'Rosa', lastName: 'Again' },
  )

  it('previews, imports once, skips duplicates and logs one entry per created employee', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const before = (await t.call('GET', '/api/employees', { cookie })).data.length
    const preview = await t.call('POST', '/api/import/employees/preview', { cookie, body: EMPLOYEES })
    expect(preview.status).toBe(200)
    expect(preview.data.summary).toEqual({ read: 5, create: 2, duplicates: 2, errors: 1 })
    expect(preview.data.created).toBeUndefined()
    expect(preview.data.rows.map((r: { result: string }) => r.result)).toEqual([
      'new',
      'duplicate',
      'error',
      'new',
      'duplicate',
    ])
    expect(preview.data.rows[1].message).toBe('Skip: Employee ID already exists')
    expect(preview.data.rows[2]).toMatchObject({ row: 4, message: 'Row 4: missing Employee ID, Last name' })
    // Values come back trimmed, with every field present.
    expect(preview.data.rows[3].values).toEqual({
      code: 'E-1403',
      firstName: 'Zhao, Wen',
      lastName: 'Lee',
      department: '',
      jobTitle: '',
    })
    // A key repeated in the file counts once: the first row wins.
    expect(preview.data.rows[4].message).toBe('Skip: Employee ID appears earlier in this file')
    // A preview writes nothing.
    expect((await t.call('GET', '/api/employees', { cookie })).data).toHaveLength(before)

    const run = await t.call('POST', '/api/import/employees', { cookie, body: EMPLOYEES })
    expect(run.data.created).toBe(2)
    expect(run.data.summary).toEqual({ read: 5, create: 2, duplicates: 2, errors: 1 })
    const list = (await t.call('GET', '/api/employees', { cookie })).data
    expect(list).toHaveLength(before + 2)
    expect(list.find((e: { code: string }) => e.code === 'E-1403')).toMatchObject({
      firstName: 'Zhao, Wen',
      department: null,
      jobTitle: null,
      assetsHeld: 0,
    })
    // The employee that was already there is not touched.
    expect(list.find((e: { code: string }) => e.code === 'E-1042').jobTitle).not.toBe('Analyst')

    const again = await t.call('POST', '/api/import/employees', { cookie, body: EMPLOYEES })
    expect(again.data.created).toBe(0)
    expect(again.data.summary).toEqual({ read: 5, create: 0, duplicates: 4, errors: 1 })
    expect((await t.call('GET', '/api/employees', { cookie })).data).toHaveLength(before + 2)

    const audit = (await t.call('GET', '/api/audit?action=import', { cookie })).data
    expect(audit.total).toBe(2)
    expect(audit.entries.map((e: { details: string }) => e.details).sort()).toEqual([
      'employee_id=E-1402',
      'employee_id=E-1403',
    ])
  })

  it('reports rows over the limits of Add employee as errors and does not create them', async () => {
    const t = await setup()
    const cookie = await t.asAdmin()
    const body = rowsOf(
      { code: 'E'.repeat(200), firstName: 'Rosa', lastName: 'Delgado' },
      { code: 'E-2001', firstName: 'R'.repeat(300), lastName: 'Delgado' },
      { code: 'E-2002', firstName: 'Wen', lastName: 'Lee', department: 'D'.repeat(81) },
      { code: 'E-2003', firstName: 'Wen', lastName: 'Lee', department: 'Intake' },
    )
    const preview = await t.call('POST', '/api/import/employees/preview', { cookie, body })
    expect(preview.data.summary).toEqual({ read: 4, create: 1, duplicates: 0, errors: 3 })
    expect(preview.data.rows[0].message).toMatch(/Row 2.*Employee ID.*40 characters/)
    expect(preview.data.rows[1].message).toMatch(/Row 3.*First name.*80 characters/)
    expect(preview.data.rows[2].message).toMatch(/Row 4.*Department.*80 characters/)

    const run = await t.call('POST', '/api/import/employees', { cookie, body })
    expect(run.data.created).toBe(1)
    const codes = (await t.call('GET', '/api/employees', { cookie })).data.map((e: { code: string }) => e.code)
    expect(codes).toContain('E-2003')
    expect(codes).not.toContain('E-2001')
    expect(codes.every((code: string) => code.length <= 40)).toBe(true)
  })
})
