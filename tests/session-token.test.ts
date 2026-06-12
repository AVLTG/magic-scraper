process.env.COOKIE_SECRET = 'test-secret-for-session-tests-32char!'

import { createSessionToken, verifySessionToken, LEGACY_ADMIN_USER_ID } from '@/lib/auth'

describe('session tokens', () => {
  it('round-trips a MEMBER session', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER')
    const payload = await verifySessionToken(token)
    expect(payload).toEqual({ userId: 'user_abc123', role: 'MEMBER' })
  })

  it('round-trips an ADMIN session including the legacy sentinel', async () => {
    const token = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
    const payload = await verifySessionToken(token)
    expect(payload).toEqual({ userId: LEGACY_ADMIN_USER_ID, role: 'ADMIN' })
  })

  it('rejects an expired token', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER', -10)
    expect(await verifySessionToken(token)).toBeNull()
  })

  it('rejects a tampered role', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER')
    const tampered = token.replace('.MEMBER.', '.ADMIN.')
    expect(await verifySessionToken(tampered)).toBeNull()
  })

  it('rejects a tampered userId', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER')
    const tampered = token.replace('user_abc123', 'user_evil99')
    expect(await verifySessionToken(tampered)).toBeNull()
  })

  it('rejects malformed values', async () => {
    for (const bad of ['', 'v1', 'garbage', 'v2.a.MEMBER.123.abc', 'v1.a.OTHER.123.abc', 'v1.a.MEMBER.notanum.abc']) {
      expect(await verifySessionToken(bad)).toBeNull()
    }
  })
})
