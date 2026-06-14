const mockDeckFindMany = jest.fn()
const mockDeckFindUnique = jest.fn()
const mockDeckUpdate = jest.fn()
const mockDeckDelete = jest.fn()
const mockUserFindUnique = jest.fn()
const mockGPFindMany = jest.fn()
const mockGPUpdateMany = jest.fn()
const tx = {
  gameParticipant: { updateMany: (...a: unknown[]) => mockGPUpdateMany(...a) },
  deck: { delete: (...a: unknown[]) => mockDeckDelete(...a) },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      update: (...a: unknown[]) => mockDeckUpdate(...a),
      delete: (...a: unknown[]) => mockDeckDelete(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    gameParticipant: {
      findMany: (...a: unknown[]) => mockGPFindMany(...a),
      updateMany: (...a: unknown[]) => mockGPUpdateMany(...a),
    },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
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
import { PATCH, DELETE } from '../src/app/api/admin/decks/[id]/route'

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
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', deckName: 'Krenko' },
      { gameId: 'g2', deckName: 'krenko' },
      { gameId: 'g3', deckName: 'Other' },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.decks).toEqual([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', ownerName: 'Alice', cardCount: 5, gameCount: 2 },
      { id: 'd2', name: 'Slivers', ownerUserId: null, ownerName: null, cardCount: 0, gameCount: 0 },
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

describe('DELETE /api/admin/decks/[id]', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockDeckDelete.mockReset()
    mockGPFindMany.mockReset(); mockGPUpdateMany.mockReset()
  })

  it('detaches matching games (nulls deckName) then deletes the deck', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Krenko' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', gameId: 'g1', deckName: 'Krenko' },
      { id: 'p2', gameId: 'g2', deckName: 'krenko' },
      { id: 'p3', gameId: 'g3', deckName: 'Other' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    mockDeckDelete.mockResolvedValue({})
    const res: any = await DELETE(makeRequest(), params)
    expect(mockGPUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] } }, data: { deckName: null } })
    expect(mockDeckDelete).toHaveBeenCalledWith({ where: { id: 'd1' } })
    expect(res.body).toEqual({ success: true, detachedGames: 2 })
  })

  it('404s a missing deck; 403s a non-admin without deleting', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(404)
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Krenko' })
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(403)
    expect(mockDeckDelete).not.toHaveBeenCalled()
  })
})
