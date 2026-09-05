jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
}))
const mockCollectionFindMany = jest.fn()
const mockDeckCardFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deckCard: { findMany: (...a: unknown[]) => mockDeckCardFindMany(...a) },
  },
}))

const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))

import { POST } from '../src/app/api/checkDeck/route'

let ipCounter = 0
function makeRequest(body: Record<string, unknown>): Request {
  ipCounter += 1
  return {
    json: async () => body,
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.1.0.${ipCounter}` : null) },
  } as unknown as Request
}

describe('POST /api/checkDeck deck associations', () => {
  beforeEach(() => {
    mockCollectionFindMany.mockReset(); mockDeckCardFindMany.mockReset()
    mockGetSession.mockReset().mockResolvedValue({ userId: 'u1', role: 'MEMBER', isLegacyAdmin: false })
  })

  it('attaches each OWNER own deck names to their owner rows', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
      { userId: 'u2', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 2, condition: 'NearMint', isFoil: false, user: { name: 'Bob' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([
      { cardName: 'SOL RING', deck: { name: 'Krenko', ownerUserId: 'u1' } },
    ])
    const res: any = await POST(makeRequest({ decklist: 'Sol Ring' }))
    const owners = res.body.results[0].printings[0].owners
    expect(owners.find((o: { name: string }) => o.name === 'Alice').decks).toEqual(['Krenko'])
    expect(owners.find((o: { name: string }) => o.name === 'Bob').decks).toEqual([])
  })

  it('returns empty decks arrays when no deck contains the cards', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([])
    const res: any = await POST(makeRequest({ decklist: 'Sol Ring' }))
    expect(res.body.results[0].printings[0].owners[0].decks).toEqual([])
  })

  it('scopes the deck-card query to the matched card names, not the owners entire libraries', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([])
    await POST(makeRequest({ decklist: 'Sol Ring' }))
    expect(mockDeckCardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cardName: { in: ['Sol Ring'] },
          deck: { ownerUserId: { in: ['u1'] } },
        }),
      })
    )
  })

  it('badges only the collection rows matching the deck card foil/printing', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Greater Tanuki', set: 'neo', setName: 'Kamigawa: Neon Dynasty', scryfallId: 's9', quantity: 1, condition: 'NearMint', isFoil: true, user: { name: 'Alice' } },
      { userId: 'u1', cardName: 'Greater Tanuki', set: 'neo', setName: 'Kamigawa: Neon Dynasty', scryfallId: 's9', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
      { userId: 'u1', cardName: 'Greater Tanuki', set: 'dsc', setName: 'Duskmourn Commander', scryfallId: 's10', quantity: 2, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([
      { cardName: 'Greater Tanuki', set: 'NEO', collectorNumber: '189', isFoil: true, deck: { name: 'Anikthea', ownerUserId: 'u1' } },
    ])
    const res: any = await POST(makeRequest({ decklist: 'Greater Tanuki' }))
    const owners = res.body.results[0].printings.flatMap((p: { owners: unknown[] }) => p.owners)
    const foil = owners.filter((o: { isFoil: boolean }) => o.isFoil)
    const nonFoil = owners.filter((o: { isFoil: boolean }) => !o.isFoil)
    expect(foil).toHaveLength(1)
    expect(foil[0].decks).toEqual(['Anikthea'])
    for (const o of nonFoil) expect(o.decks).toEqual([])
  })

  it('falls back to foil-level then name-level badges when the exact printing is not in the collection', async () => {
    // Deck card says CM2 foil; owner only has C21 foil + C21 non-foil -> foil-level match
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: true, user: { name: 'Alice' } },
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([
      { cardName: 'Sol Ring', set: 'CM2', collectorNumber: '184', isFoil: true, deck: { name: 'Artifacts', ownerUserId: 'u1' } },
      // name-only deck card (no printing info, non-foil default) badges the non-foil row
      { cardName: 'Sol Ring', set: null, collectorNumber: null, isFoil: false, deck: { name: 'Budget', ownerUserId: 'u1' } },
    ])
    const res: any = await POST(makeRequest({ decklist: 'Sol Ring' }))
    const owners = res.body.results[0].printings.flatMap((p: { owners: unknown[] }) => p.owners)
    expect(owners.find((o: { isFoil: boolean }) => o.isFoil).decks).toEqual(['Artifacts'])
    expect(owners.find((o: { isFoil: boolean }) => !o.isFoil).decks).toEqual(['Budget'])
  })

  it('badges every row of the name when neither printing nor foilness matches any collection row', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([
      { cardName: 'Sol Ring', set: 'CM2', collectorNumber: '184', isFoil: true, deck: { name: 'Artifacts', ownerUserId: 'u1' } },
    ])
    const res: any = await POST(makeRequest({ decklist: 'Sol Ring' }))
    expect(res.body.results[0].printings[0].owners[0].decks).toEqual(['Artifacts'])
  })

  it('tolerates Moxfield-export pastes: strips "(SET) NUM *F*" and queries MDFC name variants', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    mockDeckCardFindMany.mockResolvedValue([])
    await POST(
      makeRequest({ decklist: '1 Treasure Vault (AFR) 261 *F*\n1 Spikefield Hazard / Spikefield Cave (ZNR) 166' })
    )
    const queried = mockCollectionFindMany.mock.calls[0][0].where.cardName.in
    expect(queried).toEqual(
      expect.arrayContaining([
        'Treasure Vault',
        'Spikefield Hazard / Spikefield Cave',
        'Spikefield Hazard // Spikefield Cave',
      ])
    )
  })
})
