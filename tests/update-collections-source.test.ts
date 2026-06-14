const mockDeleteMany = jest.fn().mockResolvedValue({ count: 0 })
const mockCreateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockUserUpdate = jest.fn().mockResolvedValue({})
const mockSyncLogCreate = jest.fn().mockResolvedValue({})
const mockFindUnique = jest.fn()

const tx = {
  collectionCard: { deleteMany: mockDeleteMany, createMany: mockCreateMany },
  user: { update: mockUserUpdate },
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a), findMany: jest.fn() },
    syncLog: { create: (...a: unknown[]) => mockSyncLogCreate(...a) },
    collectionCard: { count: jest.fn().mockResolvedValue(0) },
  },
}))

const mockScrape = jest.fn()
jest.mock('@/lib/scrapeMoxfield/scrapeMoxfield', () => ({
  scrapeMoxfield: (...a: unknown[]) => mockScrape(...a),
}))
jest.mock('server-only', () => ({}), { virtual: true })

import { updateUserCollection } from '@/lib/updateCollections'

describe('collection sync preserves manual library cards', () => {
  beforeEach(() => {
    mockDeleteMany.mockClear()
    mockCreateMany.mockClear()
    mockFindUnique.mockReset()
    mockScrape.mockReset()
  })

  it('only deletes moxfield-sourced rows and stamps new rows as moxfield', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', name: 'Alice', moxfieldCollectionId: 'mox1' })
    mockScrape.mockResolvedValue([
      { name: 'Sol Ring', scryfall_id: 's1', quantity: 1, condition: 'NearMint', isFoil: false, set: 'c21', set_name: 'Commander 2021', type_line: 'Artifact' },
    ])
    const result = await updateUserCollection('u1')
    expect(result.success).toBe(true)
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', source: 'moxfield' } })
    const created = mockCreateMany.mock.calls[0][0].data
    expect(created[0].source).toBe('moxfield')
  })
})
