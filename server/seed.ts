/**
 * Development seed: synthetic employees, programs, physical and digital assets, grievances with their timelines, history and users modelled on the design spec.
 * Every name and serial here is made up. Never run against production data.
 *
 *   bun run db:seed            # fills an empty database
 *   bun run db:seed --reset    # deletes data/bphs.sqlite first
 */
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { ensureDefaultLists } from './bootstrap.ts'
import { config, isProduction } from './config.ts'
import { createDb, runMigrations, type DbLike } from './db/client.ts'
import {
  assetTypes,
  assets,
  assignments,
  auditLog,
  conditionRatings,
  conditions,
  digitalAssetTypes,
  digitalAssets,
  digitalAssignments,
  employees,
  programs,
  users,
} from './db/schema.ts'
import { seedGrievances } from './grievance-seed.ts'
import { hashPassword } from './lib/password.ts'

if (isProduction) {
  console.error('Refusing to seed in production.')
  process.exit(1)
}

const file = path.join(config.dataDir, 'bphs.sqlite')
if (process.argv.includes('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true })
}

const { db, sqlite } = createDb(file)
runMigrations(db)
ensureDefaultLists(db)
if (db.select().from(users).limit(1).get()) {
  console.error('The database already has users. Re-run with --reset to start over.')
  process.exit(1)
}

// Small deterministic generator so every seed produces the same demo.
let state = 20260727
const rand = () => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

const DAY = 86_400_000
const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * DAY - int(0, 8) * 3_600_000)

const PASSWORD = 'Demo-pass1!'
const passwordHash = await hashPassword(PASSWORD)

const PEOPLE: [string, string, string, string, string][] = [
  ['E-1042', 'Priya', 'Raghunathan', 'IT', 'Systems Analyst'],
  ['E-1130', 'Dana', 'Whitfield', 'Clinical Services', 'Case Manager'],
  ['E-0988', 'Marcus', 'Oyelaran', 'Finance', 'Controller'],
  ['E-1201', 'Tomas', 'Berger', 'Residential', 'Support Worker'],
  ['E-0761', 'Grant', 'Halloway', 'Facilities', 'Maintenance Lead'],
  ['E-1288', 'Alice', 'Nkemdirim', 'HR', 'HR Generalist'],
  ['E-1315', 'Sasha', 'Feldman', 'Intake', 'Intake Coordinator'],
  ['E-0904', 'Aaron', 'Feldman-Rees', 'Finance', 'Analyst'],
  ['E-0442', 'Neil', 'Abernathy', 'Facilities', 'Custodian'],
  ['E-1102', 'Rosa', 'Delgado', 'Intake', 'Intake Specialist'],
  ['E-1177', 'Wen', 'Zhao', 'IT', 'Helpdesk Technician'],
  ['E-1219', 'Bilal', 'Osman', 'Residential', 'Support Worker'],
  ['E-1233', 'Hanna', 'Vuorinen', 'Clinical Services', 'Clinician'],
  ['E-1247', 'Ivo', 'Petrov', 'Facilities', 'Groundskeeper'],
  ['E-1260', 'Nadia', 'Brill', 'HR', 'Recruiter'],
  ['E-1271', 'Kerry', 'Milton', 'Finance', 'Accounts Payable'],
  ['E-1282', 'Owen', 'Castellano', 'Clinical Services', 'Clinician'],
  ['E-1296', 'Mina', 'Haddad', 'Residential', 'House Manager'],
  ['E-1304', 'Jules', 'Okafor', 'Intake', 'Intake Coordinator'],
  ['E-1322', 'Elena', 'Marsh', 'Clinical Services', 'Program Director'],
  ['E-1339', 'Theo', 'Lindqvist', 'IT', 'Network Administrator'],
  ['E-1348', 'Farah', 'Siddiqui', 'Finance', 'Billing Specialist'],
  ['E-1356', 'Callum', 'Reyes', 'Residential', 'Support Worker'],
  ['E-1363', 'Imani', 'Brooks', 'HR', 'Benefits Coordinator'],
]

const people = db
  .insert(employees)
  .values(
    PEOPLE.map(([code, firstName, lastName, department, jobTitle], i) => ({
      code,
      firstName,
      lastName,
      department,
      jobTitle,
      createdAt: daysAgo(900 - i * 7),
      archivedAt: code === 'E-0442' ? daysAgo(60) : null,
    })),
  )
  .returning()
  .all()
const active = people.filter((p) => !p.archivedAt)
const byCode = (code: string) => people.find((p) => p.code === code)!

const [priya, marcus] = db
  .insert(users)
  .values(([
    { name: 'Priya Raghunathan', email: 'p.raghunathan@bphs.local', role: 'super_admin', employeeId: byCode('E-1042').id, lastLoginAt: daysAgo(0) },
    { name: 'Marcus Oyelaran', email: 'm.oyelaran@bphs.local', role: 'admin', employeeId: byCode('E-0988').id, lastLoginAt: daysAgo(0) },
    { name: 'Dana Whitfield', email: 'd.whitfield@bphs.local', role: 'grievance_admin', employeeId: byCode('E-1130').id, mustChangePassword: true },
    { name: 'Ops Account', email: 'ops@bphs.local', role: 'asset_admin', failedLogins: 5, lockedUntil: new Date(now + 11 * 60_000), lastLoginAt: daysAgo(1) },
    { name: 'Neil Abernathy', email: 'n.abernathy@bphs.local', role: 'admin', employeeId: byCode('E-0442').id, isActive: false, lastLoginAt: daysAgo(150) },
  ] satisfies Partial<typeof users.$inferInsert>[]).map((u) => ({ passwordHash, mustChangePassword: false, ...u }) as typeof users.$inferInsert))
  .returning()
  .all()

const types = Object.fromEntries(db.select().from(assetTypes).all().map((t) => [t.name, t.id])) as Record<string, number>
const ratings = Object.fromEntries(db.select().from(conditionRatings).all().map((r) => [r.name, r.id])) as Record<string, number>

const FLEET: [string, number, string, string][] = [
  // type, count, serial prefix, tag prefix start
  ['Laptop', 34, '5CD', 'L'],
  ['Phone', 26, 'F1', 'P'],
  ['Monitor', 28, 'CN0', 'M'],
  ['Keyboard', 16, 'KB-', 'K'],
  ['Mouse', 12, 'MS-', 'O'],
]

const actors = [priya!, marcus!]

const PROGRAMS: [string, string, string | null, boolean][] = [
  // Program ID, name, address, active
  ['PRG-100', 'Harbour House Residential', '14 Harbour Road', true],
  ['PRG-110', 'Maple Court Residential', '220 Maple Court', true],
  ['PRG-200', 'Downtown Intake Centre', '5 King Street, Suite 300', true],
  ['PRG-310', 'Youth Outreach', '88 Mill Lane', true],
  ['PRG-400', 'Day Program', null, true],
  ['PRG-090', 'Northside Drop-in', '41 Alder Avenue', false],
]

/** Digital asset type, how many seats, and what a seat's License/Account looks like. */
const SEATS: [string, number, (n: number, holder?: { firstName: string; lastName: string }) => string][] = [
  ['Microsoft 365', 12, (n, h) => (h ? `${h.firstName[0]}.${h.lastName}@bphs.example`.toLowerCase() : `spare${n}@bphs.example`)],
  ['Adobe Acrobat Pro', 5, (n) => `Team licence, seat ${n}`],
  ['Client records system', 8, (n, h) => (h ? `${h.firstName[0]}${h.lastName}`.toLowerCase().replace(/[^a-z]/g, '') : `unassigned-${n}`)],
  ['Zoom', 4, (n) => `Licensed host ${n}`],
  ['Accounting software', 3, (n) => `Named user ${n}`],
]
const audit = (d: DbLike, at: Date, who: (typeof actors)[number], action: 'create' | 'issue' | 'return' | 'update', entityType: string, entityId: number, details: string) =>
  d.insert(auditLog).values({ occurredAt: at, userId: who.id, actor: who.email, action, entityType, entityId, details }).run()

/** Physical assets left in service with nobody holding them, and when each last came back. */
const shelf: { id: number; tag: string; since: number }[] = []

const serial = (prefix: string) => `${prefix}${int(1000, 9999)}${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}${int(10, 99)}`

let tagNumber = 0
db.transaction((tx) => {
  for (const [typeName, count, prefix] of FLEET) {
    for (let n = 0; n < count; n++) {
      tagNumber += 1
      const tag = `BPHS-${String(tagNumber).padStart(4, '0')}`
      const createdAt = daysAgo(int(120, 880))
      const who = pick(actors)
      const asset = tx.insert(assets).values({ tag, typeId: types[typeName]!, serial: serial(prefix), createdAt }).returning().get()
      audit(tx, createdAt, who, 'create', 'asset', asset.id, `${tag} · ${typeName}`)
      tx.insert(conditions).values({ assetId: asset.id, kind: 'intake', ratingId: ratings.New!, assessedById: priya!.employeeId, recordedById: who.id, recordedAt: createdAt }).run()

      let cursor = createdAt.getTime()
      const cycle = (holder: (typeof people)[number], issuedAt: Date, returnedAt: Date | null, issueRating: string, returnRating?: string) => {
        const issuer = pick(actors)
        const a = tx.insert(assignments).values({ assetId: asset.id, employeeId: holder.id, issuedAt, returnedAt, issuedById: issuer.id, returnedById: returnedAt ? pick(actors).id : null }).returning().get()
        tx.insert(conditions).values({ assetId: asset.id, assignmentId: a.id, kind: 'issue', ratingId: ratings[issueRating]!, assessedById: priya!.employeeId, recordedById: issuer.id, recordedAt: issuedAt }).run()
        audit(tx, issuedAt, issuer, 'issue', 'assignment', a.id, `${tag} → ${holder.code} · ${issueRating}`)
        if (returnedAt && returnRating) {
          const closer = pick(actors)
          tx.insert(conditions).values({ assetId: asset.id, assignmentId: a.id, kind: 'return', ratingId: ratings[returnRating]!, assessedById: marcus!.employeeId, notes: returnRating === 'Poor' || returnRating === 'Damaged' ? 'Heavy wear; keys and casing worn.' : null, recordedById: closer.id, recordedAt: returnedAt }).run()
          audit(tx, returnedAt, closer, 'return', 'assignment', a.id, `${tag} ← ${holder.code} · ${returnRating}`)
        }
      }

      // 0-2 earlier, closed assignments.
      const earlier = rand() < 0.45 ? int(1, 2) : 0
      for (let i = 0; i < earlier; i++) {
        const issued = new Date(cursor + int(5, 60) * DAY)
        const returned = new Date(issued.getTime() + int(30, 240) * DAY)
        if (returned.getTime() > now - 20 * DAY) break
        cycle(pick(people), issued, returned, i === 0 ? 'New' : 'Good', pick(['Good', 'Good', 'Fair', 'Poor']))
        cursor = returned.getTime()
      }

      const roll = rand()
      if (roll < 0.07) {
        // Retired: last seen in poor shape. The last assignment starts after everything before it (the asset's arrival or its last
        // return, both at least 20 days back) and ends before today, however young the asset is.
        const issued = new Date(cursor + Math.min(20 * DAY, (now - cursor) / 2))
        const returned = new Date(Math.min(issued.getTime() + 90 * DAY, now - 2 * DAY))
        cycle(pick(people), issued, returned, 'Good', 'Damaged')
        tx.update(assets).set({ status: 'retired' }).where(eq(assets.id, asset.id)).run()
        audit(tx, new Date(returned.getTime() + DAY), priya!, 'update', 'asset', asset.id, `${tag} · status: in_service → retired`)
      } else if (roll < 0.66) {
        const longest = rand() < 0.14
        const out = longest ? int(380, 800) : int(8, 360)
        const issued = new Date(Math.max(now - out * DAY, cursor + DAY))
        cycle(pick(active), issued, null, pick(['New', 'Good', 'Good']))
      } else shelf.push({ id: asset.id, tag, since: cursor })
    }
  }
})

// Programs, some of them holding equipment off the shelf. Done after the fleet so the fleet comes out the same as it always has.
let programCount = 0
let seatCount = 0
db.transaction((tx) => {
  const sites = PROGRAMS.map(([code, name, address, isActive], i) => {
    const createdAt = daysAgo(700 - i * 40)
    const program = tx.insert(programs).values({ code, name, address, isActive, createdAt }).returning().get()
    audit(tx, createdAt, priya!, 'create', 'program', program.id, `program_id=${code} · ${name}`)
    programCount += 1
    return program
  })
  const open = sites.filter((p) => p.isActive)
  const closed = sites.find((p) => !p.isActive)!
  const hold = (item: (typeof shelf)[number], program: (typeof sites)[number], issuedAt: Date, returnedAt: Date | null) => {
    const issuer = pick(actors)
    const a = tx.insert(assignments).values({ assetId: item.id, programId: program.id, issuedAt, returnedAt, issuedById: issuer.id, returnedById: returnedAt ? issuer.id : null }).returning().get()
    tx.insert(conditions).values({ assetId: item.id, assignmentId: a.id, kind: 'issue', ratingId: ratings.Good!, assessedById: priya!.employeeId, recordedById: issuer.id, recordedAt: issuedAt }).run()
    audit(tx, issuedAt, issuer, 'issue', 'assignment', a.id, `${item.tag} → program ${program.code} · Good`)
    if (!returnedAt) return
    tx.insert(conditions).values({ assetId: item.id, assignmentId: a.id, kind: 'return', ratingId: ratings.Fair!, assessedById: marcus!.employeeId, recordedById: issuer.id, recordedAt: returnedAt }).run()
    audit(tx, returnedAt, issuer, 'return', 'assignment', a.id, `${item.tag} ← program ${program.code} · Fair`)
  }
  // The closed program held one device and gave it back, which is why it was deactivated and not deleted.
  const first = shelf.shift()
  if (first) {
    const issued = new Date(first.since + (now - first.since) / 3)
    const returned = new Date(first.since + ((now - first.since) * 2) / 3)
    hold(first, closed, issued, returned)
    audit(tx, new Date(returned.getTime() + 3_600_000), priya!, 'update', 'program', closed.id, `program_id=${closed.code} · deactivated`)
  }
  for (const item of shelf.splice(0, 12)) hold(item, pick(open), new Date(item.since + (now - item.since) * (0.2 + rand() * 0.7)), null)

  // Digital assets: one row per seat, most of them with someone.
  let holderIndex = 0
  for (const [typeName, count, account] of SEATS) {
    const createdAt = daysAgo(int(200, 600))
    const type = tx.insert(digitalAssetTypes).values({ name: typeName, createdAt }).returning().get()
    audit(tx, createdAt, priya!, 'create', 'digitalassettype', type.id, typeName)
    for (let n = 1; n <= count; n++) {
      const addedAt = new Date(createdAt.getTime() + int(1, 30) * DAY)
      const who = pick(actors)
      const roll = rand()
      const holder = roll < 0.72 ? active[holderIndex++ % active.length]! : undefined
      const seat = tx.insert(digitalAssets).values({ code: `pending-${typeName}-${n}`, typeId: type.id, account: account(n, holder), status: roll > 0.93 ? 'inactive' : 'in_service', createdAt: addedAt }).returning().get()
      const code = `DA-${String(seat.id).padStart(5, '0')}`
      tx.update(digitalAssets).set({ code }).where(eq(digitalAssets.id, seat.id)).run()
      audit(tx, addedAt, who, 'create', 'digitalasset', seat.id, `${code} · ${typeName} · ${seat.account}`)
      seatCount += 1
      let from = addedAt.getTime() + DAY
      if (rand() < 0.3) {
        // Someone had this seat before and gave it up.
        const earlier = pick(people)
        const issuedAt = new Date(from + int(1, 20) * DAY)
        const returnedAt = new Date(issuedAt.getTime() + int(20, 90) * DAY)
        tx.insert(digitalAssignments).values({ digitalAssetId: seat.id, employeeId: earlier.id, issuedAt, returnedAt, issuedById: who.id, returnedById: who.id }).run()
        audit(tx, issuedAt, who, 'issue', 'digitalasset', seat.id, `${code} → ${earlier.code} · ${typeName}`)
        audit(tx, returnedAt, who, 'return', 'digitalasset', seat.id, `${code} ← ${earlier.code} · ${typeName}`)
        from = returnedAt.getTime()
      }
      if (seat.status === 'inactive') audit(tx, new Date(from + (now - from) / 2), who, 'update', 'digitalasset', seat.id, `${code} · marked inactive`)
      if (!holder) continue
      const issuedAt = new Date(from + (now - from) * (0.1 + rand() * 0.8))
      tx.insert(digitalAssignments).values({ digitalAssetId: seat.id, employeeId: holder.id, issuedAt, issuedById: who.id }).run()
      audit(tx, issuedAt, who, 'issue', 'digitalasset', seat.id, `${code} → ${holder.code} · ${typeName}`)
    }
  }
})

const grievanceCount = seedGrievances(db, now, byCode, { priya: priya!, marcus: marcus! })

console.log(
  `Seeded ${people.length} employees, ${programCount} programs, ${tagNumber} physical assets, ${seatCount} digital assets, ${grievanceCount} grievances and 5 users into ${file}`,
)
console.log(`Sign in as p.raghunathan@bphs.local (Super Admin) or m.oyelaran@bphs.local (Admin), password: ${PASSWORD}`)
sqlite.close()
