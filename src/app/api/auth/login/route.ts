import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSessionToken, COOKIE_OPTIONS, COOKIE_NAMES, LEGACY_ADMIN_USER_ID } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { checkRateLimit, routeKey } from '@/lib/rateLimit'

const loginSchema = z.object({
  username: z.string().trim().max(32).optional(),
  password: z.string().min(1).max(128),
})

const INVALID = { error: 'Invalid username or password' }

// Throwaway hash (random password, discarded) — verified against when the
// username doesn't exist so unknown-user and wrong-password paths cost the
// same scrypt work, closing the timing side channel for enumeration.
const DUMMY_HASH =
  'scrypt$16384$8$1$fbb3e27ab66a5c70b3641da23f069a26$f3ea4edbeafe49cc2f9a06775483541a1440afe8b06990f2bedf25927b2c57fd432a4106698784cbd140f8b501e1ffe2325ae14c2ce566d3e734c682c9112a3a'

// Length-independent string compare (hash both sides, timingSafeEqual digests)
function constantTimeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest()
  const db = createHash('sha256').update(b).digest()
  return timingSafeEqual(da, db)
}

export async function POST(request: Request) {
  const rate = checkRateLimit(routeKey(request, 'login'), 10, 60_000)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts — try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    )
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { username, password } = parsed.data
  const cookieStore = await cookies() // MUST await in Next.js 16

  // Legacy bootstrap: no username + admin password, only while ALLOW_LEGACY_LOGIN=true.
  // Lets the admin self-assign an account before any credentials exist; see DEPLOYMENT.md.
  if (!username) {
    if (
      process.env.ALLOW_LEGACY_LOGIN === 'true' &&
      process.env.ADMIN_PASSWORD &&
      constantTimeEqual(password, process.env.ADMIN_PASSWORD)
    ) {
      const token = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
      cookieStore.set(COOKIE_NAMES.session, token, COOKIE_OPTIONS)
      return NextResponse.json({ success: true, redirect: '/admin' })
    }
    return NextResponse.json(INVALID, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } })
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user?.passwordHash || !ok) {
    // Single generic 401 — do not reveal whether the username exists
    return NextResponse.json(INVALID, { status: 401 })
  }

  // schema stores role as a free String (SQLite has no enums) — coerce
  // defensively; anything unexpected degrades to MEMBER, never to ADMIN
  const role = user.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'
  const token = await createSessionToken(user.id, role)
  cookieStore.set(COOKIE_NAMES.session, token, COOKIE_OPTIONS)
  return NextResponse.json({ success: true, redirect: role === 'ADMIN' ? '/admin' : '/' })
}
