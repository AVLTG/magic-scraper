const mockDeckFindUnique = jest.fn()
const mockCollectionFindMany = jest.fn()
const mockDeckCardFindMany = jest.fn()
const mockUpsert = jest.fn()
const mockCollectionCreateMany = jest.fn()
const tx = {
  collectionCard: { createMany: (...a: unknown[]) => mockCollectionCreateMany(...a) },
  deckCard: { upsert: (...a: unknown[]) => mockUpsert(...a) },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findUnique: (...a: unknown[]) => mockDeckFindUnique(...a) },
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deckCard: { findMany: (...a: unknown[]) => mockDeckCardFindMany(...a) },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))
const mockResolveCards = jest.fn()
jest.mock('@/lib/scryfall', () => {
  const actual = jest.requireActual('@/lib/scryfall')
  return { ...actual, resolveCards: (...a: unknown[]) => mockResolveCards(...a) }
})
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
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
import { POST } from '../src/app/api/decks/[id]/import/route'
import { scryfallKey } from '@/lib/scryfall'
const params = { params: Promise.resolve({ id: 'd1' }) }

describe('POST /api/decks/[id]/import', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockCollectionFindMany.mockReset()
    mockDeckCardFindMany.mockReset(); mockUpsert.mockReset(); mockCollectionCreateMany.mockReset(); mockResolveCards.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Krenko', ownerUserId: 'u1' })
    mockDeckCardFindMany.mockResolvedValue([])
  })

  it('dryRun lists missing without writing', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(makeRequest({ text: '1 Sol Ring (C21) 263\n1 Black Lotus (LEA) 232', dryRun: true }), params)
    expect(res.body.missing).toEqual([{ line: 2, cardName: 'Black Lotus', set: 'LEA', collectorNumber: '232' }])
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('commit upserts library cards into the deck with their printing', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(
      makeRequest({ text: '2 Sol Ring (C21) 263', dryRun: false, addMissingToLibrary: false }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_cardName: { deckId: 'd1', cardName: 'Sol Ring' } },
        update: { quantity: { increment: 2 } },
        create: expect.objectContaining({ deckId: 'd1', cardName: 'Sol Ring', quantity: 2, set: 'C21', collectorNumber: '263' }),
      })
    )
  })

  it('400s commit when cards are missing and addMissingToLibrary is omitted', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await POST(makeRequest({ text: '1 Black Lotus (LEA) 232', dryRun: false }), params)
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('addMissingToLibrary=true resolves missing, inserts to library, upserts into deck', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    mockResolveCards.mockResolvedValue({
      found: new Map([[scryfallKey('LEA', '232'), { name: 'Black Lotus', scryfallId: 's1', set: 'lea', setName: 'LEA', typeLine: 'Artifact', collectorNumber: '232' }]]),
      notFound: [],
    })
    const res: any = await POST(makeRequest({ text: '1 Black Lotus (LEA) 232', dryRun: false, addMissingToLibrary: true }), params)
    expect(res.status).toBe(200)
    expect(res.body.addedToLibrary).toBe(1)
    expect(mockCollectionCreateMany).toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ cardName: 'Black Lotus' }) }))
  })

  it('basics import without library membership; 403s non-owners', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    const ok: any = await POST(makeRequest({ text: '5 Plains (FDN) 269', dryRun: false, addMissingToLibrary: false }), params)
    expect(ok.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ cardName: 'Plains', quantity: 5 }) }))
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    expect(((await POST(makeRequest({ text: '1 Plains', dryRun: false }), params)) as any).status).toBe(403)
  })
})
