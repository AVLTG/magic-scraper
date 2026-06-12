import { resolveCards, scryfallKey } from '@/lib/scryfall'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function scryfallResponse(data: unknown[], notFound: unknown[] = []) {
  return { ok: true, json: async () => ({ data, not_found: notFound }) }
}

describe('resolveCards', () => {
  beforeEach(() => mockFetch.mockReset())

  it('resolves identifiers and splits found / notFound', async () => {
    mockFetch.mockResolvedValue(
      scryfallResponse(
        [{ name: 'Treasure Vault', id: 'sc1', set: 'afr', set_name: 'Adventures in the Forgotten Realms', type_line: 'Artifact Land', collector_number: '261' }],
        [{ set: 'xxx', collector_number: '999' }]
      )
    )
    const { found, notFound } = await resolveCards([
      { set: 'AFR', collectorNumber: '261' },
      { set: 'XXX', collectorNumber: '999' },
    ])
    expect(found.get(scryfallKey('AFR', '261'))).toEqual({
      name: 'Treasure Vault', scryfallId: 'sc1', set: 'afr',
      setName: 'Adventures in the Forgotten Realms', typeLine: 'Artifact Land', collectorNumber: '261',
    })
    expect(notFound).toEqual([{ set: 'xxx', collectorNumber: '999' }])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.identifiers[0]).toEqual({ set: 'afr', collector_number: '261' })
    // Scryfall 400s requests without these headers — pin them
    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['User-Agent']).toBe('TableTally/1.0')
    expect(headers.Accept).toBe('application/json')
  })

  it('batches requests at 75 identifiers', async () => {
    mockFetch.mockResolvedValue(scryfallResponse([]))
    const ids = Array.from({ length: 76 }, (_, i) => ({ set: 'abc', collectorNumber: String(i) }))
    await resolveCards(ids)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).identifiers).toHaveLength(75)
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).identifiers).toHaveLength(1)
  })

  it('throws on a non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    await expect(resolveCards([{ set: 'afr', collectorNumber: '1' }])).rejects.toThrow('503')
  })

  it('returns empty result for empty input without fetching', async () => {
    const { found, notFound } = await resolveCards([])
    expect(found.size).toBe(0)
    expect(notFound).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
