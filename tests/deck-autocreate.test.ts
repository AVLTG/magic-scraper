const mockDeckFindMany = jest.fn()
const mockDeckCreate = jest.fn()
const mockUserFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a), create: (...a: unknown[]) => mockDeckCreate(...a) },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) },
  },
}))

import { ensureDecksForParticipants } from '@/lib/deckAutoCreate'

describe('ensureDecksForParticipants', () => {
  beforeEach(() => {
    mockDeckFindMany.mockReset(); mockDeckCreate.mockReset(); mockUserFindMany.mockReset()
    mockDeckFindMany.mockResolvedValue([])
    mockUserFindMany.mockResolvedValue([{ id: 'u-bob', name: 'Bob' }])
    mockDeckCreate.mockResolvedValue({})
  })

  it('creates a name-only deck owned by the user matching the playerName', async () => {
    await ensureDecksForParticipants([
      { playerName: 'bob', deckName: 'New Brew', isRandom: false },
    ])
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'New Brew', ownerUserId: 'u-bob' } })
  })

  it('creates ownerless decks for unknown players', async () => {
    await ensureDecksForParticipants([
      { playerName: 'Stranger', deckName: 'Mystery', isRandom: false },
    ])
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'Mystery', ownerUserId: null } })
  })

  it('skips random participants entirely', async () => {
    await ensureDecksForParticipants([
      { playerName: 'Bob', deckName: 'Arena Netdeck', isRandom: true },
    ])
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('skips existing deck names (case-insensitive, any owner) and empty deckNames', async () => {
    mockDeckFindMany.mockResolvedValue([{ name: 'Krenko' }])
    await ensureDecksForParticipants([
      { playerName: 'Bob', deckName: 'KRENKO', isRandom: false },
      { playerName: 'Bob', deckName: '  ', isRandom: false },
      { playerName: 'Bob', deckName: undefined, isRandom: false },
    ])
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('dedupes within one call (two rows, same new deck)', async () => {
    await ensureDecksForParticipants([
      { playerName: 'Bob', deckName: 'Shared Precon', isRandom: false },
      { playerName: 'Stranger', deckName: 'shared precon', isRandom: false },
    ])
    expect(mockDeckCreate).toHaveBeenCalledTimes(1)
  })

  it('never throws — a deck failure must not fail the game save', async () => {
    mockDeckFindMany.mockRejectedValue(new Error('db down'))
    await expect(
      ensureDecksForParticipants([{ playerName: 'Bob', deckName: 'X', isRandom: false }])
    ).resolves.toBeUndefined()
  })
})
