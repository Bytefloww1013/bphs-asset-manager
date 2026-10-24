import { assignments } from '#foundation/assignments/server/index.ts'
import type { DbLike } from '#kernel/db/client.ts'
import type { SeedKit } from '#kernel/modules.ts'
import { eq } from 'drizzle-orm'
import { digitalAssets, digitalAssetTypes } from './schema.ts'

// Demo data for `bun run db:seed` (the module's `seed`): made-up licence and account seats, after the physical assets.

const DAY = 86_400_000

/** Digital asset type, how many seats, and what a seat's License/Account looks like. */
const SEATS: [string, number, (n: number, holder?: { firstName: string; lastName: string }) => string][] = [
  [
    'Microsoft 365',
    12,
    (n, h) => (h ? `${h.firstName[0]}.${h.lastName}@bphs.example`.toLowerCase() : `spare${n}@bphs.example`),
  ],
  ['Adobe Acrobat Pro', 5, (n) => `Team licence, seat ${n}`],
  [
    'Client records system',
    8,
    (n, h) => (h ? `${h.firstName[0]}${h.lastName}`.toLowerCase().replace(/[^a-z]/g, '') : `unassigned-${n}`),
  ],
  ['Zoom', 4, (n) => `Licensed host ${n}`],
  ['Accounting software', 3, (n) => `Named user ${n}`],
]

/** Seeds the digital asset types and their seats, with their custody history, and says how many seats there are. */
export function seedDigitalAssets(
  tx: DbLike,
  { now, rand, int, pick, daysAgo, audit, people, active, actors, priya }: SeedKit,
): number {
  let seats = 0
  let holderIndex = 0
  for (const [typeName, count, account] of SEATS) {
    const createdAt = daysAgo(int(200, 600))
    const type = tx.insert(digitalAssetTypes).values({ name: typeName, createdAt }).returning().get()
    audit(tx, createdAt, priya, 'create', 'digitalassettype', type.id, typeName)
    for (let n = 1; n <= count; n++) {
      const addedAt = new Date(createdAt.getTime() + int(1, 30) * DAY)
      const who = pick(actors)
      const roll = rand()
      const holder = roll < 0.72 ? active[holderIndex++ % active.length]! : undefined
      const seat = tx
        .insert(digitalAssets)
        .values({
          code: `pending-${typeName}-${n}`,
          typeId: type.id,
          account: account(n, holder),
          status: roll > 0.93 ? 'inactive' : 'in_service',
          createdAt: addedAt,
        })
        .returning()
        .get()
      const code = `DA-${String(seat.id).padStart(5, '0')}`
      tx.update(digitalAssets).set({ code }).where(eq(digitalAssets.id, seat.id)).run()
      audit(tx, addedAt, who, 'create', 'digitalasset', seat.id, `${code} · ${typeName} · ${seat.account}`)
      seats += 1
      let from = addedAt.getTime() + DAY
      if (rand() < 0.3) {
        // Someone had this seat before and gave it up.
        const earlier = pick(people)
        const issuedAt = new Date(from + int(1, 20) * DAY)
        const returnedAt = new Date(issuedAt.getTime() + int(20, 90) * DAY)
        tx.insert(assignments)
          .values({
            kind: 'digital-asset',
            itemId: seat.id,
            employeeId: earlier.id,
            issuedAt,
            returnedAt,
            issuedById: who.id,
            returnedById: who.id,
          })
          .run()
        audit(tx, issuedAt, who, 'issue', 'digitalasset', seat.id, `${code} → ${earlier.code} · ${typeName}`)
        audit(tx, returnedAt, who, 'return', 'digitalasset', seat.id, `${code} ← ${earlier.code} · ${typeName}`)
        from = returnedAt.getTime()
      }
      if (seat.status === 'inactive')
        audit(
          tx,
          new Date(from + (now - from) / 2),
          who,
          'update',
          'digitalasset',
          seat.id,
          `${code} · marked inactive`,
        )
      if (!holder) continue
      const issuedAt = new Date(from + (now - from) * (0.1 + rand() * 0.8))
      tx.insert(assignments)
        .values({ kind: 'digital-asset', itemId: seat.id, employeeId: holder.id, issuedAt, issuedById: who.id })
        .run()
      audit(tx, issuedAt, who, 'issue', 'digitalasset', seat.id, `${code} → ${holder.code} · ${typeName}`)
    }
  }
  return seats
}
