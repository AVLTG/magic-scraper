const mockDeckCardFindMany = jest.fn()
const mockDeckCardUpdateMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deckCard: {
      findMany: (...a: unknown[]) => mockDeckCardFindMany(...a),
      updateMany: (...a: unknown[]) => mockDeckCardUpdateMany(...a),
    },
  },
}))

import { enrichDeckCards } from '@/lib/deckEnrich'
import { resolveCardsByName } from '@/lib/scryfall'

const scryfallBody = {
  data: [
    { name: 'Sol Ring', id: 's1', set: 'c21', set_name: 'Commander 2021', type_line: 'Artifact', collector_number: '263', mana_cost: '{1}', cmc: 1, color_identity: [] },
    { name: 'Lightning Bolt', id: 's2', set: 'lea', set_name: 'Limited Edition Alpha', type_line: 'Instant', collector_number: '100', mana_cost: '{R}', cmc: 1, color_identity: ['R'] },
  ],
}

const mockFetcher = (async () =>
  ({ ok: true, status: 200, json: async () => scryfallBody }) as Response) as typeof fetch

describe('resolveCardsByName', () => {
  it('maps canonical-lowercased names with mana fields', async () => {
    const found = await resolveCardsByName(['sol ring', 'Lightning Bolt'], mockFetcher)
    expect(found.get('sol ring')).toEqual(expect.objectContaining({ cmc: 1, manaCost: '{1}', colors: '' }))
    expect(found.get('lightning bolt')).toEqual(expect.objectContaining({ cmc: 1, manaCost: '{R}', colors: 'R' }))
  });

  it('throws on Scryfall errors', async () => {
    const bad = (async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as typeof fetch
    await expect(resolveCardsByName(['Sol Ring'], bad)).rejects.toThrow(/503/)
  });
});

describe('enrichDeckCards', () => {
  beforeEach(() => {
    mockDeckCardFindMany.mockReset(); mockDeckCardUpdateMany.mockReset()
  })

  it('backfills null-cmc rows and reports unresolved names', async () => {
    mockDeckCardFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }, { cardName: 'Made Up Card' }])
    mockDeckCardUpdateMany.mockResolvedValue({ count: 1 })
    const result = await enrichDeckCards('d1', mockFetcher)
    expect(result).toEqual({ enriched: 1, unresolved: ['Made Up Card'] })
    expect(mockDeckCardUpdateMany).toHaveBeenCalledWith({
      where: { deckId: 'd1', cardName: 'Sol Ring', cmc: null },
      data: { cmc: 1, manaCost: '{1}', colors: '' },
    });
  });

  it('does nothing when every card already has data', async () => {
    mockDeckCardFindMany.mockResolvedValue([])
    const fetcher = jest.fn()
    await expect(enrichDeckCards('d1', fetcher as unknown as typeof fetch)).resolves.toEqual({
      enriched: 0, unresolved: [],
    });
    expect(fetcher).not.toHaveBeenCalled()
  });
});
