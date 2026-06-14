process.env.COOKIE_SECRET = 'test-secret-for-login-tests-32chars!!'
process.env.ADMIN_PASSWORD = 'test-admin-password-stronger'

const mockCookieSet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ set: mockCookieSet }),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

const mockFindUnique = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: any[]) => mockFindUnique(...args) } },
}))

import { POST } from '../src/app/api/auth/login/route'
import { verifySessionToken, LEGACY_ADMIN_USER_ID } from '@/lib/auth'
import { hashPassword } from '@/lib/password'

let ipCounter = 0
function makeRequest(body: Record<string, unknown>): Request {
  // unique IP per call so the rate limiter never interferes across tests
  ipCounter += 1
  return {
    json: async () => body,
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) },
  } as unknown as Request
}

describe('login route (per-user)', () => {
  beforeEach(() => {
    mockCookieSet.mockClear()
    mockFindUnique.mockReset()
    delete process.env.ALLOW_LEGACY_LOGIN
  })

  it('logs in a valid user and sets a session token bound to userId+role', async () => {
    const passwordHash = await hashPassword('goodpass1')
    mockFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', passwordHash, role: 'MEMBER' })
    const result = await POST(makeRequest({ username: 'Alice', password: 'goodpass1' }))
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { username: 'alice' } })
    expect((result as any).body).toEqual({ success: true, redirect: '/' })
    const [name, value] = mockCookieSet.mock.calls[0]
    expect(name).toBe('session')
    expect(await verifySessionToken(value)).toEqual({ userId: 'user_1', role: 'MEMBER' })
  })

  it('redirects ADMIN users to /admin', async () => {
    const passwordHash = await hashPassword('goodpass1')
    mockFindUnique.mockResolvedValue({ id: 'user_a', username: 'boss', passwordHash, role: 'ADMIN' })
    const result = await POST(makeRequest({ username: 'boss', password: 'goodpass1' }))
    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
  })

  it('returns generic 401 for unknown user and for wrong password', async () => {
    mockFindUnique.mockResolvedValue(null)
    const r1 = await POST(makeRequest({ username: 'ghost', password: 'whatever1' }))
    expect((r1 as any).status).toBe(401)

    const passwordHash = await hashPassword('rightpass1')
    mockFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', passwordHash, role: 'MEMBER' })
    const r2 = await POST(makeRequest({ username: 'alice', password: 'wrongpass1' }))
    expect((r2 as any).status).toBe(401)
    expect((r1 as any).body).toEqual((r2 as any).body)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects a user row without credentials (collection-only user)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', passwordHash: null, role: 'MEMBER' })
    const result = await POST(makeRequest({ username: 'alice', password: 'whatever1' }))
    expect((result as any).status).toBe(401)
  })

  it('legacy admin login works only while ALLOW_LEGACY_LOGIN=true', async () => {
    process.env.ALLOW_LEGACY_LOGIN = 'true'
    const result = await POST(makeRequest({ password: 'test-admin-password-stronger' }))
    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
    const [, value] = mockCookieSet.mock.calls[0]
    expect(await verifySessionToken(value)).toEqual({ userId: LEGACY_ADMIN_USER_ID, role: 'ADMIN' })
  })

  it('legacy admin login is rejected when the flag is off', async () => {
    const result = await POST(makeRequest({ password: 'test-admin-password-stronger' }))
    expect((result as any).status).toBe(401)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies with 400', async () => {
    const result = await POST(makeRequest({ username: 42 }))
    expect((result as any).status).toBe(400)
  })

  it('rejects non-JSON bodies with 400', async () => {
    ipCounter += 1
    const req = {
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
      headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.1.${ipCounter}` : null) },
    } as unknown as Request
    const result = await POST(req)
    expect((result as any).status).toBe(400)
  })

  it('rejects over-long passwords with 400 (DoS guard)', async () => {
    const result = await POST(makeRequest({ username: 'alice', password: 'a1' + 'x'.repeat(127) }))
    expect((result as any).status).toBe(400)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('rate-limits repeated attempts from one IP', async () => {
    mockFindUnique.mockResolvedValue(null)
    const fixedIpRequest = () =>
      ({
        json: async () => ({ username: 'ghost', password: 'whatever1' }),
        headers: { get: (n: string) => (n === 'x-forwarded-for' ? '10.9.9.9' : null) },
      }) as unknown as Request
    let last: any
    for (let i = 0; i < 11; i++) last = await POST(fixedIpRequest())
    expect(last.status).toBe(429)
  })
})
