process.env.COOKIE_SECRET = 'test-secret-for-sess-helper-32chars!!'

let cookieValue: string | undefined
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockImplementation(async () => ({
    get: (name: string) =>
      name === 'session' && cookieValue !== undefined ? { name, value: cookieValue } : undefined,
  })),
}))

import { getSession } from '@/lib/session'
import { createSessionToken, LEGACY_ADMIN_USER_ID, COOKIE_NAMES } from '@/lib/auth'

describe('getSession', () => {
  it("mock cookie name stays in sync with COOKIE_NAMES.session", () => {
    // The jest.mock factory above can't reference imports, so it hard-codes
    // 'session' — this assertion fails loudly if the cookie name ever changes.
    expect(COOKIE_NAMES.session).toBe('session')
  })

  it('returns payload with isLegacyAdmin=false for a real user', async () => {
    cookieValue = await createSessionToken('user_1', 'MEMBER')
    expect(await getSession()).toEqual({ userId: 'user_1', role: 'MEMBER', isLegacyAdmin: false })
  })

  it('flags the legacy admin sentinel', async () => {
    cookieValue = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
    expect(await getSession()).toEqual({ userId: LEGACY_ADMIN_USER_ID, role: 'ADMIN', isLegacyAdmin: true })
  })

  it('returns null when cookie missing or invalid', async () => {
    cookieValue = undefined
    expect(await getSession()).toBeNull()
    cookieValue = 'garbage'
    expect(await getSession()).toBeNull()
  })
})
