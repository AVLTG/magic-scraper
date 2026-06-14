const mockGPFindMany = jest.fn()
const mockGPUpdateMany = jest.fn()
const mockDeckFindMany = jest.fn()
const mockDeckFindUnique = jest.fn()
const mockDeckCreate = jest.fn()
const mockDeckCreateMany = jest.fn()
const mockUserFindMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockUserCreate = jest.fn()
const mockUserCreateMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameParticipant: {
      findMany: (...a: unknown[]) => mockGPFindMany(...a),
      updateMany: (...a: unknown[]) => mockGPUpdateMany(...a),
    },
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      create: (...a: unknown[]) => mockDeckCreate(...a),
      createMany: (...a: unknown[]) => mockDeckCreateMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      create: (...a: unknown[]) => mockUserCreate(...a),
      createMany: (...a: unknown[]) => mockUserCreateMany(...a),
    },
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
  NextRequest: jest.fn(),
}))

const mockRequireAdmin = jest.fn()
jest.mock('@/lib/session', () => ({ requireAdmin: (...a: unknown[]) => mockRequireAdmin(...a) }))

import { GET } from '@/app/api/admin/reconcile/route'
import { POST as decksPOST } from '@/app/api/admin/reconcile/decks/route'
import { POST as playersPOST } from '@/app/api/admin/reconcile/players/route'

const ADMIN_OK = { ok: true, session: { userId: 'a', role: 'ADMIN', isLegacyAdmin: false } }
function req(body?: Record<string, unknown>): any {
  return { json: async () => body ?? {} }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(ADMIN_OK)
})

describe('GET /api/admin/reconcile', () => {
  it('returns the unlinked deck and player lists', async () => {
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', playerName: 'Dave', deckName: 'Anikthea', isRandom: false },
      { gameId: 'g2', playerName: 'Erin', deckName: 'Sliver Swarm', isRandom: false },
    ])
    mockDeckFindMany.mockResolvedValue([{ name: 'Sliver Swarm' }])
    mockUserFindMany.mockResolvedValue([{ name: 'Erin' }])
    const res: any = await GET()
    expect(res.body.unlinkedDecks).toEqual([{ name: 'Anikthea', gameCount: 1 }])
    expect(res.body.unlinkedPlayers).toEqual([{ name: 'Dave', gameCount: 1 }])
  })

  it('403s a non-admin without querying', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } })
    expect(((await GET()) as any).status).toBe(403)
    expect(mockGPFindMany).not.toHaveBeenCalled()
  })

  it('401s when there is no session, without querying', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 401 } })
    expect(((await GET()) as any).status).toBe(401)
    expect(mockGPFindMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/reconcile/decks', () => {
  it('link renames exactly the participants whose deckName matches (case-insensitive)', async () => {
    mockDeckFindUnique.mockResolvedValue({ name: 'Anikthea Combo' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', deckName: 'Anikthea' },
      { id: 'p2', deckName: 'anikthea ' },
      { id: 'p3', deckName: 'Goblins' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    const res: any = await decksPOST(req({ action: 'link', name: 'Anikthea', targetDeckId: 'd1' }))
    expect(mockGPUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      data: { deckName: 'Anikthea Combo' },
    })
    expect(res.body).toEqual({ renamed: 2 })
  })

  it('link 404s when the target deck is missing', async () => {
    mockDeckFindUnique.mockResolvedValue(null)
    const res: any = await decksPOST(req({ action: 'link', name: 'X', targetDeckId: 'ghost' }))
    expect(res.status).toBe(404)
    expect(mockGPUpdateMany).not.toHaveBeenCalled()
  })

  it('create inserts an unassigned name-only deck', async () => {
    mockDeckCreate.mockResolvedValue({ id: 'd9', name: 'New Deck', ownerUserId: null })
    const res: any = await decksPOST(req({ action: 'create', name: '  New Deck ' }))
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'New Deck', ownerUserId: null } })
    expect(res.status).toBe(201)
  })

  it('create with an owner verifies the user (400 if missing, inserts if present)', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)
    expect(((await decksPOST(req({ action: 'create', name: 'X', ownerUserId: 'ghost' }))) as any).status).toBe(400)
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u1' })
    mockDeckCreate.mockResolvedValue({ id: 'd9', name: 'X', ownerUserId: 'u1' })
    const res: any = await decksPOST(req({ action: 'create', name: 'X', ownerUserId: 'u1' }))
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'X', ownerUserId: 'u1' } })
    expect(res.status).toBe(201)
  })

  it('createAll creates only the unmatched deck names (idempotent)', async () => {
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', playerName: 'Al', deckName: 'Anikthea', isRandom: false },
      { gameId: 'g2', playerName: 'Bo', deckName: 'Existing', isRandom: false },
    ])
    mockDeckFindMany.mockResolvedValue([{ name: 'Existing' }])
    mockDeckCreateMany.mockResolvedValue({ count: 1 })
    const res: any = await decksPOST(req({ action: 'createAll' }))
    expect(mockDeckCreateMany).toHaveBeenCalledWith({ data: [{ name: 'Anikthea' }] })
    expect(res.body).toEqual({ created: 1 })
  })

  it('unknown action 400s; non-admin 403s without mutating', async () => {
    expect(((await decksPOST(req({ action: 'bogus' }))) as any).status).toBe(400)
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } })
    expect(((await decksPOST(req({ action: 'createAll' }))) as any).status).toBe(403)
    expect(mockDeckCreateMany).not.toHaveBeenCalled()
  })

  it('400s on invalid JSON without mutating', async () => {
    const badReq: any = { json: async () => { throw new SyntaxError('Unexpected token') } }
    const res: any = await decksPOST(badReq)
    expect(res.status).toBe(400)
    expect(mockDeckCreate).not.toHaveBeenCalled()
    expect(mockDeckCreateMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/reconcile/players', () => {
  it('link renames matching non-random participants to the target user name', async () => {
    mockUserFindUnique.mockResolvedValue({ name: 'Dave' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', playerName: 'Dave S', isRandom: false },
      { id: 'p2', playerName: 'dave s ', isRandom: false },
      { id: 'p3', playerName: 'Dave S', isRandom: true },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    const res: any = await playersPOST(req({ action: 'link', name: 'Dave S', targetUserId: 'u1' }))
    expect(mockGPUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      data: { playerName: 'Dave' },
    })
    expect(res.body).toEqual({ renamed: 2 })
  })

  it('link 404s when the target user is missing', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res: any = await playersPOST(req({ action: 'link', name: 'X', targetUserId: 'ghost' }))
    expect(res.status).toBe(404)
    expect(mockGPUpdateMany).not.toHaveBeenCalled()
  })

  it('create inserts a placeholder user', async () => {
    mockUserFindMany.mockResolvedValue([{ name: 'Existing' }])
    mockUserCreate.mockResolvedValue({ id: 'u9', name: 'Dave' })
    const res: any = await playersPOST(req({ action: 'create', name: '  Dave ' }))
    expect(mockUserCreate).toHaveBeenCalledWith({ data: { name: 'Dave' } })
    expect(res.status).toBe(201)
  })

  it('create 409s on a duplicate name (case-insensitive) without inserting', async () => {
    mockUserFindMany.mockResolvedValue([{ name: 'Dave' }])
    const res: any = await playersPOST(req({ action: 'create', name: 'dave' }))
    expect(res.status).toBe(409)
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('createAll creates only unmatched, non-random player names (idempotent)', async () => {
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', playerName: 'Dave', deckName: null, isRandom: false },
      { gameId: 'g2', playerName: 'Random', deckName: null, isRandom: true },
      { gameId: 'g3', playerName: 'Erin', deckName: null, isRandom: false },
    ])
    mockUserFindMany.mockResolvedValue([{ name: 'Erin' }])
    mockUserCreateMany.mockResolvedValue({ count: 1 })
    const res: any = await playersPOST(req({ action: 'createAll' }))
    expect(mockUserCreateMany).toHaveBeenCalledWith({ data: [{ name: 'Dave' }] })
    expect(res.body).toEqual({ created: 1 })
  })

  it('non-admin 403s without mutating', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } })
    expect(((await playersPOST(req({ action: 'createAll' }))) as any).status).toBe(403)
    expect(mockUserCreateMany).not.toHaveBeenCalled()
  })
})
