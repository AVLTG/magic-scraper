const mockDeckFindMany = jest.fn()
const mockDeckCreate = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      create: (...a: unknown[]) => mockDeckCreate(...a),
    },
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))

let ipCounter = 0
function makeRequest(body?: Record<string, unknown>): Request {
  ipCounter += 1
  return {
    json: async () => body ?? {},
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) },
  } as unknown as Request
}

const MEMBER = { userId: 'u1', role: 'MEMBER', isLegacyAdmin: false }
const LEGACY = { userId: '__legacy_admin__', role: 'ADMIN', isLegacyAdmin: true }

import { GET, POST } from '../src/app/api/decks/route'

const DB_DECKS = [
  { id: 'd1', name: 'Krenko', ownerUserId: 'u1', createdAt: new Date(), owner: { name: 'Alice' }, _count: { cards: 3 } },
  { id: 'd2', name: 'Esper', ownerUserId: 'u2', createdAt: new Date(), owner: { name: 'Bob' }, _count: { cards: 0 } },
  { id: 'd3', name: 'Slivers', ownerUserId: null, createdAt: new Date(), owner: null, _count: { cards: 0 } },
]

describe('GET /api/decks', () => {
  beforeEach(() => { mockDeckFindMany.mockReset(); mockGetSession.mockReset() })

  it('splits decks into userDecks and otherDecks relative to the session user', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue(DB_DECKS)
    const res: any = await GET(makeRequest())
    expect(res.body.userDecks).toEqual([{ id: 'd1', name: 'Krenko', cardCount: 3 }])
    expect(res.body.otherDecks).toEqual([
      { id: 'd2', name: 'Esper', cardCount: 0, ownerName: 'Bob' },
      { id: 'd3', name: 'Slivers', cardCount: 0, ownerName: null },
    ])
    expect(res.body.isLegacyAdmin).toBe(false)
  })

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null)
    expect(((await GET(makeRequest())) as any).status).toBe(401)
  })
})

describe('POST /api/decks', () => {
  beforeEach(() => { mockDeckFindMany.mockReset(); mockDeckCreate.mockReset(); mockGetSession.mockReset() })

  it('creates a deck owned by the session user', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue([])
    mockDeckCreate.mockResolvedValue({ id: 'new', name: 'Mono Red' })
    const res: any = await POST(makeRequest({ name: '  Mono Red ' }))
    expect(res.status).toBe(201)
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'Mono Red', ownerUserId: 'u1' } })
  })

  it('409s on a case-insensitive duplicate within the user own decks', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue([{ name: 'mono red' }])
    expect(((await POST(makeRequest({ name: 'Mono Red' }))) as any).status).toBe(409)
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('403s the legacy bootstrap admin', async () => {
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await POST(makeRequest({ name: 'X' }))) as any).status).toBe(403)
  })

  it('400s invalid names', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    expect(((await POST(makeRequest({ name: '' }))) as any).status).toBe(400)
    expect(((await POST(makeRequest({ name: 'x'.repeat(101) }))) as any).status).toBe(400)
  })
})
