const mockDeckFindUnique = jest.fn()
const mockCollectionFindMany = jest.fn()
const mockDeckCardFindMany = jest.fn()
const mockUpsert = jest.fn()
const mockDeleteMany = jest.fn()
const mockUpdateMany = jest.fn()

const tx = {
  deckCard: {
    findMany: (...a: unknown[]) => mockDeckCardFindMany(...a),
    upsert: (...a: unknown[]) => mockUpsert(...a),
    deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
    updateMany: (...a: unknown[]) => mockUpdateMany(...a),
  },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findUnique: (...a: unknown[]) => mockDeckFindUnique(...a) },
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deckCard: { findMany: (...a: unknown[]) => mockDeckCardFindMany(...a) },
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
const LEGACY = { userId: '__legacy_admin__', role: 'ADMIN', isLegacyAdmin: true }

import { PUT } from '../src/app/api/decks/[id]/cards/route'

const params = { params: Promise.resolve({ id: 'd1' }) }
const OWNED = { id: 'd1', name: 'Krenko', ownerUserId: 'u1' }

describe('PUT /api/decks/[id]/cards', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset()
    mockCollectionFindMany.mockReset(); mockDeckCardFindMany.mockReset()
    mockUpsert.mockReset(); mockDeleteMany.mockReset(); mockUpdateMany.mockReset()
    mockDeckCardFindMany.mockResolvedValue([])
  })

  it('adds library cards using the canonical library name (case/separator-insensitive)', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Spikefield Hazard // Spikefield Cave' }])
    const res: any = await PUT(
      makeRequest({ add: [{ cardName: 'spikefield hazard / spikefield cave', quantity: 2 }] }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_cardName_board: { deckId: 'd1', cardName: 'Spikefield Hazard // Spikefield Cave', board: 'main' } },
        update: { quantity: { increment: 2 } },
      })
    )
  })

  it('targets a non-main board when requested', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await PUT(
      makeRequest({ add: [{ cardName: 'Sol Ring', quantity: 1, board: 'side' }] }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_cardName_board: { deckId: 'd1', cardName: 'Sol Ring', board: 'side' } },
      })
    )
  })

  it('400s adds that are not in the owner library, listing them', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await PUT(makeRequest({ add: [{ cardName: 'Black Lotus' }] }), params)
    expect(res.status).toBe(400)
    expect(res.body.cards).toEqual(['Black Lotus'])
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('removes by case-insensitive name match against stored deck cards', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockDeckCardFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    await PUT(makeRequest({ remove: ['sol ring'] }), params)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { deckId: 'd1', cardName: 'Sol Ring', board: 'main' },
    })
  })

  it('removes from a non-main board when requested', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockDeckCardFindMany.mockResolvedValue([{ cardName: 'Sol Ring', board: 'side' }])
    await PUT(makeRequest({ remove: [{ cardName: 'sol ring', board: 'side' }] }), params)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { deckId: 'd1', cardName: 'Sol Ring', board: 'side' },
    })
  })

  it('setQuantity 0 deletes; >0 updates', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockDeckCardFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }, { cardName: 'Arcane Signet' }])
    await PUT(
      makeRequest({ setQuantity: [{ cardName: 'Sol Ring', quantity: 0 }, { cardName: 'Arcane Signet', quantity: 4 }] }),
      params
    )
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { deckId: 'd1', cardName: 'Sol Ring', board: 'main' } })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { deckId: 'd1', cardName: 'Arcane Signet', board: 'main' },
      data: { quantity: 4 },
    })
  })

  it('403s non-owners and the legacy admin; ownerless decks are not editable', async () => {
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    expect(((await PUT(makeRequest({ add: [] }), params)) as any).status).toBe(403)
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await PUT(makeRequest({ add: [] }), params)) as any).status).toBe(403)
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ ...OWNED, ownerUserId: null })
    expect(((await PUT(makeRequest({ add: [] }), params)) as any).status).toBe(403)
  })

  it('allows adding basic lands without library membership', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await PUT(makeRequest({ add: [{ cardName: 'Plains', quantity: 4 }] }), params)
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_cardName_board: { deckId: 'd1', cardName: 'Plains', board: 'main' } },
      })
    )
  })
})
