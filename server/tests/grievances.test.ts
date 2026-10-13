import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeGrievanceAudit } from '../lib/grievance-audit.ts'
import { setup } from './helpers.ts'

describe('the grievances workspace', () => {
  it('answers 401 to a signed-out request and an empty list to either role', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/grievances')).status).toBe(401)
    for (const cookie of [await t.asAdmin(), await t.asSuper()]) {
      const res = await t.call('GET', '/api/grievances', { cookie })
      expect(res.status).toBe(200)
      expect(res.data).toEqual([])
    }
  })
})

describe('the grievance audit log', () => {
  const actor = (t: Awaited<ReturnType<typeof setup>>) => ({ ...t.adminUser, employeeId: t.adminUser.employeeId ?? null })

  it('takes an entry of its own and leaves the audit log alone', async () => {
    const t = await setup()
    const before = t.sqlite.prepare('select count(*) as n from audit_log').get()
    t.db.transaction((tx) => writeGrievanceAudit(tx, actor(t), { action: 'create', entityType: 'grievance', entityId: 1, details: 'GR-2026-0001 · A title' }))
    expect(t.sqlite.prepare('select user_id, actor, action, entity_type, entity_id, details from grievance_audit_log').all()).toEqual([
      { user_id: t.adminUser.id, actor: 'm.oyelaran@bphs.local', action: 'create', entity_type: 'grievance', entity_id: 1, details: 'GR-2026-0001 · A title' },
    ])
    expect(t.sqlite.prepare('select count(*) as n from audit_log').get()).toEqual(before)
  })

  it('is append-only', async () => {
    const t = await setup()
    writeGrievanceAudit(t.db, actor(t), { action: 'create', entityType: 'grievance', entityId: 1 })
    expect(() => t.sqlite.prepare("update grievance_audit_log set details = 'tampered'").run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('update grievance_audit_log set id = 99').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare('delete from grievance_audit_log').run()).toThrow(/append-only/)
    expect(() => t.sqlite.prepare("insert or replace into grievance_audit_log (id, occurred_at, actor, action, entity_type) values (1, 0, 'x', 'create', 'grievance')").run()).toThrow(/append-only/)
    // Deleting the account clears the link and keeps the entry and the name on it.
    t.sqlite.prepare('delete from sessions where user_id = ?').run(t.adminUser.id)
    t.sqlite.prepare('delete from users where id = ?').run(t.adminUser.id)
    expect(t.sqlite.prepare('select user_id, actor from grievance_audit_log').all()).toEqual([{ user_id: null, actor: 'm.oyelaran@bphs.local' }])
  })

  // The two logs are kept apart in the source as well: grievance code never writes to the Audit Log, and nothing else writes to this one.
  it('is written by grievance code only, which never writes to the audit log', () => {
    const server = path.resolve(import.meta.dirname, '..')
    const sources = (fs.readdirSync(server, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('tests' + path.sep))
      .map((file) => ({ file: file.split(path.sep).join('/'), text: fs.readFileSync(path.join(server, file), 'utf8') }))
    const isGrievance = (file: string) => path.basename(file).startsWith('grievance')
    expect(sources.filter((s) => isGrievance(s.file)).map((s) => s.file)).toContain('lib/grievance-audit.ts')
    expect(sources.filter((s) => isGrievance(s.file) && /\bwriteAudit\b|\bauditLog\b/.test(s.text)).map((s) => s.file)).toEqual([])
    expect(sources.filter((s) => !isGrievance(s.file) && s.file !== 'db/schema.ts' && /\bwriteGrievanceAudit\b|\bgrievanceAuditLog\b/.test(s.text)).map((s) => s.file)).toEqual([])
  })
})
