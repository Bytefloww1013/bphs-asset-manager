import { assignments } from '#foundation/assignments/server/index.ts'
import type { programs } from '#foundation/programs/server/index.ts'
import type { DbLike } from '#kernel/db/client.ts'
import type { SeedKit } from '#kernel/modules.ts'
import { eq } from 'drizzle-orm'
import { assetBrands, assets, assetTypes, conditionRatings, conditions } from './schema.ts'

// Demo data for `bun run db:seed` (the module's `seed`): a made-up fleet, then the programs, some of them holding part of it.

type Program = typeof programs.$inferSelect

const DAY = 86_400_000

/**
 * The fleet: 116 assets with their intake, earlier assignments and what each holds today. Then the programs (`kit.programs`),
 * with some of the assets nobody holds (the shelf) issued to them. Returns how many assets there are.
 */
export function seedAssets(db: DbLike, kit: SeedKit): number {
  const { now, rand, int, pick, deviceRand, devicePick, daysAgo, audit, people, active, actors, priya, marcus } = kit
  const types = Object.fromEntries(
    db
      .select()
      .from(assetTypes)
      .all()
      .map((t) => [t.name, t.id]),
  ) as Record<string, number>
  const brands = Object.fromEntries(
    db
      .select()
      .from(assetBrands)
      .all()
      .filter((b) => b.isActive)
      .map((b) => [b.name, b.id]),
  ) as Record<string, number>

  /** Brand and model choices per type. A null model is a device nobody wrote the model down for. */
  const MODELS: Record<string, [string, (string | null)[]][]> = {
    Laptop: [
      ['Dell', ['Latitude 5440', 'Latitude 7440', null]],
      ['Lenovo', ['ThinkPad T14 Gen 4', 'ThinkPad E14']],
      ['HP', ['EliteBook 840 G10', 'ProBook 450 G9']],
      ['Apple', ['MacBook Air 13 M2']],
    ],
    Phone: [
      ['Apple', ['iPhone 13', 'iPhone 14', 'iPhone SE (3rd gen)']],
      ['Samsung', ['Galaxy A54', 'Galaxy S23', null]],
    ],
    Monitor: [
      ['Dell', ['P2422H', 'P2723DE', null]],
      ['HP', ['E24 G5']],
      ['Samsung', ['S24C450', null]],
    ],
    Keyboard: [
      ['Logitech', ['K120', 'MK270', null]],
      ['Microsoft', ['Wired Keyboard 600', null]],
    ],
    Mouse: [
      ['Logitech', ['M90', 'M185', null]],
      ['Microsoft', ['Basic Optical Mouse', null]],
    ],
  }

  /** Laptops and phones are joined to Entra, so most carry its device ObjectId; a few were never enrolled. */
  const ENROLLED = new Set(['Laptop', 'Phone'])
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(deviceRand() * 16).toString(16)).join('')
  const objectId = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${devicePick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`

  const ratings = Object.fromEntries(
    db
      .select()
      .from(conditionRatings)
      .all()
      .map((r) => [r.name, r.id]),
  ) as Record<string, number>

  const FLEET: [string, number, string, string][] = [
    // type, count, serial prefix, tag prefix start
    ['Laptop', 34, '5CD', 'L'],
    ['Phone', 26, 'F1', 'P'],
    ['Monitor', 28, 'CN0', 'M'],
    ['Keyboard', 16, 'KB-', 'K'],
    ['Mouse', 12, 'MS-', 'O'],
  ]

  /** Physical assets left in service with nobody holding them, and when each last came back. */
  const shelf: { id: number; tag: string; since: number }[] = []

  const serial = (prefix: string) =>
    `${prefix}${int(1000, 9999)}${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}${int(10, 99)}`

  let tagNumber = 0
  db.transaction((tx) => {
    for (const [typeName, count, prefix] of FLEET) {
      for (let n = 0; n < count; n++) {
        tagNumber += 1
        const tag = `BPHS-${String(tagNumber).padStart(4, '0')}`
        const createdAt = daysAgo(int(120, 880))
        const who = pick(actors)
        const [brandName, models] = devicePick(MODELS[typeName]!)
        const model = devicePick(models)
        const entraObjectId = ENROLLED.has(typeName) && deviceRand() < 0.85 ? objectId() : null
        const asset = tx
          .insert(assets)
          .values({
            tag,
            typeId: types[typeName]!,
            brandId: brands[brandName]!,
            model,
            entraObjectId,
            serial: serial(prefix),
            createdAt,
          })
          .returning()
          .get()
        const details = [tag, typeName, model ? `${brandName} ${model}` : brandName]
        if (entraObjectId) details.push(`Entra ObjectId ${entraObjectId}`)
        audit(tx, createdAt, who, 'create', 'asset', asset.id, details.join(' · '))
        tx.insert(conditions)
          .values({
            assetId: asset.id,
            kind: 'intake',
            ratingId: ratings.New!,
            assessedById: priya.employeeId,
            recordedById: who.id,
            recordedAt: createdAt,
          })
          .run()

        let cursor = createdAt.getTime()
        const cycle = (
          holder: (typeof people)[number],
          issuedAt: Date,
          returnedAt: Date | null,
          issueRating: string,
          returnRating?: string,
        ) => {
          const issuer = pick(actors)
          const a = tx
            .insert(assignments)
            .values({
              kind: 'asset',
              itemId: asset.id,
              employeeId: holder.id,
              issuedAt,
              returnedAt,
              issuedById: issuer.id,
              returnedById: returnedAt ? pick(actors).id : null,
            })
            .returning()
            .get()
          tx.insert(conditions)
            .values({
              assetId: asset.id,
              assignmentId: a.id,
              kind: 'issue',
              ratingId: ratings[issueRating]!,
              assessedById: priya.employeeId,
              recordedById: issuer.id,
              recordedAt: issuedAt,
            })
            .run()
          audit(tx, issuedAt, issuer, 'issue', 'assignment', a.id, `${tag} → ${holder.code} · ${issueRating}`)
          if (returnedAt && returnRating) {
            const closer = pick(actors)
            tx.insert(conditions)
              .values({
                assetId: asset.id,
                assignmentId: a.id,
                kind: 'return',
                ratingId: ratings[returnRating]!,
                assessedById: marcus.employeeId,
                notes:
                  returnRating === 'Poor' || returnRating === 'Damaged' ? 'Heavy wear; keys and casing worn.' : null,
                recordedById: closer.id,
                recordedAt: returnedAt,
              })
              .run()
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
          audit(
            tx,
            new Date(returned.getTime() + DAY),
            priya,
            'update',
            'asset',
            asset.id,
            `${tag} · status: in_service → retired`,
          )
        } else if (roll < 0.66) {
          const longest = rand() < 0.14
          const out = longest ? int(380, 800) : int(8, 360)
          const issued = new Date(Math.max(now - out * DAY, cursor + DAY))
          cycle(pick(active), issued, null, pick(['New', 'Good', 'Good']))
        } else shelf.push({ id: asset.id, tag, since: cursor })
      }
    }
  })

  const hold = (
    tx: DbLike,
    item: (typeof shelf)[number],
    program: Program,
    issuedAt: Date,
    returnedAt: Date | null,
  ) => {
    const issuer = pick(actors)
    const a = tx
      .insert(assignments)
      .values({
        kind: 'asset',
        itemId: item.id,
        programId: program.id,
        issuedAt,
        returnedAt,
        issuedById: issuer.id,
        returnedById: returnedAt ? issuer.id : null,
      })
      .returning()
      .get()
    tx.insert(conditions)
      .values({
        assetId: item.id,
        assignmentId: a.id,
        kind: 'issue',
        ratingId: ratings.Good!,
        assessedById: priya.employeeId,
        recordedById: issuer.id,
        recordedAt: issuedAt,
      })
      .run()
    audit(tx, issuedAt, issuer, 'issue', 'assignment', a.id, `${item.tag} → program ${program.code} · Good`)
    if (!returnedAt) return
    tx.insert(conditions)
      .values({
        assetId: item.id,
        assignmentId: a.id,
        kind: 'return',
        ratingId: ratings.Fair!,
        assessedById: marcus.employeeId,
        recordedById: issuer.id,
        recordedAt: returnedAt,
      })
      .run()
    audit(tx, returnedAt, issuer, 'return', 'assignment', a.id, `${item.tag} ← program ${program.code} · Fair`)
  }

  // Programs, some of them holding equipment off the shelf. Done after the fleet so the fleet comes out the same as it always has.
  db.transaction((tx) => {
    const sites = kit.programs(tx)
    const open = sites.filter((p) => p.isActive)
    const closed = sites.find((p) => !p.isActive)!
    // The closed program held one device and gave it back, which is why it was deactivated and not deleted.
    const first = shelf.shift()
    if (first) {
      const issued = new Date(first.since + (now - first.since) / 3)
      const returned = new Date(first.since + ((now - first.since) * 2) / 3)
      hold(tx, first, closed, issued, returned)
      audit(
        tx,
        new Date(returned.getTime() + 3_600_000),
        priya,
        'update',
        'program',
        closed.id,
        `program_id=${closed.code} · deactivated`,
      )
    }
    for (const item of shelf.splice(0, 12))
      hold(tx, item, pick(open), new Date(item.since + (now - item.since) * (0.2 + rand() * 0.7)), null)
  })

  return tagNumber
}
