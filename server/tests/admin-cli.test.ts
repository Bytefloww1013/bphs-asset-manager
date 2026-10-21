import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, runMigrations } from '../db/client.ts'
import { auditLog, notifications, users } from '../db/schema.ts'
import { hashPassword } from '../lib/password.ts'
import { login } from '../services/auth.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const run = (dataDir: string, ...args: string[]) =>
  spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'admin.ts'), ...args], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  })

/** A real database file with one locked Super Admin, then the real CLI run against it as a child process. */
async function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bphs-admin-cli-'))
  dirs.push(dir)
  const file = path.join(dir, 'bphs.sqlite')
  const { db, sqlite } = createDb(file)
  runMigrations(db)
  db.insert(users)
    .values({
      name: 'Super Admin',
      email: 'admin@bphs.local',
      passwordHash: await hashPassword('Forgotten-1!'),
      superAdmin: true,
      mustChangePassword: false,
      failedLogins: 5,
      lockedUntil: new Date(Date.now() + 15 * 60_000),
    })
    .run()
  sqlite.close()

  const reopen = () => createDb(file)
  return { run: (...args: string[]) => run(dir, ...args), reopen }
}

describe('server/admin.ts (break-glass recovery)', () => {
  it('unlocks an account and records it in the audit log, but tells the account only when it was locked', async () => {
    const t = await fixture()
    expect(t.run('unlock', 'Admin@BPHS.local').status).toBe(0)

    const { db, sqlite } = t.reopen()
    const row = db.select().from(users).where(eq(users.email, 'admin@bphs.local')).get()
    expect(row?.lockedUntil).toBeNull()
    expect(row?.failedLogins).toBe(0)
    const entries = db.select().from(auditLog).all()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actor: 'server-cli', entityType: 'user', entityId: row?.id, userId: null })
    expect(db.select().from(notifications).all()).toMatchObject([
      { userId: row?.id, kind: 'account_unlocked', body: expect.stringContaining('command line') },
    ])

    expect(t.run('unlock', 'admin@bphs.local').status).toBe(0)
    expect(db.select().from(notifications).all()).toHaveLength(1)
    expect(db.select().from(auditLog).all()).toHaveLength(2)
    sqlite.close()
  })

  it('resets a password: new one-time password works once, old one stops, must change at next sign-in', async () => {
    const t = await fixture()
    const result = t.run('reset-password', 'admin@bphs.local')
    expect(result.status).toBe(0)
    const oneTime = /one-time password: (\S+)/.exec(result.stdout)?.[1]
    expect(oneTime).toBeTruthy()

    const { db, sqlite } = t.reopen()
    await expect(login(db, 'admin@bphs.local', 'Forgotten-1!')).rejects.toMatchObject({ status: 401 })
    const session = await login(db, 'admin@bphs.local', oneTime!)
    expect(session.user.mustChangePassword).toBe(true)
    const row = db.select().from(users).where(eq(users.email, 'admin@bphs.local')).get()
    expect(row?.failedLogins).toBe(0)
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .map((e) => e.details),
    ).toEqual([expect.stringContaining('password reset via server CLI'), 'admin@bphs.local · signed in'])
    // The CLI is the actor, so the account itself is told.
    expect(db.select().from(notifications).all()).toMatchObject([
      {
        userId: row?.id,
        kind: 'account_password_reset',
        title: 'Your password was reset',
        body: expect.stringContaining('command line'),
      },
    ])
    sqlite.close()
  })

  it('fails with a non-zero exit for an unknown account, a bad command, or no database', async () => {
    const t = await fixture()
    expect(t.run('unlock', 'nobody@bphs.local').status).toBe(1)
    expect(t.run('reset-password').status).toBe(1)
    expect(t.run('frobnicate').status).toBe(1)

    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'bphs-admin-empty-'))
    dirs.push(empty)
    const none = run(empty, 'list')
    expect(none.status).toBe(1)
    expect(none.stderr).toMatch(/No database/)
  })
})
