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
  beforeEach(() => { mockCollectionFindMany.mockReset(); mockDeckCardFindMany.mockReset() })

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
})
