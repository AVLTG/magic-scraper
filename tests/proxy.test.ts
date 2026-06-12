process.env.COOKIE_SECRET = 'test-secret-for-proxy-tests-32chars!!'

import { createSessionToken, COOKIE_NAMES } from '@/lib/auth'

const mockRedirect = jest.fn((url: URL) => ({ type: 'redirect', url: url.toString(), status: 307 }))
const mockNext = jest.fn(() => ({ type: 'next' }))
const mockJson = jest.fn((body: unknown, init?: { status?: number }) => ({
  type: 'json',
  body,
  status: init?.status ?? 200,
}))

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => mockRedirect(url),
    next: () => mockNext(),
    json: (body: unknown, init?: { status?: number }) => mockJson(body, init),
  },
}))

import { proxy } from '../proxy'

function makeMockRequest(pathname: string, cookies: Record<string, string> = {}): any {
  return {
    nextUrl: { pathname },
    url: `http://localhost${pathname}`,
    cookies: {
      get: (name: string) => {
        const value = cookies[name]
        return value !== undefined ? { name, value } : undefined
      },
    },
  }
}

describe('proxy route protection (per-user sessions)', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    mockNext.mockClear()
    mockJson.mockClear()
  })

  it('redirects unauthenticated request to /login', async () => {
    await proxy(makeMockRequest('/'))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    expect(mockRedirect.mock.calls[0][0].pathname).toBe('/login')
  })

  it('allows a valid MEMBER session through to app routes', async () => {
    const token = await createSessionToken('user_1', 'MEMBER')
    await proxy(makeMockRequest('/checkDeck', { [COOKIE_NAMES.session]: token }))
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('rejects an expired session', async () => {
    const token = await createSessionToken('user_1', 'MEMBER', -10)
    await proxy(makeMockRequest('/', { [COOKIE_NAMES.session]: token }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
  })

  it('blocks MEMBER from /admin with admin-required message', async () => {
    const token = await createSessionToken('user_1', 'MEMBER')
    await proxy(makeMockRequest('/admin', { [COOKIE_NAMES.session]: token }))
    const url: URL = mockRedirect.mock.calls[0][0]
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('message')).toBe('admin-required')
  })

  it('blocks MEMBER from /api/admin routes with 403 JSON (no HTML redirect for APIs)', async () => {
    const token = await createSessionToken('user_1', 'MEMBER')
    const result: any = await proxy(makeMockRequest('/api/admin/users', { [COOKIE_NAMES.session]: token }))
    expect(result.status).toBe(403)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('returns 401 JSON for unauthenticated protected API routes', async () => {
    const result: any = await proxy(makeMockRequest('/api/games'))
    expect(result.status).toBe(401)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows ADMIN through to /admin', async () => {
    const token = await createSessionToken('user_admin', 'ADMIN')
    await proxy(makeMockRequest('/admin', { [COOKIE_NAMES.session]: token }))
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('skips exempt paths without a session', async () => {
    for (const path of ['/login', '/api/auth/login', '/api/auth/signup', '/invite/some-token', '/api/invites/some-token', '/api/cron/sync-collections']) {
      mockNext.mockClear()
      mockRedirect.mockClear()
      await proxy(makeMockRequest(path))
      expect(mockNext).toHaveBeenCalledTimes(1)
      expect(mockRedirect).not.toHaveBeenCalled()
    }
  })

  it('ignores legacy signCookie-style cookie values', async () => {
    await proxy(makeMockRequest('/', { [COOKIE_NAMES.session]: 'aabbcc112233' }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
  })

  it('does not treat prefix-shadowing paths as public', async () => {
    for (const path of ['/loginfoo', '/invitees', '/api/authz/thing', '/api/invitesque']) {
      mockNext.mockClear()
      mockRedirect.mockClear()
      mockJson.mockClear()
      await proxy(makeMockRequest(path))
      expect(mockNext).not.toHaveBeenCalled()
    }
  })
})
