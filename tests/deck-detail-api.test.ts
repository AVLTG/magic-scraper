const mockDeckFindUnique = jest.fn()
const mockDeckDelete = jest.fn()
const mockCollectionFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      delete: (...a: unknown[]) => mockDeckDelete(...a),
    },
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
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
const LEGACY = { userId: '__legacy_admin__', role: 'ADMIN', isLegacyAdmin: true }

import { GET, DELETE } from '../src/app/api/decks/[id]/route'

const params = { params: Promise.resolve({ id: 'd1' }) }
const DECK = {
  id: 'd1', name: 'Krenko', ownerUserId: 'u1', owner: { name: 'Alice' },
  cards: [
    { cardName: 'Sol Ring', quantity: 1, set: 'C21', collectorNumber: '263', isFoil: false },
    { cardName: 'Black Lotus', quantity: 1, set: null, collectorNumber: null, isFoil: false },
  ],
}

describe('GET /api/decks/[id]', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockCollectionFindMany.mockReset() })

  it('returns deck with inLibrary computed against the OWNER library and isOwner flag', async () => {
    mockGetSession.mockResolvedValue(MEMBER) // u1 — the owner
    mockDeckFindUnique.mockResolvedValue(DECK)
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await GET(makeRequest(), params)
    expect(res.body.deck.isOwner).toBe(true)
    expect(res.body.deck.cards).toEqual([
      expect.objectContaining({ cardName: 'Sol Ring', inLibrary: true }),
      expect.objectContaining({ cardName: 'Black Lotus', inLibrary: false }),
    ])
    expect(mockCollectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } })
    )
  })

  it('marks isOwner=false for another user (read allowed)', async () => {
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    mockDeckFindUnique.mockResolvedValue(DECK)
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await GET(makeRequest(), params)
    expect(res.status).toBe(200)
    expect(res.body.deck.isOwner).toBe(false)
  })

  it('404s unknown decks', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await GET(makeRequest(), params)) as any).status).toBe(404)
  })
})

describe('DELETE /api/decks/[id]', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockDeckDelete.mockReset() })

  it('lets the owner delete', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(DECK)
    mockDeckDelete.mockResolvedValue(DECK)
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(200)
    expect(mockDeckDelete).toHaveBeenCalledWith({ where: { id: 'd1' } })
  })

  it('403s a non-owner, even ADMIN, on an owned deck', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue(DECK)
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(403)
  })

  it('lets ADMIN delete an OWNERLESS deck (cleanup)', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ ...DECK, ownerUserId: null, owner: null })
    mockDeckDelete.mockResolvedValue({})
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(200)
  })

  it('403s a MEMBER on an ownerless deck', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ ...DECK, ownerUserId: null, owner: null })
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(403)
  })
})
