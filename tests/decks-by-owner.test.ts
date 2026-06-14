const mockDeckFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({ prisma: { deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a) } } }))
jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })) },
}))
const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))
let ipCounter = 0
function makeRequest(): Request {
  ipCounter += 1
  return { headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) } } as unknown as Request
}
import { GET } from '../src/app/api/decks/route'

describe('GET /api/decks decksByOwner', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockDeckFindMany.mockReset(); mockGetSession.mockResolvedValue({ userId: 'u1', role: 'MEMBER', isLegacyAdmin: false }) })

  it('groups owned decks by owner name (ownerless excluded)', async () => {
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', owner: { name: 'Me' }, cards: [] },
      { id: 'd2', name: 'Shart', ownerUserId: 'u2', owner: { name: 'Francisco' }, cards: [] },
      { id: 'd3', name: 'Slivers', ownerUserId: 'u2', owner: { name: 'Francisco' }, cards: [] },
      { id: 'd4', name: 'Legacy', ownerUserId: null, owner: null, cards: [] },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.decksByOwner).toEqual([
      { ownerName: 'Me', deckNames: ['Krenko'] },
      { ownerName: 'Francisco', deckNames: ['Shart', 'Slivers'] },
    ])
  })
})
