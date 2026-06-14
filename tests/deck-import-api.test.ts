const mockCollectionFindMany = jest.fn()
const mockCollectionCreateMany = jest.fn()
const mockDeckFindMany = jest.fn()
const mockDeckCreate = jest.fn()
const tx = {
  collectionCard: { createMany: (...a: unknown[]) => mockCollectionCreateMany(...a) },
  deck: { create: (...a: unknown[]) => mockDeckCreate(...a) },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a) },
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

import { POST } from '../src/app/api/decks/import/route'
import { scryfallKey } from '@/lib/scryfall'

const TEXT = '1 Sol Ring (C21) 263\n2 Treasure Vault (AFR) 261 *F*'

describe('POST /api/decks/import', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockCollectionFindMany.mockReset(); mockCollectionCreateMany.mockReset()
    mockDeckFindMany.mockReset(); mockDeckCreate.mockReset(); mockResolveCards.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue([])
    mockDeckCreate.mockResolvedValue({ id: 'new-deck', name: 'Imported' })
  })

  it('dryRun diffs against the library and lists missing cards without writing', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(makeRequest({ name: 'Imported', text: TEXT, dryRun: true }))
    expect(res.status).toBe(200)
    expect(res.body.missing).toEqual([
      { line: 2, cardName: 'Treasure Vault', set: 'AFR', collectorNumber: '261' },
    ])
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('commit with addMissingToLibrary=false imports only library cards and reports the excluded', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: TEXT, dryRun: false, addMissingToLibrary: false })
    )
    expect(res.status).toBe(201)
    expect(res.body.excluded).toEqual(['Treasure Vault'])
    const createArg = mockDeckCreate.mock.calls[0][0].data
    expect(createArg.cards.create).toEqual([
      expect.objectContaining({ cardName: 'Sol Ring', quantity: 1 }),
    ])
    expect(mockCollectionCreateMany).not.toHaveBeenCalled()
  })

  it('commit with addMissingToLibrary=true resolves missing, adds them to library, imports all', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('AFR', '261'), { name: 'Treasure Vault', scryfallId: 's1', set: 'afr', setName: 'AFR', typeLine: 'Artifact Land', collectorNumber: '261' }],
      ]),
      notFound: [],
    })
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: TEXT, dryRun: false, addMissingToLibrary: true })
    )
    expect(res.status).toBe(201)
    expect(res.body.addedToLibrary).toBe(1)
    expect(mockCollectionCreateMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({ cardName: 'Treasure Vault', source: 'manual', quantity: 2, isFoil: true })
    )
    const deckCards = mockDeckCreate.mock.calls[0][0].data.cards.create
    expect(deckCards).toHaveLength(2)
  })

  it('422s addMissing commits when a missing card cannot be resolved (nothing written)', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    mockResolveCards.mockResolvedValue({ found: new Map(), notFound: [{ set: 'c21', collectorNumber: '263' }] })
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: '1 Sol Ring (C21) 263', dryRun: false, addMissingToLibrary: true })
    )
    expect(res.status).toBe(422)
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('422s addMissing commits when a missing card has no set/collector number', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: '1 Sol Ring', dryRun: false, addMissingToLibrary: true })
    )
    expect(res.status).toBe(422)
  })

  it('merges duplicate names (two printings) into one deck card with summed quantity', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(
      makeRequest({
        name: 'Imported',
        text: '1 Sol Ring (C21) 263\n2 Sol Ring (CM2) 184',
        dryRun: false,
        addMissingToLibrary: false,
      })
    )
    expect(res.status).toBe(201)
    const deckCards = mockDeckCreate.mock.calls[0][0].data.cards.create
    expect(deckCards).toEqual([expect.objectContaining({ cardName: 'Sol Ring', quantity: 3, set: 'C21' })])
    // cardCount is the TOTAL (summed quantities), matching GET /api/decks and the
    // deck detail page — not the number of distinct rows.
    expect(res.body.deck.cardCount).toBe(3)
  })

  it('409s duplicate deck names and 403s the legacy admin', async () => {
    mockDeckFindMany.mockResolvedValue([{ name: 'imported' }])
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await POST(makeRequest({ name: 'Imported', text: '1 Sol Ring', dryRun: false, addMissingToLibrary: false }))
    expect(res.status).toBe(409)
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await POST(makeRequest({ name: 'X', text: 'y', dryRun: true }))) as any).status).toBe(403)
  })

  it('imports basic lands freely: never missing, in the deck, not added to library', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const text = '1 Sol Ring (C21) 263\n12 Plains (FDN) 269\n3 Snow-Covered Island (KHM) 278'
    const dry: any = await POST(makeRequest({ name: 'Landfall', text, dryRun: true }))
    expect(dry.body.missing).toEqual([])
    const res: any = await POST(makeRequest({ name: 'Landfall', text, dryRun: false, addMissingToLibrary: false }))
    expect(res.status).toBe(201)
    expect(res.body.excluded).toEqual([])
    const deckCards = mockDeckCreate.mock.calls[0][0].data.cards.create
    expect(deckCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardName: 'Plains', quantity: 12 }),
        expect.objectContaining({ cardName: 'Snow-Covered Island', quantity: 3 }),
        expect.objectContaining({ cardName: 'Sol Ring', quantity: 1 }),
      ])
    )
    expect(mockCollectionCreateMany).not.toHaveBeenCalled()
  })
})
