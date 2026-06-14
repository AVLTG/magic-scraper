process.env.COOKIE_SECRET = 'test-secret-for-adm-inv-tests-32char!'

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
  NextRequest: jest.fn(),
}))

const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({
  getSession: (...a: any[]) => mockGetSession(...a),
}))

const mockInviteFindMany = jest.fn()
const mockInviteCreate = jest.fn()
const mockInviteDelete = jest.fn()
const mockInviteFindUnique = jest.fn()
const mockUserFindUnique = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    invite: {
      findMany: (...a: any[]) => mockInviteFindMany(...a),
      create: (...a: any[]) => mockInviteCreate(...a),
      delete: (...a: any[]) => mockInviteDelete(...a),
      findUnique: (...a: any[]) => mockInviteFindUnique(...a),
    },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
  },
}))

import { GET, POST } from '@/app/api/admin/invites/route'
import { DELETE } from '@/app/api/admin/invites/[id]/route'
import { hashInviteToken } from '@/lib/invites'

const ADMIN_SESSION = { userId: 'user_admin', role: 'ADMIN', isLegacyAdmin: false }

function makeRequest(body?: object): any {
  return {
    json: async () => body,
    nextUrl: { origin: 'https://tabletally.example' },
  }
}

describe('POST /api/admin/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue(ADMIN_SESSION)
  })

  it('creates an open invite and returns the one-time URL', async () => {
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_1', ...data }))
    const result = await POST(makeRequest({ type: 'open' }))
    expect((result as any).status).toBe(201)
    const { url, invite } = (result as any).body
    const token = url.split('/invite/')[1]
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.startsWith('https://tabletally.example/invite/')).toBe(true)
    // stored hash matches the raw token in the returned URL
    expect(mockInviteCreate.mock.calls[0][0].data.tokenHash).toBe(hashInviteToken(token))
    expect(mockInviteCreate.mock.calls[0][0].data.createdByUserId).toBe('user_admin')
    expect(invite.tokenHash).toBeUndefined() // never echo the hash
  })

  it('creates a bound invite with slugified locked username and chosen role', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', name: 'Amirali T', username: null })
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_2', ...data }))
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'user_amir', role: 'ADMIN' }))
    expect((result as any).status).toBe(201)
    const data = mockInviteCreate.mock.calls[0][0].data
    expect(data.targetUserId).toBe('user_amir')
    expect(data.suggestedUsername).toBe('amirali-t')
    expect(data.role).toBe('ADMIN')
  })

  it('rejects bound invites for users that already have credentials', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', name: 'Amirali', username: 'amirali' })
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'user_amir' }))
    expect((result as any).status).toBe(409)
  })

  it('rejects bound invites for unknown users', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'nope' }))
    expect((result as any).status).toBe(404)
  })

  it('rejects bound invites whose name cannot become a username', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user_x', name: '!!', username: null })
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'user_x' }))
    expect((result as any).status).toBe(400)
  })

  it('computes expiresAt from expiresInDays and enforces the 30-day cap', async () => {
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_e', ...data }))
    const before = Date.now()
    await POST(makeRequest({ type: 'open', expiresInDays: 3 }))
    const expiresAt: Date = mockInviteCreate.mock.calls[0][0].data.expiresAt
    const expectedMs = 3 * 86_400_000
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(expectedMs - 5_000)
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(expectedMs + 5_000)

    const overCap = await POST(makeRequest({ type: 'open', expiresInDays: 31 }))
    expect((overCap as any).status).toBe(400)
  })

  it('pins the invite URL to APP_URL when configured', async () => {
    process.env.APP_URL = 'https://tally.example.com/'
    try {
      mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_p', ...data }))
      const result = await POST(makeRequest({ type: 'open' }))
      expect((result as any).body.url.startsWith('https://tally.example.com/invite/')).toBe(true)
    } finally {
      delete process.env.APP_URL
    }
  })

  it('stores null createdByUserId for the legacy bootstrap admin', async () => {
    mockGetSession.mockResolvedValue({ userId: '__legacy_admin__', role: 'ADMIN', isLegacyAdmin: true })
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_3', ...data }))
    await POST(makeRequest({ type: 'open' }))
    expect(mockInviteCreate.mock.calls[0][0].data.createdByUserId).toBeNull()
  })

  it('rejects invalid bodies and non-admin sessions', async () => {
    const bad = await POST(makeRequest({ type: 'nonsense' }))
    expect((bad as any).status).toBe(400)
    mockGetSession.mockResolvedValue(null)
    const noSession = await POST(makeRequest({ type: 'open' }))
    expect((noSession as any).status).toBe(401)
    mockGetSession.mockResolvedValue({ userId: 'user_1', role: 'MEMBER', isLegacyAdmin: false })
    const member = await POST(makeRequest({ type: 'open' }))
    expect((member as any).status).toBe(401)
  })
})

describe('GET /api/admin/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue(ADMIN_SESSION)
  })

  it('lists invites with computed status, newest first, no token hashes', async () => {
    const future = new Date(Date.now() + 86_400_000)
    mockInviteFindMany.mockResolvedValue([
      {
        id: 'inv_1', tokenHash: 'secret', targetUserId: null, suggestedUsername: null,
        role: 'MEMBER', createdByUserId: 'user_admin', usedAt: null, expiresAt: future,
        createdAt: new Date(), targetUser: null,
      },
    ])
    const result = await GET()
    expect((result as any).status).toBe(200)
    expect(mockInviteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    )
    const [row] = (result as any).body
    expect(row.status).toBe('pending')
    expect(row.tokenHash).toBeUndefined()
    expect(row.targetUserName).toBeNull()
  })

  it('computes used and expired statuses in the list', async () => {
    const past = new Date(Date.now() - 86_400_000)
    const future = new Date(Date.now() + 86_400_000)
    mockInviteFindMany.mockResolvedValue([
      {
        id: 'inv_used', tokenHash: 'x', targetUserId: null, suggestedUsername: null,
        role: 'MEMBER', createdByUserId: null, usedAt: past, expiresAt: future,
        createdAt: past, targetUser: null,
      },
      {
        id: 'inv_exp', tokenHash: 'y', targetUserId: 'u1', suggestedUsername: 'bob',
        role: 'MEMBER', createdByUserId: null, usedAt: null, expiresAt: past,
        createdAt: past, targetUser: { name: 'Bob' },
      },
    ])
    const result = await GET()
    const [used, expired] = (result as any).body
    expect(used.status).toBe('used')
    expect(expired.status).toBe('expired')
    expect(expired.targetUserName).toBe('Bob')
  })

  it('rejects non-admin sessions', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await GET()
    expect((result as any).status).toBe(401)
  })
})

describe('DELETE /api/admin/invites/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue(ADMIN_SESSION)
  })

  it('revokes an unused invite', async () => {
    mockInviteFindUnique.mockResolvedValue({ id: 'inv_1', usedAt: null })
    mockInviteDelete.mockResolvedValue({})
    const result = await DELETE({} as any, { params: Promise.resolve({ id: 'inv_1' }) })
    expect((result as any).status).toBe(200)
    expect(mockInviteDelete).toHaveBeenCalledWith({ where: { id: 'inv_1' } })
  })

  it('refuses to revoke a used invite', async () => {
    mockInviteFindUnique.mockResolvedValue({ id: 'inv_1', usedAt: new Date() })
    const result = await DELETE({} as any, { params: Promise.resolve({ id: 'inv_1' }) })
    expect((result as any).status).toBe(409)
    expect(mockInviteDelete).not.toHaveBeenCalled()
  })

  it('404s for unknown invites', async () => {
    mockInviteFindUnique.mockResolvedValue(null)
    const result = await DELETE({} as any, { params: Promise.resolve({ id: 'nope' }) })
    expect((result as any).status).toBe(404)
  })
})
