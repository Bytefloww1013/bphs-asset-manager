/**
 * Development seed: synthetic employees, programs, physical and digital assets, grievances and administrative reviews with their timelines, employee tasks, history and users modelled on the design spec.
 * Every name and serial here is made up. Never run against production data.
 *
 *   bun run db:seed            # fills an empty database
 *   bun run db:seed --reset    # deletes data/bphs.sqlite first
 */
import { auditLog } from '#foundation/audit/server/index.ts'
import { seedEmployees } from '#foundation/employees/server/index.ts'
import { notifications } from '#foundation/notifications/server/index.ts'
import { DEMO_PROGRAMS, programs } from '#foundation/programs/server/index.ts'
import fs from 'node:fs'
import path from 'node:path'
import { config, isProduction } from './config.ts'
import { createDb, runMigrations, type DbLike } from './db/client.ts'
import { users } from './db/schema.ts'
import { hashPassword } from './lib/password.ts'
import type { SeedKit } from './modules.ts'
import { SERVER_MODULES } from './modules.gen.ts'
import { installModules, seedModules, startModules } from './registry.ts'

if (isProduction) {
  console.error('Refusing to seed in production.')
  process.exit(1)
}

installModules(SERVER_MODULES)
const file = path.join(config.dataDir, 'bphs.sqlite')
if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true })
}

const { db, sqlite } = createDb(file)
runMigrations(db)
await startModules(db)
if (db.select().from(users).limit(1).get()) {
  console.error('The database already has users. Re-run with --reset to start over.')
  process.exit(1)
}

// Small deterministic generator so every seed produces the same demo.
const generator = (seed: number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = generator(20260727)
// Brands, models and Entra ObjectIds draw from their own sequence, so adding them left the rest of the demo as it was.
const deviceRand = generator(20261022)
const devicePick = <T>(list: readonly T[]): T => list[Math.floor(deviceRand() * list.length)]!
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

const DAY = 86_400_000
const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * DAY - int(0, 8) * 3_600_000)

const PASSWORD = 'Demo-pass1!'
const passwordHash = await hashPassword(PASSWORD)

const people = seedEmployees(db, daysAgo)
const active = people.filter((p) => !p.archivedAt)
const byCode = (code: string) => people.find((p) => p.code === code)!

const [priya, marcus, dana, , , rosa] = db
  .insert(users)
  .values(
    (
      [
        {
          name: 'Priya Raghunathan',
          email: 'p.raghunathan@bphs.local',
          superAdmin: true,
          employeeId: byCode('E-1042').id,
          lastLoginAt: daysAgo(0),
        },
        {
          name: 'Marcus Oyelaran',
          email: 'm.oyelaran@bphs.local',
          access: { assets: 'edit', grievances: 'edit', reviews: 'edit', employees: 'edit', tasks: 'edit' },
          employeeId: byCode('E-0988').id,
          lastLoginAt: daysAgo(0),
        },
        {
          name: 'Dana Whitfield',
          email: 'd.whitfield@bphs.local',
          access: { grievances: 'edit', employees: 'edit', tasks: 'assign' },
          employeeId: byCode('E-1130').id,
          mustChangePassword: true,
        },
        {
          name: 'Ops Account',
          email: 'ops@bphs.local',
          access: { assets: 'edit', employees: 'edit' },
          employeeId: byCode('E-0761').id,
          failedLogins: 5,
          lockedUntil: new Date(now + 11 * 60_000),
          lastLoginAt: daysAgo(1),
        },
        {
          name: 'Neil Abernathy',
          email: 'n.abernathy@bphs.local',
          access: { assets: 'edit', grievances: 'edit', employees: 'edit' },
          employeeId: byCode('E-0442').id,
          isActive: false,
          lastLoginAt: daysAgo(150),
        },
        {
          name: 'Rosa Delgado',
          email: 'r.delgado@bphs.local',
          access: {
            assets: 'read',
            grievances: 'read',
            maintenance: 'read',
            reviews: 'read',
            employees: 'read',
            tasks: 'read',
          },
          employeeId: byCode('E-1102').id,
          lastLoginAt: daysAgo(3),
        },
      ] satisfies Partial<typeof users.$inferInsert>[]
    ).map((u) => ({ passwordHash, mustChangePassword: false, ...u })),
  )
  .returning()
  .all()

const actors = [priya!, marcus!]

const audit = (
  d: DbLike,
  at: Date,
  who: (typeof actors)[number],
  action: 'create' | 'issue' | 'return' | 'update',
  entityType: string,
  entityId: number,
  details: string,
) =>
  d
    .insert(auditLog)
    .values({ occurredAt: at, userId: who.id, actor: who.email, action, entityType, entityId, details })
    .run()

// The programs, made the first time a module asks for them: the assets do, after their fleet.
let demoPrograms: ReturnType<SeedKit['programs']> | undefined
const seedPrograms = (d: DbLike = db) =>
  (demoPrograms ??= DEMO_PROGRAMS.map(([code, name, address, isActive], i) => {
    const createdAt = daysAgo(700 - i * 40)
    const program = d.insert(programs).values({ code, name, address, isActive, createdAt }).returning().get()
    audit(d, createdAt, priya!, 'create', 'program', program.id, `program_id=${code} · ${name}`)
    return program
  }))

// Each module's demo data, in dependency order, from one random sequence: the assets (with the programs), the digital
// assets, grievances, reviews and tasks, as they always came.
const kit: SeedKit = {
  now,
  rand,
  int,
  pick,
  deviceRand,
  devicePick,
  daysAgo,
  audit,
  people,
  active,
  byCode,
  priya: priya!,
  marcus: marcus!,
  dana: dana!,
  rosa: rosa!,
  actors,
  programs: seedPrograms,
}
const added = await seedModules(db, kit)
const programCount = seedPrograms().length

// Sample notifications, so the bell and the Inbox have something to show. Oldest first: the lists sort by id. An asset's id is its tag number.
for (const user of [priya!, marcus!, rosa!]) {
  const at = (days: number) => new Date(now - days * DAY)
  db.insert(notifications)
    .values(
      [
        {
          kind: 'asset_returned_poor',
          sourceKey: 'asset:5',
          title: 'BPHS-0005 came back in poor condition',
          link: '/assets/BPHS-0005',
          createdAt: at(12),
          readAt: at(11),
          archivedAt: at(11),
        },
        {
          kind: 'account_access_changed',
          sourceKey: `user:${user.id}`,
          title: 'Your access was changed',
          body: 'See your Profile for what you can do now.',
          link: '/me/profile',
          createdAt: at(6),
          readAt: at(5),
        },
        {
          kind: 'asset_overdue',
          sourceKey: 'assignment:12',
          title: 'BPHS-0012 is overdue',
          link: '/assets/BPHS-0012',
          createdAt: at(2),
        },
        {
          kind: 'asset_issued',
          sourceKey: 'asset:7',
          title: 'BPHS-0007 was issued to you',
          link: '/assets/BPHS-0007',
          createdAt: at(1),
        },
        {
          kind: 'asset_issued',
          sourceKey: 'asset:3',
          title: 'BPHS-0003 was issued to you',
          body: 'Laptop, issued by Marcus Oyelaran.',
          link: '/assets/BPHS-0003',
          createdAt: at(0.02),
        },
      ].map((row) => ({ userId: user.id, ...row })),
    )
    .run()
}

console.log(
  `Seeded ${[`${people.length} employees`, `${programCount} programs`, ...added].join(', ')} and 6 users into ${file}`,
)
console.log(
  `Sign in as p.raghunathan@bphs.local (Super Admin), m.oyelaran@bphs.local (Edit) or r.delgado@bphs.local (Read Only), password: ${PASSWORD}`,
)
sqlite.close()
