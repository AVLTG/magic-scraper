// Reads the current session in Node API routes (server-side, via next/headers).
// Middleware already gates routes; use this for role re-checks and createdBy attribution.
import { cookies } from 'next/headers'
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
