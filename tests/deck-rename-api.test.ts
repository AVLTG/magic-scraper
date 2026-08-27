const mockDeckFindUnique = jest.fn()
const mockDeckFindFirst = jest.fn()
const mockDeckFindMany = jest.fn()
const mockDeckUpdate = jest.fn()
const mockGPFindMany = jest.fn()
const mockGPUpdateMany = jest.fn()
const tx = {
  deck: { update: (...a: unknown[]) => mockDeckUpdate(...a) },
  gameParticipant: {
    findMany: (...a: unknown[]) => mockGPFindMany(...a),
    updateMany: (...a: unknown[]) => mockGPUpdateMany(...a),
  },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      findFirst: (...a: unknown[]) => mockDeckFindFirst(...a),
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
    },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))

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
import { PATCH } from '../src/app/api/decks/[id]/route'
const params = { params: Promise.resolve({ id: 'd1' }) }

describe('PATCH /api/decks/[id] (rename)', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockDeckFindFirst.mockReset(); mockDeckFindMany.mockReset()
    mockDeckUpdate.mockReset(); mockGPFindMany.mockReset(); mockGPUpdateMany.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Old Name', ownerUserId: 'u1', owner: { name: 'Alice' } })
    mockDeckFindFirst.mockResolvedValue(null)
    mockDeckFindMany.mockResolvedValue([])
  })

  it('renames the deck and propagates the new name to the owner matching game participants', async () => {
    mockDeckUpdate.mockResolvedValue({ id: 'd1', name: 'New Name' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', gameId: 'g1', deckName: 'Old Name', playerName: 'Alice' },
      { id: 'p2', gameId: 'g2', deckName: 'old name', playerName: 'alice' },
      { id: 'p3', gameId: 'g3', deckName: 'Other', playerName: 'Alice' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    const res: any = await PATCH(makeRequest({ name: 'New Name' }), params)
    expect(mockDeckUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { name: 'New Name' } })
    expect(mockGPUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] } }, data: { deckName: 'New Name' } })
    expect(res.body).toEqual({ deck: { id: 'd1', name: 'New Name' }, renamedGames: 2 })
  })

  it('never rewrites another player history that happens to use the same deck name', async () => {
    mockDeckUpdate.mockResolvedValue({ id: 'd1', name: 'New Name' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', gameId: 'g1', deckName: 'Old Name', playerName: 'Alice' },
      { id: 'p2', gameId: 'g2', deckName: 'Old Name', playerName: 'Bob' },
      { id: 'p3', gameId: 'g3', deckName: 'old name', playerName: 'Bob' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 1 })
    const res: any = await PATCH(makeRequest({ name: 'New Name' }), params)
    expect(mockGPUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } }, data: { deckName: 'New Name' } })
    expect(res.body.renamedGames).toBe(1)
  })

  it('403s a non-owner; 404s a missing deck; 400s an empty name', async () => {
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    expect(((await PATCH(makeRequest({ name: 'X' }), params)) as any).status).toBe(403)
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await PATCH(makeRequest({ name: 'X' }), params)) as any).status).toBe(404)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Old Name', ownerUserId: 'u1', owner: { name: 'Alice' } })
    expect(((await PATCH(makeRequest({ name: '   ' }), params)) as any).status).toBe(400)
  })

  it('409s when the owner already has another deck with that name (case-insensitive)', async () => {
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Old Name' },
      { id: 'd2', name: 'Krenko' },
    ])
    const res: any = await PATCH(makeRequest({ name: '  krenko ' }), params)
    expect(res.status).toBe(409)
    expect(mockDeckUpdate).not.toHaveBeenCalled()
  })
})
