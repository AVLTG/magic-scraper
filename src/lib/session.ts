// Reads the current session in Node API routes (server-side, via next/headers).
// Middleware already gates routes; use this for role re-checks and createdBy attribution.
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_NAMES, verifySessionToken, LEGACY_ADMIN_USER_ID, type SessionRole } from '@/lib/auth'

export interface CurrentSession {
  userId: string
  role: SessionRole
  isLegacyAdmin: boolean
}

export async function getSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies() // MUST await in Next.js 16
  const cookie = cookieStore.get(COOKIE_NAMES.session)
  if (!cookie) return null
  const payload = await verifySessionToken(cookie.value)
  if (!payload) return null
  return { ...payload, isLegacyAdmin: payload.userId === LEGACY_ADMIN_USER_ID }
}

// In-handler admin guard for /api/admin/* routes (defense in depth — the proxy
// already gates these, but routes must not trust the proxy alone). Returns a
// discriminated union so callers do: `const auth = await requireAdmin(); if
// (!auth.ok) return auth.response`.
export async function requireAdmin(): Promise<
  { ok: true; session: CurrentSession } | { ok: false; response: NextResponse }
> {
  const session = await getSession()
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (session.role !== 'ADMIN') {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { ok: true, session }
}
