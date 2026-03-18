/**
 * Tests for /api/cron/sync-collections route
 * Tests Bearer token auth and updateAllCollections() invocation
 */

// Must set CRON_SECRET before any imports that reference it
process.env.CRON_SECRET = 'test-cron-secret-123'

const mockUpdateAll = jest.fn()
jest.mock('@/lib/updateCollections', () => ({
  updateAllCollections: () => mockUpdateAll(),
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
    mockUpdateAll.mockResolvedValue(undefined)
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

  it('calls updateAllCollections on valid Bearer token', async () => {
    const req = makeCronRequest('Bearer test-cron-secret-123')
    const response = await GET(req)
    expect(mockUpdateAll).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ success: true })
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
