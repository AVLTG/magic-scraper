import {
  matchesAllFilters,
  deriveWinnerOptions,
  derivePlayerOptions,
  type FilterState,
  type Game,
} from '../src/app/games/page';

function mkParticipant(
  playerName: string,
  isWinner = false,
  isScrewed = false,
  deckName: string | null = null
) {
  return {
    id: `p-${playerName}`,
    gameId: 'g-1',
    playerName,
    isWinner,
    isScrewed,
    deckName,
  };
}

function mkGame(id: string, participants: ReturnType<typeof mkParticipant>[]): Game {
  return {
    id,
    date: '2026-04-10T00:00:00.000Z',
    wonByCombo: false,
    notes: null,
    createdAt: '2026-04-10T00:00:00.000Z',
    participants,
  };
}

const EMPTY_FILTERS: FilterState = { winner: null, playerCount: null, players: [] };

describe('matchesAllFilters (D-17)', () => {
  const gameAB = mkGame('g1', [mkParticipant('Alice', true), mkParticipant('Bob')]);
  const gameABCD = mkGame('g2', [
    mkParticipant('Alice'),
    mkParticipant('Bob'),
    mkParticipant('Carol', true),
    mkParticipant('Dave'),
  ]);
  const gameABC = mkGame('g3', [
    mkParticipant('Alice', true),
    mkParticipant('Bob'),
    mkParticipant('Carol'),
  ]);

  it('returns true when no filter is active', () => {
    expect(matchesAllFilters(gameAB, EMPTY_FILTERS)).toBe(true);
    expect(matchesAllFilters(gameABCD, EMPTY_FILTERS)).toBe(true);
  });

  describe('winner filter', () => {
    it('matches when winner filter equals the game winner', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, winner: 'Alice' })).toBe(true);
    });
    it('rejects when winner filter is a different player', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, winner: 'Bob' })).toBe(false);
    });
    it('rejects a game with no winner when winner filter is active', () => {
      const noWinner = mkGame('g4', [mkParticipant('Alice'), mkParticipant('Bob')]);
      expect(matchesAllFilters(noWinner, { ...EMPTY_FILTERS, winner: 'Alice' })).toBe(false);
    });
  });

  describe('playerCount filter (D-18)', () => {
    it('matches when count equals participants length', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, playerCount: 2 })).toBe(true);
      expect(matchesAllFilters(gameABC, { ...EMPTY_FILTERS, playerCount: 3 })).toBe(true);
      expect(matchesAllFilters(gameABCD, { ...EMPTY_FILTERS, playerCount: 4 })).toBe(true);
    });
    it('rejects mismatched count', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, playerCount: 4 })).toBe(false);
      expect(matchesAllFilters(gameABCD, { ...EMPTY_FILTERS, playerCount: 2 })).toBe(false);
    });
  });

  describe('players multi-select filter (D-17 OR-within)', () => {
    it('matches when ANY selected player is in the game', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, players: ['Alice'] })).toBe(true);
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, players: ['Bob'] })).toBe(true);
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, players: ['Alice', 'Zara'] })).toBe(true);
    });
    it('rejects when NO selected player is in the game', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, players: ['Zara'] })).toBe(false);
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, players: ['Zara', 'Yuki'] })).toBe(false);
    });
    it('treats empty players list as inactive filter (no-op)', () => {
      expect(matchesAllFilters(gameAB, { ...EMPTY_FILTERS, players: [] })).toBe(true);
    });
  });

  describe('AND-across-types combine (D-17)', () => {
    it('requires all active filter types to pass', () => {
      expect(
        matchesAllFilters(gameABCD, { winner: 'Carol', playerCount: 4, players: ['Bob', 'Zara'] })
      ).toBe(true);
    });
    it('rejects when one filter type fails', () => {
      expect(
        matchesAllFilters(gameABC, { winner: 'Alice', playerCount: 4, players: ['Alice'] })
      ).toBe(false); // count 3 != 4
      expect(
        matchesAllFilters(gameABCD, { winner: 'Alice', playerCount: 4, players: ['Alice'] })
      ).toBe(false); // winner is Carol, not Alice
    });
  });
});

describe('deriveWinnerOptions (D-19)', () => {
  it('returns empty array for empty games list', () => {
    expect(deriveWinnerOptions([])).toEqual([]);
  });
  it('returns only players who won at least one game', () => {
    const g1 = mkGame('g1', [mkParticipant('Alice', true), mkParticipant('Bob')]);
    const g2 = mkGame('g2', [mkParticipant('Alice'), mkParticipant('Bob', true)]);
    expect(deriveWinnerOptions([g1, g2])).toEqual(['Alice', 'Bob']);
  });
  it('deduplicates repeat winners', () => {
    const g1 = mkGame('g1', [mkParticipant('Alice', true)]);
    const g2 = mkGame('g2', [mkParticipant('Alice', true)]);
    expect(deriveWinnerOptions([g1, g2])).toEqual(['Alice']);
  });
  it('sorts alphabetically (case-insensitive)', () => {
    const g1 = mkGame('g1', [mkParticipant('Zara', true)]);
    const g2 = mkGame('g2', [mkParticipant('alice', true)]);
    const g3 = mkGame('g3', [mkParticipant('Bob', true)]);
    expect(deriveWinnerOptions([g1, g2, g3])).toEqual(['alice', 'Bob', 'Zara']);
  });
  it('excludes games with no winner', () => {
    const g1 = mkGame('g1', [mkParticipant('Alice'), mkParticipant('Bob')]);
    expect(deriveWinnerOptions([g1])).toEqual([]);
  });
});

describe('derivePlayerOptions (D-20)', () => {
  it('returns empty array for empty games list', () => {
    expect(derivePlayerOptions([])).toEqual([]);
  });
  it('includes all participants (winners AND non-winners)', () => {
    const g1 = mkGame('g1', [mkParticipant('Alice', true), mkParticipant('Bob'), mkParticipant('Carol')]);
    expect(derivePlayerOptions([g1])).toEqual(['Alice', 'Bob', 'Carol']);
  });
  it('deduplicates across games', () => {
    const g1 = mkGame('g1', [mkParticipant('Alice', true), mkParticipant('Bob')]);
    const g2 = mkGame('g2', [mkParticipant('Alice'), mkParticipant('Carol', true)]);
    expect(derivePlayerOptions([g1, g2])).toEqual(['Alice', 'Bob', 'Carol']);
  });
  it('sorts alphabetically (case-insensitive)', () => {
    const g1 = mkGame('g1', [mkParticipant('Zara'), mkParticipant('alice'), mkParticipant('Bob', true)]);
    expect(derivePlayerOptions([g1])).toEqual(['alice', 'Bob', 'Zara']);
  });
});
