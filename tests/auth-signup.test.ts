process.env.COOKIE_SECRET = 'test-secret-for-signup-tests-32chars!'

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
  NextRequest: jest.fn(),
}))

const mockInviteFindUnique = jest.fn()
const mockInviteUpdateMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockUserFindFirst = jest.fn()
const mockUserUpdate = jest.fn()
const mockUserCreate = jest.fn()

const tx = {
  invite: { updateMany: (...a: any[]) => mockInviteUpdateMany(...a) },
  user: {
    findUnique: (...a: any[]) => mockUserFindUnique(...a),
    update: (...a: any[]) => mockUserUpdate(...a),
    create: (...a: any[]) => mockUserCreate(...a),
  },
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    invite: { findUnique: (...a: any[]) => mockInviteFindUnique(...a) },
    user: { findFirst: (...a: any[]) => mockUserFindFirst(...a) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  },
}))

import { POST } from '../src/app/api/auth/signup/route'
import { GET } from '../src/app/api/invites/[token]/route'
import { generateInviteToken } from '@/lib/invites'
import { verifySessionToken } from '@/lib/auth'

let ipCounter = 0
function makeRequest(body: Record<string, unknown>): any {
  ipCounter += 1
  return {
    json: async () => body,
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.1.0.${ipCounter}` : null) },
  }
}

const future = new Date(Date.now() + 86_400_000)

function baseInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    targetUserId: null,
    suggestedUsername: null,
    role: 'MEMBER',
    usedAt: null,
    expiresAt: future,
    ...overrides,
  }
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockInviteUpdateMany.mockResolvedValue({ count: 1 })
    mockUserFindFirst.mockResolvedValue(null)
  })

  it('redeems an open invite: creates user, marks invite used, auto-logs-in', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockUserCreate.mockResolvedValue({ id: 'user_new', role: 'MEMBER' })

    const result = await POST(makeRequest({ token, username: 'NewUser', password: 'decent-pw1' }))

    expect((result as any).body).toEqual({ success: true, redirect: '/' })
    expect(mockInviteUpdateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    })
    const createArgs = mockUserCreate.mock.calls[0][0]
    expect(createArgs.data.username).toBe('newuser')
    expect(createArgs.data.passwordHash).toMatch(/^scrypt\$/)
    expect(createArgs.data.role).toBe('MEMBER')
    const [name, value] = mockCookieSet.mock.calls[0]
    expect(name).toBe('session')
    expect(await verifySessionToken(value)).toEqual({ userId: 'user_new', role: 'MEMBER' })
  })

  it('redeems a bound invite onto the existing user row with locked username', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(
      baseInvite({ targetUserId: 'user_amir', suggestedUsername: 'amirali', role: 'ADMIN' })
    )
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', username: null })
    mockUserUpdate.mockResolvedValue({ id: 'user_amir', role: 'ADMIN' })

    const result = await POST(makeRequest({ token, username: 'ignored-input', password: 'decent-pw1' }))

    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
    const updateArgs = mockUserUpdate.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 'user_amir' })
    expect(updateArgs.data.username).toBe('amirali')
    expect(updateArgs.data.role).toBe('ADMIN')
  })

  it('rejects unknown, used and expired invites with 400', async () => {
    const { token } = generateInviteToken()
    for (const invite of [
      null,
      baseInvite({ usedAt: new Date() }),
      baseInvite({ expiresAt: new Date(Date.now() - 1000) }),
    ]) {
      mockInviteFindUnique.mockResolvedValue(invite)
      const result = await POST(makeRequest({ token, username: 'whoever', password: 'decent-pw1' }))
      expect((result as any).status).toBe(400)
    }
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('rejects policy-violating passwords with 400 and a message', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    const result = await POST(makeRequest({ token, username: 'newuser', password: 'short' }))
    expect((result as any).status).toBe(400)
    expect((result as any).body.error).toContain('8 characters')
  })

  it('rejects a taken username with 409', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockUserFindFirst.mockResolvedValue({ id: 'user_other' })
    const result = await POST(makeRequest({ token, username: 'taken', password: 'decent-pw1' }))
    expect((result as any).status).toBe(409)
  })

  it('returns 409 when the invite was claimed concurrently (single-use race)', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockInviteUpdateMany.mockResolvedValue({ count: 0 })
    const result = await POST(makeRequest({ token, username: 'newuser', password: 'decent-pw1' }))
    expect((result as any).status).toBe(409)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects a bound invite whose target already has credentials', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite({ targetUserId: 'user_amir', suggestedUsername: 'amirali' }))
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', username: 'amirali' })
    const result = await POST(makeRequest({ token, password: 'decent-pw1' }))
    expect((result as any).status).toBe(400)
  })

  it('returns 409 (not 500) when the unique constraint catches a cross-instance username race', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockUserCreate.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
    const result = await POST(makeRequest({ token, username: 'newuser', password: 'decent-pw1' }))
    expect((result as any).status).toBe(409)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects a bound invite whose stored suggestedUsername is unusable', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite({ targetUserId: 'user_x', suggestedUsername: '' }))
    const result = await POST(makeRequest({ token, password: 'decent-pw1' }))
    expect((result as any).status).toBe(400)
  })
})

describe('GET /api/invites/[token]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns valid + locked username for a pending bound invite', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite({ targetUserId: 'u1', suggestedUsername: 'amirali' }))
    const result = await GET(makeRequest({}) as any, { params: Promise.resolve({ token }) })
    expect((result as any).body).toEqual({ valid: true, username: 'amirali', locked: true })
  })

  it('returns valid + unlocked for a pending open invite', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    const result = await GET(makeRequest({}) as any, { params: Promise.resolve({ token }) })
    expect((result as any).body).toEqual({ valid: true, username: null, locked: false })
  })

  it('returns valid:false for unknown/used/expired invites', async () => {
    const { token } = generateInviteToken()
    for (const invite of [null, baseInvite({ usedAt: new Date() }), baseInvite({ expiresAt: new Date(0) })]) {
      mockInviteFindUnique.mockResolvedValue(invite)
      const result = await GET(makeRequest({}) as any, { params: Promise.resolve({ token }) })
      expect((result as any).body).toEqual({ valid: false })
    }
  })
})
