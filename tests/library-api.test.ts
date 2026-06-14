const mockCollectionFindMany = jest.fn()
const mockCollectionCreateMany = jest.fn()
const mockDeckFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: {
      findMany: (...a: unknown[]) => mockCollectionFindMany(...a),
      createMany: (...a: unknown[]) => mockCollectionCreateMany(...a),
    },
    deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a) },
  },
}))
const mockResolveCards = jest.fn()
jest.mock('@/lib/scryfall', () => {
  const actual = jest.requireActual('@/lib/scryfall')
  return { ...actual, resolveCards: (...a: unknown[]) => mockResolveCards(...a) }
})

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

import { GET } from '../src/app/api/library/route'
import { POST } from '../src/app/api/library/cards/route'
import { scryfallKey } from '@/lib/scryfall'

describe('GET /api/library', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockCollectionFindMany.mockReset(); mockDeckFindMany.mockReset() })

  it('returns the session user cards with deck associations by normalized name', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockCollectionFindMany.mockResolvedValue([
      { id: 'c1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', quantity: 1, condition: 'NearMint', isFoil: false, typeLine: 'Artifact', source: 'moxfield' },
    ])
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', cards: [{ cardName: 'SOL RING' }] },
      { id: 'd2', name: 'Esper', cards: [{ cardName: 'Counterspell' }] },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.cards[0].decks).toEqual([{ id: 'd1', name: 'Krenko' }])
    expect(mockCollectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } })
    )
    expect(mockDeckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: 'u1' } })
    )
  })

  it('badges each printing only with the decks that reference that exact printing', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockCollectionFindMany.mockResolvedValue([
      { id: 'c1', cardName: 'Arcane Signet', set: 'arc', setName: 'Arcane', quantity: 1, condition: 'NearMint', isFoil: false, typeLine: 'Artifact', source: 'moxfield' },
      { id: 'c2', cardName: 'Arcane Signet', set: 'eld', setName: 'Eldraine', quantity: 1, condition: 'NearMint', isFoil: false, typeLine: 'Artifact', source: 'moxfield' },
    ])
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Deck A', cards: [{ cardName: 'Arcane Signet', set: 'arc', isFoil: false }] },
      { id: 'd2', name: 'Deck B', cards: [{ cardName: 'Arcane Signet', set: 'eld', isFoil: false }] },
    ])
    const res: any = await GET(makeRequest())
    const byId = Object.fromEntries(res.body.cards.map((c: any) => [c.id, c.decks]))
    expect(byId.c1).toEqual([{ id: 'd1', name: 'Deck A' }])
    expect(byId.c2).toEqual([{ id: 'd2', name: 'Deck B' }])
  })

  it('badges only the matching finish when the user owns foil and non-foil of one printing', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockCollectionFindMany.mockResolvedValue([
      { id: 'c1', cardName: 'Greater Tanuki', set: 'neo', setName: 'Kamigawa', quantity: 1, condition: 'NearMint', isFoil: true, typeLine: 'Creature', source: 'moxfield' },
      { id: 'c2', cardName: 'Greater Tanuki', set: 'neo', setName: 'Kamigawa', quantity: 1, condition: 'NearMint', isFoil: false, typeLine: 'Creature', source: 'moxfield' },
    ])
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Anikthea', cards: [{ cardName: 'Greater Tanuki', set: 'neo', isFoil: true }] },
    ])
    const res: any = await GET(makeRequest())
    const byId = Object.fromEntries(res.body.cards.map((c: any) => [c.id, c.decks]))
    expect(byId.c1).toEqual([{ id: 'd1', name: 'Anikthea' }])
    expect(byId.c2).toEqual([])
  })

  it('falls back to name matching when a deck card has no recorded printing', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockCollectionFindMany.mockResolvedValue([
      { id: 'c1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', quantity: 1, condition: 'NearMint', isFoil: false, typeLine: 'Artifact', source: 'moxfield' },
    ])
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', cards: [{ cardName: 'SOL RING', set: null, isFoil: false }] },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.cards[0].decks).toEqual([{ id: 'd1', name: 'Krenko' }])
  })

  it('returns empty cards + flag for the legacy admin', async () => {
    mockGetSession.mockResolvedValue(LEGACY)
    const res: any = await GET(makeRequest())
    expect(res.body).toEqual({ cards: [], isLegacyAdmin: true })
  })
})

describe('POST /api/library/cards', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockCollectionCreateMany.mockReset(); mockResolveCards.mockReset()
  })

  it('parses, resolves via Scryfall and inserts manual rows with canonical names', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('AFR', '261'), { name: 'Treasure Vault', scryfallId: 's1', set: 'afr', setName: 'Adventures in the Forgotten Realms', typeLine: 'Artifact Land', collectorNumber: '261' }],
      ]),
      notFound: [],
    })
    const res: any = await POST(makeRequest({ text: '2 Treasure Vault (AFR) 261 *F*' }))
    expect(res.status).toBe(200)
    expect(res.body.added).toEqual([{ cardName: 'Treasure Vault', quantity: 2 }])
    expect(res.body.errors).toEqual([])
    const data = mockCollectionCreateMany.mock.calls[0][0].data
    expect(data[0]).toEqual(
      expect.objectContaining({ userId: 'u1', cardName: 'Treasure Vault', source: 'manual', condition: 'NearMint', isFoil: true, quantity: 2 })
    )
  })

  it('reports per-line errors (parse failure, missing set/number, Scryfall miss) but inserts valid rows', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('C21', '263'), { name: 'Sol Ring', scryfallId: 's2', set: 'c21', setName: 'Commander 2021', typeLine: 'Artifact', collectorNumber: '263' }],
      ]),
      notFound: [{ set: 'xxx', collectorNumber: '1' }],
    })
    const res: any = await POST(
      makeRequest({ text: 'garbage line\n1 Sol Ring\n1 Fake Card (XXX) 1\n1 Sol Ring (C21) 263' })
    )
    expect(res.body.added).toEqual([{ cardName: 'Sol Ring', quantity: 1 }])
    expect(res.body.errors).toHaveLength(3)
    expect(res.body.errors.map((e: { line: number }) => e.line)).toEqual([1, 2, 3])
  })

  it('502s when Scryfall is down, inserting nothing', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockRejectedValue(new Error('Scryfall returned 503'))
    const res: any = await POST(makeRequest({ text: '1 Sol Ring (C21) 263' }))
    expect(res.status).toBe(502)
    expect(mockCollectionCreateMany).not.toHaveBeenCalled()
  })

  it('403s the legacy admin', async () => {
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await POST(makeRequest({ text: '1 X (Y) 1' }))) as any).status).toBe(403)
  })

  it('merges duplicate lines for the same printing within one paste', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('C21', '263'), { name: 'Sol Ring', scryfallId: 's2', set: 'c21', setName: 'Commander 2021', typeLine: 'Artifact', collectorNumber: '263' }],
      ]),
      notFound: [],
    })
    const res: any = await POST(makeRequest({ text: '1 Sol Ring (C21) 263\n2 Sol Ring (C21) 263' }))
    expect(res.body.added).toEqual([{ cardName: 'Sol Ring', quantity: 3 }])
    expect(mockCollectionCreateMany.mock.calls[0][0].data).toHaveLength(1)
    // identifiers deduped before hitting Scryfall
    expect((mockResolveCards.mock.calls[0][0] as unknown[]).length).toBe(1)
  })

  it('skips basic lands with an informational line (not tracked in collections)', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    const res: any = await POST(makeRequest({ text: '12 Plains (FDN) 269' }))
    expect(res.status).toBe(200)
    expect(res.body.added).toEqual([])
    expect(res.body.errors[0].reason).toMatch(/Basic lands/)
    expect(mockResolveCards).not.toHaveBeenCalled()
    expect(mockCollectionCreateMany).not.toHaveBeenCalled()
  })
})
