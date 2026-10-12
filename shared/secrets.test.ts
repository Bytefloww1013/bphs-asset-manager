import { describe, expect, it } from 'vitest'
import { digitalAssetCreateSchema } from './schemas.ts'
import { looksLikeSecret } from './secrets.ts'

describe('looksLikeSecret', () => {
  it('catches a value that labels itself as a credential', () => {
    for (const value of [
      'password: hunter2',
      'Password=hunter2',
      'j.doe@bphs.org pwd:hunter2',
      'j.doe@bphs.org / PWD = hunter2',
      'secret: abc',
      'token=eyJhbGciOi',
      'key: ABCD-1234',
      'License key: ABCD-1234',
      'api_key=sk-123',
      'KEY   :x',
    ]) {
      expect(looksLikeSecret(value), value).toBe(true)
    }
  })

  it('lets an email address or a licence reference through', () => {
    for (const value of [
      'j.doe@bphs.org',
      'keyla.monkey@bphs.org',
      'tokens@bphs.org',
      'Seat 14 of 25',
      'Relias licence REL-2291',
      'Zoho CRM: j.doe@bphs.org',
      'Power BI Pro, key account',
      'turnkey: north office',
    ]) {
      expect(looksLikeSecret(value), value).toBe(false)
    }
  })

  it('is what the License/Account field refuses, and says why', () => {
    const bad = digitalAssetCreateSchema.safeParse({ typeId: 1, account: 'j.doe@bphs.org password: hunter2' })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.path).toEqual(['account'])
    expect(bad.error?.issues[0]?.message).toMatch(/never a password or key/i)
    expect(digitalAssetCreateSchema.safeParse({ typeId: 1, account: ' j.doe@bphs.org ' }).data?.account).toBe('j.doe@bphs.org')
    expect(digitalAssetCreateSchema.safeParse({ typeId: 1, account: 'x'.repeat(201) }).success).toBe(false)
  })
})
