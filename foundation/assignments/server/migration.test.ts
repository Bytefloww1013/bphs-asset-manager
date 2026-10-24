// Migration 0024, the custody merge: the two ledgers become one, and every row, rule and counter comes through.
import { migratedBefore } from '#kernel/testing/index.ts'
import { describe, expect, it } from 'vitest'

/** The tables 0024 starts from, with rows deleted since: each counter is ahead of the highest id left. */
function before0024() {
  const { sqlite, next } = migratedBefore('0024_', { foreignKeys: true })
  sqlite.exec(`
    insert into employees (id, code, first_name, last_name) values (1, 'E-1', 'Sam', 'First'), (2, 'E-2', 'Ana', 'Lima');
    insert into programs (id, code, name) values (1, 'PRG-1', 'Harbour House');
    insert into users (id, name, email, password_hash) values (1, 'Admin', 'admin@x.example', 'x'), (2, 'Ops', 'ops@x.example', 'x');
    insert into asset_types (id, name) values (1, 'Laptop');
    insert into asset_brands (id, name) values (2, 'Dell');
    insert into condition_ratings (id, name, score) values (1, 'Good', 80);
    insert into assets (id, tag, type_id, brand_id, status, created_at) values
      (1, 'A-1', 1, 2, 'in_service', 100), (4, 'A-4', 1, 2, 'retired', 200), (7, 'A-7', 1, 2, 'in_service', 300);
    insert into assignments (id, asset_id, employee_id, program_id, issued_at, returned_at, issued_by_id, returned_by_id) values
      (2, 1, 1, null, 1000, 2000, 1, 1), (5, 1, null, 1, 3000, null, 1, null), (6, 7, 1, null, 4000, null, 2, null);
    insert into conditions (id, asset_id, assignment_id, kind, rating_id, assessed_by_id, notes, recorded_by_id, recorded_at) values
      (1, 1, null, 'intake', 1, null, null, 1, 100), (3, 1, 2, 'issue', 1, 1, 'Fine', 1, 1000), (9, 7, 6, 'issue', 1, null, null, 1, 4000);
    insert into digital_asset_types (id, name) values (9, 'Seat licence');
    insert into digital_assets (id, code, type_id, account, status) values
      (1, 'DA-00001', 9, 'sam@x.example', 'in_service'), (3, 'DA-00003', 9, 'ana@x.example', 'in_service'),
      (5, 'DA-00005', 9, 'spare@x.example', 'inactive');
    insert into digital_assignments (id, digital_asset_id, employee_id, issued_at, returned_at, issued_by_id, returned_by_id) values
      (1, 1, 2, 1500, 2500, 1, 2), (3, 3, 1, 3500, null, 2, null), (4, 1, 2, 2600, null, 1, null);
    update sqlite_sequence set seq = 10 where name = 'assets';
    update sqlite_sequence set seq = 8 where name = 'assignments';
    update sqlite_sequence set seq = 9 where name = 'digital_assignments';
    update sqlite_sequence set seq = 12 where name = 'conditions';`)
  return { sqlite, next }
}

describe('migration 0024', () => {
  it('moves both ledgers into one, keeping every physical id and numbering the digital rows after them', () => {
    const { sqlite, next } = before0024()
    const conditionsBefore = sqlite.prepare('select * from conditions order by id').all()
    const counts = { physical: 3, digital: 3 }

    // The migrator runs a migration inside one transaction with foreign keys on, so the test does too.
    sqlite.exec('begin')
    next()
    sqlite.exec('commit')

    expect(sqlite.prepare('select * from assignments order by id').all()).toEqual([
      // The physical rows, as they were.
      {
        id: 2,
        kind: 'asset',
        item_id: 1,
        employee_id: 1,
        program_id: null,
        issued_at: 1000,
        returned_at: 2000,
        issued_by_id: 1,
        returned_by_id: 1,
      },
      {
        id: 5,
        kind: 'asset',
        item_id: 1,
        employee_id: null,
        program_id: 1,
        issued_at: 3000,
        returned_at: null,
        issued_by_id: 1,
        returned_by_id: null,
      },
      {
        id: 6,
        kind: 'asset',
        item_id: 7,
        employee_id: 1,
        program_id: null,
        issued_at: 4000,
        returned_at: null,
        issued_by_id: 2,
        returned_by_id: null,
      },
      // The digital rows, in their own order, after id 8: the highest the physical ledger ever gave out.
      {
        id: 9,
        kind: 'digital-asset',
        item_id: 1,
        employee_id: 2,
        program_id: null,
        issued_at: 1500,
        returned_at: 2500,
        issued_by_id: 1,
        returned_by_id: 2,
      },
      {
        id: 10,
        kind: 'digital-asset',
        item_id: 3,
        employee_id: 1,
        program_id: null,
        issued_at: 3500,
        returned_at: null,
        issued_by_id: 2,
        returned_by_id: null,
      },
      {
        id: 11,
        kind: 'digital-asset',
        item_id: 1,
        employee_id: 2,
        program_id: null,
        issued_at: 2600,
        returned_at: null,
        issued_by_id: 1,
        returned_by_id: null,
      },
    ])
    expect(sqlite.prepare('select count(*) as n from assignments').get()).toEqual({
      n: counts.physical + counts.digital,
    })
    expect(sqlite.prepare('select * from conditions order by id').all()).toEqual(conditionsBefore)
    expect(
      sqlite
        .prepare("select name, seq from sqlite_sequence where name in ('assignments', 'conditions') order by name")
        .all(),
    ).toEqual([
      { name: 'assignments', seq: 11 },
      { name: 'conditions', seq: 12 },
    ])
    expect(
      sqlite
        .prepare(
          "select name from sqlite_master where name in ('digital_assignments') or name like '\\_\\_%' escape '\\'",
        )
        .all(),
    ).toEqual([])
    expect(sqlite.pragma('foreign_key_check')).toEqual([])

    // The next one carries on from the counter.
    sqlite.exec(
      "insert into assignments (kind, item_id, employee_id, issued_at, issued_by_id) values ('asset', 4, 2, 5000, 1)",
    )
    expect(sqlite.prepare('select max(id) as id from assignments').get()).toEqual({ id: 12 })
  })

  it('keeps the rules both ledgers had, and the foreign keys item_id cannot have', () => {
    const { sqlite, next } = before0024()
    sqlite.exec('begin')
    next()
    sqlite.exec('commit')
    const insert = sqlite.prepare(
      'insert into assignments (kind, item_id, employee_id, program_id, issued_at, issued_by_id) values (?, ?, ?, ?, 6000, 1)',
    )

    // One open assignment per item of a kind. Asset 1 and seat 1 are both out: the same id of another kind is another item.
    expect(() => insert.run('asset', 1, 2, null)).toThrow(/UNIQUE/)
    expect(() => insert.run('digital-asset', 3, 2, null)).toThrow(/UNIQUE/)
    expect(
      sqlite.prepare('select count(*) as n from assignments where item_id = 1 and returned_at is null').get(),
    ).toEqual({
      n: 2,
    })
    // Exactly one holder.
    expect(() => insert.run('asset', 4, 1, 1)).toThrow(/CHECK/)
    expect(() => insert.run('asset', 4, null, null)).toThrow(/CHECK/)
    // An item that is there, and that the row keeps naming.
    expect(() => insert.run('asset', 99, 1, null)).toThrow(/no such item/)
    expect(() => insert.run('digital-asset', 99, 1, null)).toThrow(/no such item/)
    expect(() => sqlite.exec('update assignments set item_id = 4 where id = 6')).toThrow(/keeps its item/)
    expect(() => sqlite.exec("update assignments set kind = 'digital-asset' where id = 6")).toThrow(/keeps its item/)
    sqlite.exec('update assignments set returned_at = 7000, returned_by_id = 1 where id = 6')
    // History is never pulled out from under an item, a holder or a condition.
    expect(() => sqlite.exec('delete from assets where id = 7')).toThrow(/never deleted/)
    expect(() => sqlite.exec('delete from digital_assets where id = 1')).toThrow(/never deleted/)
    expect(() => sqlite.exec('delete from employees where id = 2')).toThrow(/FOREIGN KEY/)
    expect(() => sqlite.exec('delete from assignments where id = 2')).toThrow(/FOREIGN KEY/)
    // An item nobody ever held can still go.
    sqlite.exec('delete from assets where id = 4')
    sqlite.exec('delete from digital_assets where id = 5')
    expect(sqlite.prepare('select count(*) as n from assets where id = 4').get()).toEqual({ n: 0 })
    expect(sqlite.prepare('select count(*) as n from digital_assets where id = 5').get()).toEqual({ n: 0 })
  })

  it('moves empty ledgers too', () => {
    const { sqlite, next } = migratedBefore('0024_', { foreignKeys: true })
    sqlite.exec('begin')
    next()
    sqlite.exec('commit')
    expect(sqlite.prepare('select count(*) as n from assignments').get()).toEqual({ n: 0 })
    expect(sqlite.prepare("select seq from sqlite_sequence where name = 'assignments'").get()).toEqual({ seq: 0 })
  })
})

describe('upgrading the assignments table', () => {
  it('on upgrade, rebuilds the assignments table around the rows it already has', () => {
    const { sqlite, next } = migratedBefore('0005_', { foreignKeys: true })

    sqlite.exec(`
      insert into employees (id, code, first_name, last_name) values (1, 'E-1', 'Sam', 'First'), (2, 'E-2', 'Olu', 'Second');
      insert into users (id, name, email, password_hash, role) values (1, 'Admin', 'admin@x.example', 'x', 'admin');
      insert into asset_types (id, name) values (1, 'Laptop');
      insert into condition_ratings (id, name, score) values (1, 'Good', 80), (2, 'Fair', 60);
      insert into assets (id, tag, type_id) values (1, 'A-1', 1), (2, 'A-2', 1), (3, 'A-3', 1);
      insert into assignments (id, asset_id, employee_id, issued_at, returned_at, issued_by_id, returned_by_id) values
        (3, 1, 1, 1000, 2000, 1, 1),
        (4, 1, 2, 3000, null, 1, null),
        (9, 2, 1, 4000, 5000, 1, 1);
      insert into conditions (id, asset_id, assignment_id, kind, rating_id, assessed_by_id, notes, recorded_by_id, recorded_at) values
        (1, 1, null, 'intake', 1, null, null, 1, 500),
        (2, 1, 3, 'issue', 1, 1, null, 1, 1000),
        (3, 1, 3, 'return', 2, 2, 'Scuffed lid', 1, 2000),
        (4, 1, 4, 'issue', 2, null, null, 1, 3000),
        (8, 2, 9, 'issue', 1, null, null, 1, 4000),
        (11, 2, 9, 'return', 1, null, null, 1, 5000);
      -- Rows that were deleted since: the counters are ahead of the highest id left.
      update sqlite_sequence set seq = 12 where name = 'assignments';
      update sqlite_sequence set seq = 15 where name = 'conditions';`)
    const assignmentsBefore = sqlite.prepare('select * from assignments order by id').all()
    const conditionsBefore = sqlite.prepare('select * from conditions order by id').all()

    // The migrator runs a migration inside one transaction with foreign keys on, so the test does too.
    sqlite.exec('begin')
    next()
    sqlite.exec('commit')

    expect(sqlite.prepare('select * from assignments order by id').all()).toEqual(
      assignmentsBefore.map((row) => ({ ...(row as object), program_id: null })),
    )
    expect(
      sqlite
        .prepare(
          'select id, asset_id, employee_id, program_id, issued_at, returned_at, issued_by_id, returned_by_id from assignments where id = 4',
        )
        .get(),
    ).toEqual({
      id: 4,
      asset_id: 1,
      employee_id: 2,
      program_id: null,
      issued_at: 3000,
      returned_at: null,
      issued_by_id: 1,
      returned_by_id: null,
    })
    expect(sqlite.prepare('select * from conditions order by id').all()).toEqual(conditionsBefore)
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    expect(sqlite.prepare("select name from sqlite_master where name like '\\_\\_%' escape '\\'").all()).toEqual([])

    // The rules the old tables held still hold: one open assignment per asset, and history that cannot be pulled out from under a condition.
    const insert = sqlite.prepare(
      'insert into assignments (asset_id, employee_id, program_id, issued_at, issued_by_id) values (?, ?, ?, ?, ?)',
    )
    expect(() => insert.run(1, 1, null, 6000, 1)).toThrow(/UNIQUE/)
    expect(() => sqlite.prepare('delete from assignments where id = 3').run()).toThrow(/FOREIGN KEY/)
    expect(() =>
      sqlite
        .prepare(
          "insert into conditions (asset_id, assignment_id, kind, rating_id, recorded_by_id, recorded_at) values (1, 999, 'issue', 1, 1, 1)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
    // And the new ones are there: a program can hold an asset, and ids carry on from where they stopped.
    sqlite.exec("insert into programs (id, code, name) values (1, 'P-100', 'Outreach North')")
    expect(() => insert.run(3, 1, 1, 6000, 1)).toThrow(/CHECK/)
    expect(insert.run(3, null, 1, 6000, 1).lastInsertRowid).toBe(13)
    expect(
      sqlite
        .prepare(
          "insert into conditions (asset_id, assignment_id, kind, rating_id, recorded_by_id, recorded_at) values (3, 13, 'issue', 1, 1, 6000)",
        )
        .run().lastInsertRowid,
    ).toBe(16)
    // Deleting an asset still takes its condition records with it, once nothing else holds it.
    sqlite.exec(
      "insert into assets (id, tag, type_id) values (4, 'A-4', 1); insert into conditions (asset_id, kind, rating_id, recorded_by_id, recorded_at) values (4, 'intake', 1, 1, 1); delete from assets where id = 4",
    )
    expect(sqlite.prepare('select count(*) as n from conditions where asset_id = 4').get()).toEqual({ n: 0 })
    sqlite.close()
  })
})
