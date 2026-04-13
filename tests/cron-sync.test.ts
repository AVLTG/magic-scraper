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

  it('does NOT call sendDiscordAlert when all users succeed', async () => {
    mockUpdateAll.mockResolvedValue({ succeeded: ['Alice', 'Bob'], failed: [] })
    const req = makeCronRequest('Bearer test-cron-secret-123')
    await GET(req)
    expect(mockSendDiscord).not.toHaveBeenCalled()
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
})
