import { computeUnlinkedDecks, computeUnlinkedPlayers, normalizeName } from '@/lib/reconcile'
import { matchDeckParticipants } from '@/lib/reconcile'

const P = (gameId: string, playerName: string, deckName: string | null, isRandom = false) => ({
  gameId,
  playerName,
  deckName,
  isRandom,
})

describe('computeUnlinkedDecks', () => {
  it('returns distinct deckNames with no case-insensitive match to existing decks', () => {
    const parts = [P('g1', 'Al', 'Anikthea'), P('g2', 'Bo', 'anikthea '), P('g3', 'Cy', 'Sliver Swarm')]
    expect(computeUnlinkedDecks(parts, ['Sliver Swarm'])).toEqual([{ name: 'Anikthea', gameCount: 2 }])
  })

  it('skips null/empty/whitespace deckNames', () => {
    const parts = [P('g1', 'Al', null), P('g2', 'Bo', '   '), P('g3', 'Cy', '')]
    expect(computeUnlinkedDecks(parts, [])).toEqual([])
  })

  it('counts distinct games, not participant rows', () => {
    const parts = [P('g1', 'Al', 'Goblins'), P('g1', 'Bo', 'Goblins'), P('g2', 'Cy', 'Goblins')]
    expect(computeUnlinkedDecks(parts, [])).toEqual([{ name: 'Goblins', gameCount: 2 }])
  })

  it('sorts by name', () => {
    const parts = [P('g1', 'Al', 'Zoo'), P('g2', 'Bo', 'Affinity')]
    expect(computeUnlinkedDecks(parts, []).map((d) => d.name)).toEqual(['Affinity', 'Zoo'])
  })
})

describe('computeUnlinkedPlayers', () => {
  it('returns distinct non-random playerNames with no match to existing users', () => {
    const parts = [P('g1', 'Dave', null), P('g2', 'dave ', null), P('g3', 'Erin', null)]
    expect(computeUnlinkedPlayers(parts, ['Erin'])).toEqual([{ name: 'Dave', gameCount: 2 }])
  })

  it('excludes random players', () => {
    const parts = [P('g1', 'Random', null, true), P('g2', 'Frank', null)]
    expect(computeUnlinkedPlayers(parts, []).map((p) => p.name)).toEqual(['Frank'])
  })
})

describe('normalizeName', () => {
  it('trims and lowercases', () => {
    expect(normalizeName('  Foo Bar ')).toBe('foo bar')
  })
})

describe('matchDeckParticipants', () => {
  const P = (id: string, gameId: string, deckName: string | null) => ({ id, gameId, deckName })

  it('returns ids whose deckName matches (case/space-insensitive) and the distinct game count', () => {
    const parts = [P('a', 'g1', 'Anikthea'), P('b', 'g1', 'anikthea '), P('c', 'g2', 'ANIKTHEA'), P('d', 'g3', 'Goblins')]
    expect(matchDeckParticipants(parts, 'anikthea')).toEqual({ ids: ['a', 'b', 'c'], gameCount: 2 })
  })

  it('skips null deckNames and returns empty when nothing matches', () => {
    const parts = [P('a', 'g1', null), P('b', 'g2', 'Goblins')]
    expect(matchDeckParticipants(parts, 'Slivers')).toEqual({ ids: [], gameCount: 0 })
  })
})
