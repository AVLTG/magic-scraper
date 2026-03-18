/**
 * Tests for proxy.ts route protection
 * Tests the proxy function directly by mocking NextRequest/NextResponse
 */

// Must set COOKIE_SECRET before any imports that reference it
process.env.COOKIE_SECRET = 'test-secret-for-proxy-tests-32chars!!'

import { signCookie, COOKIE_NAMES } from '@/lib/auth'

// Mock next/server before importing proxy
const mockRedirect = jest.fn((url: URL) => ({ type: 'redirect', url: url.toString(), status: 307 }))
const mockNext = jest.fn(() => ({ type: 'next' }))

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => mockRedirect(url),
    next: () => mockNext(),
  },
}))

// Import proxy after mocks are set up
import { proxy } from '../proxy'

function makeMockRequest(pathname: string, cookies: Record<string, string> = {}): any {
  const url = `http://localhost${pathname}`
  return {
    nextUrl: { pathname },
    url,
    cookies: {
      get: (name: string) => {
        const value = cookies[name]
        return value !== undefined ? { name, value } : undefined
      },
    },
  }
}

describe('proxy route protection', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    mockNext.mockClear()
    // Reset mock return values
    mockRedirect.mockImplementation((url: URL) => ({ type: 'redirect', url: url.toString(), status: 307 }))
    mockNext.mockImplementation(() => ({ type: 'next' }))
  })

  it('redirects unauthenticated request to /login', () => {
    const req = makeMockRequest('/')
    proxy(req)
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const redirectUrl: URL = mockRedirect.mock.calls[0][0]
    expect(redirectUrl.pathname).toBe('/login')
  })

  it('allows valid session cookie through', () => {
    const validCookie = signCookie(COOKIE_NAMES.session)
    const req = makeMockRequest('/', { [COOKIE_NAMES.session]: validCookie })
    proxy(req)
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('skips /login path', () => {
    const req = makeMockRequest('/login')
    proxy(req)
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('skips /api/auth paths', () => {
    const req = makeMockRequest('/api/auth/login')
    proxy(req)
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects group user from admin to /login with admin-required message', () => {
    const validSession = signCookie(COOKIE_NAMES.session)
    const req = makeMockRequest('/admin', { [COOKIE_NAMES.session]: validSession })
    proxy(req)
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const redirectUrl: URL = mockRedirect.mock.calls[0][0]
    expect(redirectUrl.pathname).toBe('/login')
    expect(redirectUrl.searchParams.get('message')).toBe('admin-required')
  })

  it('allows admin session cookie through to /admin', () => {
    const validSession = signCookie(COOKIE_NAMES.session)
    const validAdmin = signCookie(COOKIE_NAMES.adminSession)
    const req = makeMockRequest('/admin', {
      [COOKIE_NAMES.session]: validSession,
      [COOKIE_NAMES.adminSession]: validAdmin,
    })
    proxy(req)
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects after logout when session cookie is cleared', () => {
    const req = makeMockRequest('/checkDeck')
    proxy(req)
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const redirectUrl: URL = mockRedirect.mock.calls[0][0]
    expect(redirectUrl.pathname).toBe('/login')
  })

  it('skips /api/cron paths without session cookie', () => {
    const req = makeMockRequest('/api/cron/sync-collections')
    proxy(req)
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
