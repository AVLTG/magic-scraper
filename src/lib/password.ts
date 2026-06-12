// scrypt password hashing — Node runtime ONLY (API routes / scripts).
// Never import from middleware/Edge code; crypto.scrypt does not exist there.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>

// 128 * N * r * p must stay under Node's default scrypt maxmem (32MB);
// 16384 * 8 * 1 = 16MB. If raising N past 32768, pass an explicit maxmem option.
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

// Upper bounds when re-deriving from stored params — a tampered row must not
// be able to make scrypt allocate unbounded memory/CPU on login.
const MAX_N = 1 << 17
const MAX_R = 32
const MAX_P = 4

// Stored format: scrypt$N$r$p$<saltHex>$<hashHex>
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const n = parseInt(parts[1], 10)
    const r = parseInt(parts[2], 10)
    const p = parseInt(parts[3], 10)
    const salt = Buffer.from(parts[4], 'hex')
    const expected = Buffer.from(parts[5], 'hex')
    if (!n || !r || !p || salt.length === 0 || expected.length === 0) return false
    if (n > MAX_N || r > MAX_R || p > MAX_P) return false
    const actual = await scrypt(password, salt, expected.length, { N: n, r, p })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
