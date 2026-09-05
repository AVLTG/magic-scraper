/**
 * Tests for /api/cron/sync-collections route
 * Tests Bearer token auth, updateAllCollections() invocation, and Discord alerting
 */

// Must set CRON_SECRET before any imports that reference it
process.env.CRON_SECRET = 'test-cron-secret-123'

const mockUpdateAll = jest.fn()
jest.mock('@/lib/updateCollections', () => ({
  updateAllCollections: (...args: any[]) => mockUpdateAll(...args),
}))

const mockSendDiscord = jest.fn()
jest.mock('@/lib/discord', () => ({
  sendDiscordAlert: (...args: any[]) => mockSendDiscord(...args),
}))

import { GET } from '@/app/api/cron/sync-collections/route'

function makeCronRequest(authHeader?: string): any {
  return {
    headers: {
      get: (name: string) => (name === 'authorization' ? authHeader ?? null : null),
    },
  }
}

describe('cron sync route', () => {
  beforeEach(() => {
    mockUpdateAll.mockClear()
    mockSendDiscord.mockClear()
    mockUpdateAll.mockResolvedValue({ succeeded: [], failed: [] })
    mockSendDiscord.mockResolvedValue(undefined)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeCronRequest()
    const response = await GET(req)
    expect(response.status).toBe(401)
  })

  it('returns 401 when Authorization header has wrong token', async () => {
    const req = makeCronRequest('Bearer wrong-token')
    const response = await GET(req)
    expect(response.status).toBe(401)
  })

  it('calls updateAllCollections with source "cron" on valid Bearer token', async () => {
    mockUpdateAll.mockResolvedValue({ succeeded: ['Alice'], failed: [] })
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(mockUpdateAll).toHaveBeenCalledTimes(1)
    expect(mockUpdateAll).toHaveBeenCalledWith('cron')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ success: true, succeeded: 1, failed: 0 })
  })

  it('posts a success alert when all users succeed', async () => {
    mockUpdateAll.mockResolvedValue({ succeeded: ['Alice', 'Bob'], failed: [] })
    const req = makeCronRequest('Bearer test-cron-secret-123')
    await GET(req)
    expect(mockSendDiscord).toHaveBeenCalledTimes(1)
    const alertArg = mockSendDiscord.mock.calls[0][0]
    expect(alertArg.content).toContain('2 user(s) synced successfully')
  })

  it('calls sendDiscordAlert when at least one user fails', async () => {
    mockUpdateAll.mockResolvedValue({
      succeeded: ['Alice'],
      failed: [{ name: 'Bob', error: 'timeout' }],
    })
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(mockSendDiscord).toHaveBeenCalledTimes(1)
    const alertArg = mockSendDiscord.mock.calls[0][0]
    expect(alertArg.content).toContain('Bob')
    expect(alertArg.content).toContain('timeout')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ success: true, succeeded: 1, failed: 1 })
  })

  it('returns 500 when updateAllCollections throws', async () => {
    mockUpdateAll.mockRejectedValueOnce(new Error('sync failed'))
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({ success: false })
  })

  it('posts a failure alert to Discord when updateAllCollections throws (no silent failures)', async () => {
    mockUpdateAll.mockRejectedValueOnce(new Error('DB unreachable'))
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(mockSendDiscord).toHaveBeenCalledTimes(1)
    const alertArg = mockSendDiscord.mock.calls[0][0]
    expect(alertArg.content).toContain('DB unreachable')
    expect(response.status).toBe(500)
  })

  it('still returns 500 even if the failure alert itself fails to post', async () => {
    mockUpdateAll.mockRejectedValueOnce(new Error('boom'))
    mockSendDiscord.mockRejectedValueOnce(new Error('discord down'))
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(response.status).toBe(500)
  })
})

describe('cron sync environment gating (production-only)', () => {
  const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV

  beforeEach(() => {
    mockUpdateAll.mockClear()
    mockSendDiscord.mockClear()
    mockUpdateAll.mockResolvedValue({ succeeded: ['Alice'], failed: [] })
    mockSendDiscord.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV
  })

  it('skips the sync on preview/staging — no scrape, no Discord, no tokens burned', async () => {
    process.env.VERCEL_ENV = 'preview'
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ skipped: true })
    expect(mockUpdateAll).not.toHaveBeenCalled()
    expect(mockSendDiscord).not.toHaveBeenCalled()
  })

  it('runs the sync when VERCEL_ENV is production', async () => {
    process.env.VERCEL_ENV = 'production'
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(response.status).toBe(200)
    expect(mockUpdateAll).toHaveBeenCalledWith('cron')
  })

  it('runs the sync locally when VERCEL_ENV is unset', async () => {
    delete process.env.VERCEL_ENV
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(response.status).toBe(200)
    expect(mockUpdateAll).toHaveBeenCalledWith('cron')
  })

  it('still enforces auth before the environment check on preview', async () => {
    process.env.VERCEL_ENV = 'preview'
    const req = makeCronRequest('Bearer wrong-token')
    const response = await GET(req)
    expect(response.status).toBe(401)
    expect(mockUpdateAll).not.toHaveBeenCalled()
  })
})

describe('cron sync auth when CRON_SECRET is unset', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET

  beforeEach(() => {
    mockUpdateAll.mockClear()
    mockSendDiscord.mockClear()
    mockUpdateAll.mockResolvedValue({ succeeded: ['Alice'], failed: [] })
    mockSendDiscord.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = ORIGINAL_SECRET
  })

  it('rejects the literal "Bearer undefined" — no auth fallthrough on misconfiguration', async () => {
    delete process.env.CRON_SECRET
    const req = makeCronRequest('Bearer undefined')
    const response = await GET(req)
    expect(response.status).toBe(401)
    expect(mockUpdateAll).not.toHaveBeenCalled()
    expect(mockSendDiscord).not.toHaveBeenCalled()
  })

  it('rejects every header when the secret is unset', async () => {
    delete process.env.CRON_SECRET
    const req = makeCronRequest('Bearer ')
    const response = await GET(req)
    expect(response.status).toBe(401)
  })
})
