import {
  matchesAllFilters,
  deriveWinnerOptions,
  derivePlayerOptions,
  deriveDeckOptions,
  type FilterState,
  type Game,
} from '../src/app/games/page';

function mkParticipant(
  playerName: string,
  isWinner = false,
  isScrewed = false,
  deckName: string | null = null,
  isRandom = false
) {
  return {
    id: `p-${playerName}`,
    gameId: 'g-1',
    playerName,
    isWinner,
    isScrewed,
    isRandom,
    deckName,
  };
}

function mkGame(id: string, participants: ReturnType<typeof mkParticipant>[]): Game {
  return {
    id,
    date: '2026-04-10T00:00:00.000Z',
    wonByCombo: false,
    isImported: false,
    notes: null,
    createdAt: '2026-04-10T00:00:00.000Z',
    participants,
  };
}

const EMPTY_FILTERS: FilterState = { winner: null, playerCount: null, players: [], decks: [] };

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
    it('matches a 6-player game when playerCount filter is 6', () => {
      const game6 = mkGame('g6', [
        mkParticipant('A', true),
        mkParticipant('B'),
        mkParticipant('C'),
        mkParticipant('D'),
        mkParticipant('E'),
        mkParticipant('F'),
      ]);
      expect(matchesAllFilters(game6, { winner: null, playerCount: 6, players: [], decks: [] })).toBe(true);
      expect(matchesAllFilters(game6, { winner: null, playerCount: 4, players: [], decks: [] })).toBe(false);
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
        matchesAllFilters(gameABCD, { winner: 'Carol', playerCount: 4, players: ['Bob', 'Zara'], decks: [] })
      ).toBe(true);
    });
    it('rejects when one filter type fails', () => {
      expect(
        matchesAllFilters(gameABC, { winner: 'Alice', playerCount: 4, players: ['Alice'], decks: [] })
      ).toBe(false); // count 3 != 4
      expect(
        matchesAllFilters(gameABCD, { winner: 'Alice', playerCount: 4, players: ['Alice'], decks: [] })
      ).toBe(false); // winner is Carol, not Alice
    });
  });

  describe('decks filter', () => {
    const selvala = mkGame('g-s', [
      mkParticipant('Alice', true, false, 'Selvala'),
      mkParticipant('Bob', false, false, 'Atraxa'),
    ]);
    const breya = mkGame('g-b', [
      mkParticipant('Carol', true, false, 'Breya'),
      mkParticipant('Dave', false, false, 'Atraxa'),
    ]);
    const allBlank = mkGame('g-x', [
      mkParticipant('Eve', true, false, null),
      mkParticipant('Frank', false, false, '   '),
    ]);

    it('passthrough when decks array is empty', () => {
      expect(matchesAllFilters(selvala, EMPTY_FILTERS)).toBe(true);
      expect(matchesAllFilters(allBlank, EMPTY_FILTERS)).toBe(true);
    });

    it('matches when any participant played the selected deck', () => {
      expect(matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Selvala'] })).toBe(true);
      expect(matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Atraxa'] })).toBe(true);
    });

    it('multi-select is OR within: any of the selected decks suffices', () => {
      expect(
        matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Breya', 'Atraxa'] })
      ).toBe(true);
      expect(
        matchesAllFilters(breya, { ...EMPTY_FILTERS, decks: ['Selvala', 'Atraxa'] })
      ).toBe(true);
    });

    it('rejects when no participant played any selected deck', () => {
      expect(
        matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Breya'] })
      ).toBe(false);
      expect(
        matchesAllFilters(breya, { ...EMPTY_FILTERS, decks: ['Selvala'] })
      ).toBe(false);
    });

    it('skips participants with null/empty/whitespace deck names', () => {
      expect(
        matchesAllFilters(allBlank, { ...EMPTY_FILTERS, decks: ['Selvala'] })
      ).toBe(false);
    });

    it('ANDs across filter types: deck + player', () => {
      expect(
        matchesAllFilters(selvala, {
          ...EMPTY_FILTERS,
          players: ['Alice'],
          decks: ['Selvala'],
        })
      ).toBe(true);
      expect(
        matchesAllFilters(selvala, {
          ...EMPTY_FILTERS,
          players: ['Alice'],
          decks: ['Breya'],
        })
      ).toBe(false);
      expect(
        matchesAllFilters(selvala, {
          ...EMPTY_FILTERS,
          players: ['Carol'],
          decks: ['Selvala'],
        })
      ).toBe(false);
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

describe('deriveDeckOptions', () => {
  it('returns empty array for empty input', () => {
    expect(deriveDeckOptions([])).toEqual([]);
  });

  it('returns distinct deck names, alphabetized case-insensitively', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, 'Selvala'),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
      mkGame('g2', [
        mkParticipant('Carol', true, false, 'breya'),
        mkParticipant('Dave', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa', 'breya', 'Selvala']);
  });

  it('skips null deck names', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, null),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa']);
  });

  it('skips empty-string deck names', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, ''),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa']);
  });

  it('skips whitespace-only deck names', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, '   '),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa']);
  });

  it('trims surrounding whitespace before dedup', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, 'Selvala'),
        mkParticipant('Bob', false, false, ' Selvala '),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Selvala']);
  });
});

describe('derive*Options with random participants', () => {
  it('deriveWinnerOptions returns "Random" instead of the real name when a random wins', () => {
    const g1 = mkGame('g1', [mkParticipant('Conny', true, false, 'Atraxa', true), mkParticipant('Bob')]);
    expect(deriveWinnerOptions([g1])).toEqual(['Random']);
  });

  it('derivePlayerOptions returns "Random" instead of the real name for random participants', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true),
      mkParticipant('Conny', false, false, 'Atraxa', true),
    ]);
    expect(derivePlayerOptions([g1])).toEqual(['Alice', 'Random']);
  });

  it('derivePlayerOptions deduplicates multiple randoms across games into one "Random"', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true),
      mkParticipant('Conny', false, false, null, true),
    ]);
    const g2 = mkGame('g2', [
      mkParticipant('Bob', true),
      mkParticipant('Dave', false, false, null, true),
    ]);
    expect(derivePlayerOptions([g1, g2])).toEqual(['Alice', 'Bob', 'Random']);
  });

  it('deriveDeckOptions skips random participants entirely', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true, false, 'Atraxa'),
      mkParticipant('Conny', false, false, 'Selvala', true),
    ]);
    expect(deriveDeckOptions([g1])).toEqual(['Atraxa']);
  });

  it('a real player who ONLY ever played as random does NOT appear in derivePlayerOptions', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true),
      mkParticipant('Conny', false, false, null, true),
    ]);
    expect(derivePlayerOptions([g1])).not.toContain('Conny');
  });
});

describe('matchesAllFilters — random handling', () => {
  const aliceVsRandom = mkGame('g1', [
    mkParticipant('Alice', true, false, 'Atraxa'),
    mkParticipant('Conny', false, false, 'Selvala', true),
  ]);
  const randomWins = mkGame('g2', [
    mkParticipant('Alice', false),
    mkParticipant('Conny', true, false, 'Selvala', true),
  ]);
  const allRandom = mkGame('g3', [
    mkParticipant('Conny', true, false, 'Atraxa', true),
    mkParticipant('Eve', false, false, 'Selvala', true),
  ]);

  it('winner filter "Random" matches games where any random won', () => {
    expect(matchesAllFilters(randomWins, { ...EMPTY_FILTERS, winner: 'Random' })).toBe(true);
    expect(matchesAllFilters(allRandom, { ...EMPTY_FILTERS, winner: 'Random' })).toBe(true);
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, winner: 'Random' })).toBe(false);
  });

  it('winner filter does NOT match the real name of a random winner', () => {
    expect(matchesAllFilters(randomWins, { ...EMPTY_FILTERS, winner: 'Conny' })).toBe(false);
  });

  it('players filter "Random" matches games with any random participant', () => {
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, players: ['Random'] })).toBe(true);
    expect(matchesAllFilters(allRandom, { ...EMPTY_FILTERS, players: ['Random'] })).toBe(true);
  });

  it('players filter does NOT match the real name of a random participant', () => {
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, players: ['Conny'] })).toBe(false);
  });

  it('decks filter ignores decks played only by randoms', () => {
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, decks: ['Selvala'] })).toBe(false);
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, decks: ['Atraxa'] })).toBe(true);
  });
});
