const mockDeckFindMany = jest.fn()
const mockDeckFindUnique = jest.fn()
const mockDeckUpdate = jest.fn()
const mockUserFindUnique = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      update: (...a: unknown[]) => mockDeckUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
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
const ADMIN = { userId: 'ua', role: 'ADMIN', isLegacyAdmin: false }

import { GET } from '../src/app/api/admin/decks/route'
import { PATCH } from '../src/app/api/admin/decks/[id]/route'

const params = { params: Promise.resolve({ id: 'd1' }) }

describe('admin decks', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindMany.mockReset(); mockDeckFindUnique.mockReset()
    mockDeckUpdate.mockReset(); mockUserFindUnique.mockReset()
  })

  it('GET lists decks with owner + card count, ADMIN only', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', owner: { name: 'Alice' }, cards: [{ quantity: 4 }, { quantity: 1 }] },
      { id: 'd2', name: 'Slivers', ownerUserId: null, owner: null, cards: [] },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.decks).toEqual([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', ownerName: 'Alice', cardCount: 5 },
      { id: 'd2', name: 'Slivers', ownerUserId: null, ownerName: null, cardCount: 0 },
    ])
    mockGetSession.mockResolvedValue(MEMBER)
    expect(((await GET(makeRequest())) as any).status).toBe(403)
  })

  it('PATCH assigns an owner after verifying the user exists', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', ownerUserId: null })
    mockUserFindUnique.mockResolvedValue({ id: 'u1' })
    mockDeckUpdate.mockResolvedValue({ id: 'd1', ownerUserId: 'u1' })
    const res: any = await PATCH(makeRequest({ ownerUserId: 'u1' }), params)
    expect(res.status).toBe(200)
    expect(mockDeckUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { ownerUserId: 'u1' } })
  })

  it('PATCH null clears the owner; unknown target user 400s; unknown deck 404s; MEMBER 403s', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', ownerUserId: 'u1' })
    mockDeckUpdate.mockResolvedValue({})
    expect(((await PATCH(makeRequest({ ownerUserId: null }), params)) as any).status).toBe(200)

    mockUserFindUnique.mockResolvedValue(null)
    expect(((await PATCH(makeRequest({ ownerUserId: 'ghost' }), params)) as any).status).toBe(400)

    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await PATCH(makeRequest({ ownerUserId: null }), params)) as any).status).toBe(404)

    mockGetSession.mockResolvedValue(MEMBER)
    expect(((await PATCH(makeRequest({ ownerUserId: null }), params)) as any).status).toBe(403)
  })
})
