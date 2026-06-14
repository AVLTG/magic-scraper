process.env.COOKIE_SECRET = 'test-secret-for-require-admin-32chars!!'

let cookieValue: string | undefined
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockImplementation(async () => ({
    get: (name: string) =>
      name === 'session' && cookieValue !== undefined ? { name, value: cookieValue } : undefined,
  })),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}))

import { requireAdmin } from '@/lib/session'
import { createSessionToken, LEGACY_ADMIN_USER_ID } from '@/lib/auth'

describe('requireAdmin (in-handler admin guard)', () => {
  it('401s when there is no session cookie', async () => {
    cookieValue = undefined
    const auth = await requireAdmin()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect((auth.response as unknown as { status: number }).status).toBe(401)
  })

  it('403s a MEMBER session', async () => {
    cookieValue = await createSessionToken('u1', 'MEMBER')
    const auth = await requireAdmin()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect((auth.response as unknown as { status: number }).status).toBe(403)
  })

  it('allows an ADMIN session and returns it', async () => {
    cookieValue = await createSessionToken('u-admin', 'ADMIN')
    const auth = await requireAdmin()
    expect(auth.ok).toBe(true)
    if (auth.ok) expect(auth.session).toEqual({ userId: 'u-admin', role: 'ADMIN', isLegacyAdmin: false })
  })

  it('allows the legacy bootstrap admin (role ADMIN)', async () => {
    cookieValue = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
    const auth = await requireAdmin()
    expect(auth.ok).toBe(true)
    if (auth.ok) expect(auth.session.isLegacyAdmin).toBe(true)
  })
})
