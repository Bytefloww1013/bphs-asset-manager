// What a digital asset tells the employee it is issued to, through the account linked to them.
import { notifications } from '#foundation/notifications/server/index.ts'
import { describe, expect, it } from 'vitest'
import { setup } from '#kernel/testing/index.ts'
import { digitalAssetTypes } from './schema.ts'
import { createDigitalAsset, issueDigitalAsset } from './service.ts'

type T = Awaited<ReturnType<typeof setup>>

const rowsOf = (t: T, userId: number) =>
  t.db
    .select()
    .from(notifications)
    .orderBy(notifications.id)
    .all()
    .filter((row) => row.userId === userId)

describe('digital assets issued to you', () => {
  it('tells the holder when a digital asset is issued, on creation or later', async () => {
    const t = await setup()
    const typeId = t.db.insert(digitalAssetTypes).values({ name: 'Microsoft 365' }).returning().get().id
    const made = createDigitalAsset(t.db, t.adminUser, { typeId, account: 'priya@bphs.org', employeeId: t.person.id })
    const later = createDigitalAsset(t.db, t.adminUser, { typeId, account: 'spare@bphs.org' })
    issueDigitalAsset(t.db, t.adminUser, later.id, { employeeId: t.person.id })
    expect(rowsOf(t, t.superUser.id)).toMatchObject([
      {
        kind: 'digital_issued',
        sourceKey: `digital:${made.id}`,
        title: `${made.code} was issued to you`,
        body: 'Microsoft 365, issued by Marcus Oyelaran.',
        link: '/digital-assets',
      },
      { kind: 'digital_issued', sourceKey: `digital:${later.id}`, title: `${later.code} was issued to you` },
    ])
  })
})
