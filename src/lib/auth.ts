// Uses Web Crypto API (crypto.subtle) — compatible with Next.js Edge Runtime (middleware)
// and Node.js 18+ (API routes, tests)

const SECRET = process.env.COOKIE_SECRET!

export const COOKIE_NAMES = {
  session: 'session',
  adminSession: 'admin_session',
} as const

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (!SECRET) throw new Error('COOKIE_SECRET env var is not set')
  if (cachedKey) return cachedKey
  cachedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
  return cachedKey
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return buf
}

export async function signCookie(cookieName: string): Promise<string> {
  const key = await getKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(cookieName))
  return bytesToHex(sig)
}

export async function verifyHmac(value: string, cookieName: string): Promise<boolean> {
  try {
    const key = await getKey()
    return crypto.subtle.verify('HMAC', key, hexToBytes(value), new TextEncoder().encode(cookieName))
  } catch {
    return false
  }
}

export type SessionRole = 'ADMIN' | 'MEMBER'
export interface SessionPayload {
  userId: string
  role: SessionRole
}

// Sentinel for the env-gated legacy bootstrap login (no DB row backs it)
export const LEGACY_ADMIN_USER_ID = '__legacy_admin__'

// Token format: v1.<userId>.<role>.<expUnixSeconds>.<hexHmac>
// userId is a cuid / sentinel (no dots), so '.' is a safe delimiter.
export async function createSessionToken(
  userId: string,
  role: SessionRole,
  maxAgeSeconds: number = COOKIE_OPTIONS.maxAge
): Promise<string> {
  // '.' is the payload delimiter — a dotted userId would produce an unverifiable token
  if (!userId || userId.includes('.')) throw new Error('userId must be non-empty and must not contain "."')
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds
  const base = `v1.${userId}.${role}.${exp}`
  const key = await getKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base))
  return `${base}.${bytesToHex(sig)}`
}

export async function verifySessionToken(value: string): Promise<SessionPayload | null> {
  try {
    const parts = value.split('.')
    if (parts.length !== 5 || parts[0] !== 'v1') return null
    const [, userId, role, expStr, sig] = parts
    if (!userId || (role !== 'ADMIN' && role !== 'MEMBER')) return null
    if (!/^\d+$/.test(expStr)) return null
    if (parseInt(expStr, 10) * 1000 < Date.now()) return null
    const base = `v1.${userId}.${role}.${expStr}`
    const key = await getKey()
    const ok = await crypto.subtle.verify('HMAC', key, hexToBytes(sig), new TextEncoder().encode(base))
    return ok ? { userId, role } : null
  } catch {
    return null
  }
}
