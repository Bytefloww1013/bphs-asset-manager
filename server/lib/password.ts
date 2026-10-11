import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 64
const OPTIONS: ScryptOptions = { N, r: R, p: P, maxmem: 128 * N * R * 2 }

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, options, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

/** scrypt$N$r$p$salt$hash (base64). Parameters are stored so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, OPTIONS)
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 }
  const actual = await derive(password, Buffer.from(salt, 'base64'), params)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

let decoy: Promise<string> | undefined
/** Burn the same time as a real check so unknown emails are not distinguishable by latency. */
export async function verifyDecoy(password: string): Promise<void> {
  decoy ??= hashPassword('decoy-password-never-used')
  await verifyPassword(password, await decoy)
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SPECIAL = '!@#$%&*?'

function pick(set: string): string {
  const bytes = randomBytes(4).readUInt32BE(0)
  return set[bytes % set.length]!
}

/** A readable one-time password that satisfies the password policy. */
export function generateOneTimePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)]
  const all = LOWER + UPPER + DIGITS
  while (chars.length < 14) chars.push(pick(all))
  // Fisher-Yates with crypto randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}
