import type { Game } from '@/app/games/page';
import {
  isoWeekStartUTC,
  weeksBetween,
  computePlayerWinRate,
  computeDeckWinRate,
  computeScrewedRate,
  computeWeeklyFrequency,
  computeMostLikelyToPlay,
  computeMostLikelyToPlayBump,
  computeWinsByPlayerPie,
  computeGamesByDeckPie,
  computeScrewedByPlayerBar,
  computeScrewedByDeckPie,
  computePlayerRadar,
  filterGamesByTimeframe,
  type Timeframe,
} from '@/lib/stats';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function mkParticipant(
  playerName: string,
  {
    isWinner = false,
    isScrewed = false,
    isRandom = false,
    deckName = null as string | null,
  } = {}
) {
  return {
    id: `p-${++idCounter}`,
    gameId: '',
    playerName,
    isWinner,
    isScrewed,
    isRandom,
    deckName,
  };
}

function mkGame(
  date: string,
  participants: ReturnType<typeof mkParticipant>[],
  opts: { wonByCombo?: boolean; isImported?: boolean; variant?: string } = {}
): Game {
  const id = `g-${++idCounter}`;
  for (const p of participants) p.gameId = id;
  return {
    id,
    date: new Date(date + 'T00:00:00Z').toISOString(),
    wonByCombo: opts.wonByCombo ?? false,
    variant: opts.variant ?? 'COMMANDER',
    isImported: opts.isImported ?? false,
    notes: null,
    createdAt: new Date().toISOString(),
    participants,
  };
}

// ---------------------------------------------------------------------------
// Shared test games (5 games, 3 weeks, covers all edge cases)
// ---------------------------------------------------------------------------

// Week 1: 2026-03-23 (Monday)
const game1 = mkGame('2026-03-23', [
  mkParticipant('Alice', { isWinner: true, deckName: 'Elves' }),
  mkParticipant('Bob', { deckName: 'Goblins' }),
  mkParticipant('Carol', { isScrewed: true, deckName: 'Merfolk' }),
]);

// Week 1: 2026-03-25 (Wednesday, same week)
const game2 = mkGame('2026-03-25', [
  mkParticipant('Bob', { isWinner: true, deckName: 'Goblins' }),
  mkParticipant('Alice', { deckName: 'Elves' }),
], { wonByCombo: true });

// Week 2: 2026-03-30 (Monday) - IMPORTED
const game3 = mkGame('2026-03-30', [
  mkParticipant('Alice', { isWinner: true, deckName: 'Dragons' }),
  mkParticipant('Carol', { deckName: null }),
], { isImported: true, wonByCombo: true });

// Week 3: 2026-04-06 (Monday) - has null deckName participant
const game4 = mkGame('2026-04-06', [
  mkParticipant('Carol', { isWinner: true, deckName: 'Merfolk' }),
  mkParticipant('Alice', { deckName: null }),
  mkParticipant('Dave', { isScrewed: true, deckName: 'Burn' }),
]);

// Week 3: 2026-04-08 (Wednesday) - wonByCombo, NOT imported
const game5 = mkGame('2026-04-08', [
  mkParticipant('Alice', { isWinner: true, deckName: 'Elves' }),
  mkParticipant('Bob', { deckName: 'Goblins' }),
], { wonByCombo: true });

const testGames: Game[] = [game1, game2, game3, game4, game5];

// ---------------------------------------------------------------------------
// isoWeekStartUTC
// ---------------------------------------------------------------------------

describe('isoWeekStartUTC', () => {
  it('returns same day for a Monday', () => {
    expect(isoWeekStartUTC('2026-03-23T00:00:00Z')).toBe('2026-03-23');
  });

  it('returns previous Monday for a Sunday', () => {
    expect(isoWeekStartUTC('2026-03-29T00:00:00Z')).toBe('2026-03-23');
  });

  it('returns previous Monday for a Saturday', () => {
    expect(isoWeekStartUTC('2026-03-28T23:59:59Z')).toBe('2026-03-23');
  });

  it('handles UTC midnight edge case (Wednesday)', () => {
    expect(isoWeekStartUTC('2026-03-25T00:00:00.000Z')).toBe('2026-03-23');
  });

  it('handles mid-week (Thursday)', () => {
    expect(isoWeekStartUTC('2026-04-09T12:00:00Z')).toBe('2026-04-06');
  });
});

// ---------------------------------------------------------------------------
// weeksBetween
// ---------------------------------------------------------------------------

describe('weeksBetween', () => {
  it('returns inclusive range of Mondays', () => {
    expect(weeksBetween('2026-03-23', '2026-04-06')).toEqual([
      '2026-03-23',
      '2026-03-30',
      '2026-04-06',
    ]);
  });

  it('single week returns array with just that week', () => {
    expect(weeksBetween('2026-03-23', '2026-03-23')).toEqual(['2026-03-23']);
  });

  it('handles multi-week gap', () => {
    const result = weeksBetween('2026-03-02', '2026-03-23');
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('2026-03-02');
    expect(result[3]).toBe('2026-03-23');
  });
});

// ---------------------------------------------------------------------------
// computePlayerWinRate
// ---------------------------------------------------------------------------

describe('computePlayerWinRate', () => {
  it('computes correct rates for multiple players', () => {
    const result = computePlayerWinRate(testGames);
    const alice = result.find((r) => r.player === 'Alice')!;
    // Alice: participated in all 5 games, won 3 (game1, game3, game5)
    expect(alice.wins).toBe(3);
    expect(alice.played).toBe(5);
    expect(alice.rate).toBeCloseTo(0.6);
  });

  it('omits players with 0 games played', () => {
    const result = computePlayerWinRate([]);
    expect(result).toEqual([]);
  });

  it('sorts by rate descending', () => {
    const result = computePlayerWinRate(testGames);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].rate).toBeLessThanOrEqual(result[i - 1].rate);
    }
  });

  it('includes imported games (D-17)', () => {
    // game3 is imported; Alice and Carol participate
    const result = computePlayerWinRate(testGames);
    const carol = result.find((r) => r.player === 'Carol')!;
    // Carol: game1, game3, game4 => played 3
    expect(carol.played).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeDeckWinRate
// ---------------------------------------------------------------------------

describe('computeDeckWinRate', () => {
  it('excludes imported games (D-16)', () => {
    const result = computeDeckWinRate(testGames);
    // Dragons only appears in game3 (imported) -> should not be in results
    const dragons = result.find((r) => r.deck === 'Dragons');
    expect(dragons).toBeUndefined();
  });

  it('skips null deckName participants', () => {
    const result = computeDeckWinRate(testGames);
    // No entry should have an empty or null deck name
    for (const r of result) {
      expect(r.deck).toBeTruthy();
    }
  });

  it('computes played as distinct games where deck appeared', () => {
    const result = computeDeckWinRate(testGames);
    // Elves: game1 (Alice), game2 (Alice), game5 (Alice) => 3 non-imported games
    const elves = result.find((r) => r.deck === 'Elves')!;
    expect(elves.played).toBe(3);
    // Won: game1 (Alice winner), game5 (Alice winner) => 2
    expect(elves.wins).toBe(2);
  });

  it('sorts by rate descending', () => {
    const result = computeDeckWinRate(testGames);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].rate).toBeLessThanOrEqual(result[i - 1].rate);
    }
  });
});

// ---------------------------------------------------------------------------
// computeScrewedRate
// ---------------------------------------------------------------------------

describe('computeScrewedRate', () => {
  it('computes screwed rate per player', () => {
    const result = computeScrewedRate(testGames);
    const carol = result.find((r) => r.player === 'Carol')!;
    // Carol: screwed in game1, played 3 total
    expect(carol.screwed).toBe(1);
    expect(carol.played).toBe(3);
    expect(carol.rate).toBeCloseTo(1 / 3);
  });

  it('returns 0 rate for never-screwed players', () => {
    const result = computeScrewedRate(testGames);
    const alice = result.find((r) => r.player === 'Alice')!;
    expect(alice.screwed).toBe(0);
    expect(alice.rate).toBe(0);
  });

  it('omits players with 0 games', () => {
    const result = computeScrewedRate([]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeWeeklyFrequency
// ---------------------------------------------------------------------------

describe('computeWeeklyFrequency', () => {
  it('buckets games by ISO week and fills gaps with 0', () => {
    const result = computeWeeklyFrequency(testGames);
    // Week 2026-03-23: game1, game2 => 2
    // Week 2026-03-30: game3 => 1
    // Week 2026-04-06: game4, game5 => 2
    expect(result).toEqual([
      { weekStart: '2026-03-23', gameCount: 2 },
      { weekStart: '2026-03-30', gameCount: 1 },
      { weekStart: '2026-04-06', gameCount: 2 },
    ]);
  });

  it('handles single game', () => {
    const result = computeWeeklyFrequency([game1]);
    expect(result).toEqual([{ weekStart: '2026-03-23', gameCount: 1 }]);
  });

  it('returns empty array for no games', () => {
    expect(computeWeeklyFrequency([])).toEqual([]);
  });

  it('fills gap weeks with 0', () => {
    // game1 is week 2026-03-23, game4 is week 2026-04-06 -> gap at 2026-03-30
    const result = computeWeeklyFrequency([game1, game4]);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ weekStart: '2026-03-30', gameCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeMostLikelyToPlay
// ---------------------------------------------------------------------------

describe('computeMostLikelyToPlay', () => {
  it('computes participation rate (D-23)', () => {
    const result = computeMostLikelyToPlay(testGames);
    // Alice is in all 5 games
    const alice = result.find((r) => r.player === 'Alice')!;
    expect(alice.participations).toBe(5);
    expect(alice.totalGames).toBe(5);
    expect(alice.rate).toBe(1);
  });

  it('sorts by rate descending', () => {
    const result = computeMostLikelyToPlay(testGames);
    expect(result[0].player).toBe('Alice'); // 5/5 = 1.0
  });

  it('returns empty for no games', () => {
    expect(computeMostLikelyToPlay([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeMostLikelyToPlayBump
// ---------------------------------------------------------------------------

describe('computeMostLikelyToPlayBump', () => {
  it('returns cumulative ranks per week', () => {
    const result = computeMostLikelyToPlayBump(testGames);
    expect(result.length).toBeGreaterThanOrEqual(3);
    // Each entry has weekStart and ranks array
    for (const entry of result) {
      expect(entry.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.ranks.length).toBeGreaterThan(0);
    }
  });

  it('assigns ties the same rank (D-25)', () => {
    // After week 1: Alice played 2/2 (rate 1.0), Bob played 2/2 (rate 1.0), Carol played 1/2
    const result = computeMostLikelyToPlayBump(testGames);
    const week1 = result.find((r) => r.weekStart === '2026-03-23')!;
    const aliceRank = week1.ranks.find((r) => r.player === 'Alice')!.rank;
    const bobRank = week1.ranks.find((r) => r.player === 'Bob')!.rank;
    // Both have rate 1.0 => tied at rank 1
    expect(aliceRank).toBe(1);
    expect(bobRank).toBe(1);
    // Carol has lower rate => rank 3 (not 2, because two players share rank 1)
    const carolRank = week1.ranks.find((r) => r.player === 'Carol')!.rank;
    expect(carolRank).toBe(3);
  });

  it('returns empty for no games', () => {
    expect(computeMostLikelyToPlayBump([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeWinsByPlayerPie
// ---------------------------------------------------------------------------

describe('computeWinsByPlayerPie', () => {
  it('counts total wins per player', () => {
    const result = computeWinsByPlayerPie(testGames);
    const alice = result.find((r) => r.player === 'Alice')!;
    expect(alice.wins).toBe(3);
  });

  it('excludes zero-win players', () => {
    const result = computeWinsByPlayerPie(testGames);
    // Dave never wins
    const dave = result.find((r) => r.player === 'Dave');
    expect(dave).toBeUndefined();
  });

  it('sorts by wins descending', () => {
    const result = computeWinsByPlayerPie(testGames);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].wins).toBeLessThanOrEqual(result[i - 1].wins);
    }
  });
});

// ---------------------------------------------------------------------------
// computeGamesByDeckPie
// ---------------------------------------------------------------------------

describe('computeGamesByDeckPie', () => {
  it('excludes imported games (D-16)', () => {
    const result = computeGamesByDeckPie(testGames);
    // Dragons only in game3 (imported) -> absent
    const dragons = result.find((r) => r.deck === 'Dragons');
    expect(dragons).toBeUndefined();
  });

  it('counts participant appearances per deck', () => {
    const result = computeGamesByDeckPie(testGames);
    // Elves: game1(Alice), game2(Alice), game5(Alice) => 3 appearances in non-imported
    const elves = result.find((r) => r.deck === 'Elves')!;
    expect(elves.games).toBe(3);
  });

  it('omits decks with 0 appearances', () => {
    const result = computeGamesByDeckPie([]);
    expect(result).toEqual([]);
  });

  it('sorts by games descending', () => {
    const result = computeGamesByDeckPie(testGames);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].games).toBeLessThanOrEqual(result[i - 1].games);
    }
  });
});

describe('computeGamesByDeckPie — top 15, no Other (2026-05-15)', () => {
  function deckGame(deck: string): Game {
    return mkGame('2026-04-01', [
      mkParticipant('P', { isWinner: true, deckName: deck }),
    ]);
  }

  it('returns all 15 decks when exactly 15 distinct decks exist', () => {
    const games = Array.from({ length: 15 }, (_, i) => deckGame(`Deck${i}`));
    const result = computeGamesByDeckPie(games);
    expect(result).toHaveLength(15);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
  });

  it('returns top 15 with NO Other bucket when 16+ decks exist', () => {
    const games: Game[] = [];
    for (let i = 0; i < 20; i++) {
      // Deck i played (i+1) times so order is stable: Deck19 most, Deck0 least
      for (let j = 0; j <= i; j++) games.push(deckGame(`Deck${i}`));
    }
    const result = computeGamesByDeckPie(games);
    expect(result).toHaveLength(15);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
    // Top entries are the highest-count decks
    expect(result[0].deck).toBe('Deck19');
    expect(result[0].games).toBe(20);
    expect(result[14].deck).toBe('Deck5');
  });

  it('returns fewer than 15 entries unchanged when only N<15 decks exist', () => {
    const games = Array.from({ length: 5 }, (_, i) => deckGame(`Deck${i}`));
    const result = computeGamesByDeckPie(games);
    expect(result).toHaveLength(5);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computePlayerRadar
// ---------------------------------------------------------------------------

describe('computePlayerRadar', () => {
  it('includes all games for played/wins/screwed (D-27)', () => {
    const result = computePlayerRadar(testGames);
    const alice = result.find((r) => r.player === 'Alice')!;
    expect(alice.played).toBe(5); // all 5 games
    expect(alice.wins).toBe(3); // game1, game3, game5
    expect(alice.screwed).toBe(0);
  });

  it('wonByCombo excludes imported games (D-27)', () => {
    const result = computePlayerRadar(testGames);
    const alice = result.find((r) => r.player === 'Alice')!;
    // game3: wonByCombo + imported -> excluded
    // game5: wonByCombo + not imported, Alice wins -> counted
    // game2: wonByCombo + not imported, Bob wins -> not counted for Alice
    expect(alice.wonByCombo).toBe(1);
  });

  it('includes totalGames equal to games array length', () => {
    const result = computePlayerRadar(testGames);
    expect(result[0].totalGames).toBe(testGames.length);
  });

  it('includes totalGames field for each player', () => {
    const result = computePlayerRadar(testGames);
    const alice = result.find((r) => r.player === 'Alice')!;
    expect(alice.totalGames).toBe(5);
  });

  it('omits players with 0 played', () => {
    const result = computePlayerRadar([]);
    expect(result).toEqual([]);
  });

  it('counts combo wins correctly for Bob', () => {
    const result = computePlayerRadar(testGames);
    const bob = result.find((r) => r.player === 'Bob')!;
    // game2: wonByCombo, Bob wins, not imported -> 1
    expect(bob.wonByCombo).toBe(1);
  });
});

describe('filterGamesByTimeframe (2026-05-15)', () => {
  const NOW = new Date('2026-05-15T12:00:00Z').getTime();
  let dateNowSpy: jest.SpyInstance;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  function gameOnDay(daysAgo: number): Game {
    const d = new Date(NOW - daysAgo * 86_400_000);
    return mkGame(d.toISOString().slice(0, 10), [
      mkParticipant('P', { isWinner: true }),
    ]);
  }

  it('returns input unchanged for "all"', () => {
    const games = [gameOnDay(0), gameOnDay(100), gameOnDay(2000)];
    expect(filterGamesByTimeframe(games, 'all')).toHaveLength(3);
  });

  it('1M keeps games within 30 days', () => {
    const games = [gameOnDay(0), gameOnDay(15), gameOnDay(29), gameOnDay(31), gameOnDay(100)];
    const result = filterGamesByTimeframe(games, '1M');
    expect(result).toHaveLength(3);
  });

  it('3M keeps games within 90 days', () => {
    const games = [gameOnDay(0), gameOnDay(89), gameOnDay(91), gameOnDay(365)];
    const result = filterGamesByTimeframe(games, '3M');
    expect(result).toHaveLength(2);
  });

  it('1Y keeps games within 365 days', () => {
    const games = [gameOnDay(0), gameOnDay(364), gameOnDay(366), gameOnDay(1000)];
    const result = filterGamesByTimeframe(games, '1Y');
    expect(result).toHaveLength(2);
  });

  it('3Y keeps games within 1095 days', () => {
    const games = [gameOnDay(0), gameOnDay(1094), gameOnDay(1096)];
    const result = filterGamesByTimeframe(games, '3Y');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(filterGamesByTimeframe([], '3M')).toEqual([]);
    expect(filterGamesByTimeframe([], 'all')).toEqual([]);
  });

  it('Timeframe type accepts only the five expected values', () => {
    const valid: Timeframe[] = ['1M', '3M', '1Y', '3Y', 'all'];
    expect(valid).toHaveLength(5);
  });
});

describe('computeScrewedByPlayerBar (2026-05-16)', () => {
  it('returns empty array for empty input', () => {
    expect(computeScrewedByPlayerBar([])).toEqual([]);
  });

  it('counts isScrewed flags per player across all games', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
        mkParticipant('Bob'),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Alice', { isScrewed: true }),
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result).toEqual([
      { player: 'Alice', screwed: 2 },
      { player: 'Bob', screwed: 1 },
    ]);
  });

  it('omits players with 0 screwed counts (D-19)', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
        mkParticipant('Bob'),
        mkParticipant('Carol'),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result.map((d) => d.player)).toEqual(['Alice']);
    expect(result.find((d) => d.player === 'Bob')).toBeUndefined();
    expect(result.find((d) => d.player === 'Carol')).toBeUndefined();
  });

  it('sorts by screwed count descending', () => {
    // Three players exercise the comparator unambiguously: insertion order is
    // Alice → Bob → Carol, but final counts are Bob 3, Carol 2, Alice 1, so
    // neither insertion order nor its reverse matches the expected output.
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
      ]),
      mkGame('2026-04-03', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
      ]),
      mkGame('2026-04-04', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
      ]),
      mkGame('2026-04-05', [
        mkParticipant('Carol', { isScrewed: true, isWinner: true }),
      ]),
      mkGame('2026-04-06', [
        mkParticipant('Carol', { isScrewed: true, isWinner: true }),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result).toEqual([
      { player: 'Bob', screwed: 3 },
      { player: 'Carol', screwed: 2 },
      { player: 'Alice', screwed: 1 },
    ]);
  });

  it('INCLUDES imported games (D-17 — player-level stats include all games)', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
      ], { isImported: true }),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result).toEqual([{ player: 'Alice', screwed: 1 }]);
  });
});

describe('computeScrewedByDeckPie (2026-05-16)', () => {
  it('returns empty array for empty input', () => {
    expect(computeScrewedByDeckPie([])).toEqual([]);
  });

  it('counts screwed-participants by their deckName in non-imported games', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: 'Atraxa' }),
        mkParticipant('Bob', { isScrewed: true, deckName: 'Goblins' }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Alice', { isScrewed: true, deckName: 'Atraxa' }),
        mkParticipant('Bob', { isWinner: true, deckName: 'Goblins' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([
      { deck: 'Atraxa', screwed: 2 },
      { deck: 'Goblins', screwed: 1 },
    ]);
  });

  it('skips participants with null deckName', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: null }),
        mkParticipant('Bob', { isScrewed: true, deckName: 'Goblins' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([{ deck: 'Goblins', screwed: 1 }]);
  });

  it('skips participants with empty / whitespace-only deckName', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: '' }),
        mkParticipant('Bob', { isScrewed: true, deckName: '   ' }),
        mkParticipant('Carol', { isScrewed: true, deckName: 'Elves' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([{ deck: 'Elves', screwed: 1 }]);
  });

  it('EXCLUDES imported games (D-16 — deck stats exclude imports)', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: 'Atraxa' }),
      ], { isImported: true }),
      mkGame('2026-04-02', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true, deckName: 'Goblins' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([{ deck: 'Goblins', screwed: 1 }]);
  });

  it('returns all entries when fewer than 15 distinct decks', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      mkGame('2026-04-01', [
        mkParticipant('P', { isScrewed: true, isWinner: true, deckName: `Deck${i}` }),
      ])
    );
    const result = computeScrewedByDeckPie(games);
    expect(result).toHaveLength(5);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
  });

  it('caps at top 15 and never includes Other', () => {
    const games: Game[] = [];
    for (let i = 0; i < 20; i++) {
      // Deck i screwed (i+1) times so the highest deck is at index 19 with 20 screws
      for (let j = 0; j <= i; j++) {
        games.push(
          mkGame('2026-04-01', [
            mkParticipant('P', { isScrewed: true, isWinner: true, deckName: `Deck${i}` }),
          ])
        );
      }
    }
    const result = computeScrewedByDeckPie(games);
    expect(result).toHaveLength(15);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
    expect(result[0]).toEqual({ deck: 'Deck19', screwed: 20 });
    expect(result[14].deck).toBe('Deck5');
  });

  it('sorts by screwed count descending', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('A', { isScrewed: true, isWinner: true, deckName: 'Less' }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('B', { isScrewed: true, isWinner: true, deckName: 'More' }),
      ]),
      mkGame('2026-04-03', [
        mkParticipant('C', { isScrewed: true, isWinner: true, deckName: 'More' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result[0]).toEqual({ deck: 'More', screwed: 2 });
    expect(result[1]).toEqual({ deck: 'Less', screwed: 1 });
  });
});

describe('player-collapse: computeWinsByPlayerPie', () => {
  it('treats a game with 2 winning randoms as +1 to Random', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
        mkParticipant('Eve', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computeWinsByPlayerPie(games);
    expect(result.find((r) => r.player === 'Random')?.wins).toBe(1);
  });

  it('counts a non-random win AND a random win in the same game separately', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true }),
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computeWinsByPlayerPie(games);
    expect(result.find((r) => r.player === 'Alice')?.wins).toBe(1);
    expect(result.find((r) => r.player === 'Random')?.wins).toBe(1);
  });

  it('a random winner does NOT show up under the real name', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computeWinsByPlayerPie(games);
    expect(result.find((r) => r.player === 'Conny')).toBeUndefined();
  });
});

describe('player-collapse: computeScrewedByPlayerBar', () => {
  it('treats a game with 2 screwed randoms as +1 to Random', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isScrewed: true, isRandom: true, isWinner: true }),
        mkParticipant('Eve', { isScrewed: true, isRandom: true }),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result.find((r) => r.player === 'Random')?.screwed).toBe(1);
  });
});

describe('player-collapse: computeMostLikelyToPlay', () => {
  it('treats a game with 2 random participants as +1 to Random', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true }),
        mkParticipant('Conny', { isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
    ];
    const result = computeMostLikelyToPlay(games);
    expect(result.find((r) => r.player === 'Random')?.participations).toBe(1);
    expect(result.find((r) => r.player === 'Alice')?.participations).toBe(1);
  });
});

describe('player-collapse: computeMostLikelyToPlayBump', () => {
  it('collapses multiple randoms in one game to +1 in the cumulative Random row', () => {
    // Single-week game with 3 randoms; cumulativeGames = 1.
    // Random bucket should have participations = 1, NOT 3.
    const games = [
      mkGame('2026-04-06', [
        mkParticipant('Alice', { isWinner: true }),
        mkParticipant('Conny', { isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
        mkParticipant('Dave', { isRandom: true }),
      ]),
    ];
    const result = computeMostLikelyToPlayBump(games);
    expect(result).toHaveLength(1);
    const week = result[0];
    const randomEntry = week.ranks.find((r) => r.player === 'Random');
    const aliceEntry = week.ranks.find((r) => r.player === 'Alice');
    // Both should appear, both at rank 1 (tied because cumulativeGames=1 → both rate=1.0)
    expect(randomEntry).toBeDefined();
    expect(aliceEntry).toBeDefined();
    expect(randomEntry?.rank).toBe(1);
    expect(aliceEntry?.rank).toBe(1);
  });

  it('keeps a non-random Alice and a random Alice in separate buckets', () => {
    const games = [
      mkGame('2026-04-06', [
        mkParticipant('Alice', { isWinner: true }),
        mkParticipant('Alice', { isRandom: true }),
      ]),
    ];
    const result = computeMostLikelyToPlayBump(games);
    expect(result).toHaveLength(1);
    const players = result[0].ranks.map((r) => r.player).sort();
    expect(players).toEqual(['Alice', 'Random']);
  });
});

describe('player-collapse: computePlayerWinRate', () => {
  it('aggregates random plays + wins into a single Random bucket per game', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Conny', { isRandom: true }),
        mkParticipant('Eve', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computePlayerWinRate(games);
    const random = result.find((r) => r.player === 'Random');
    expect(random?.played).toBe(2);
    expect(random?.wins).toBe(2);
    expect(random?.rate).toBe(1);
  });
});

describe('player-collapse: computeScrewedRate', () => {
  it('aggregates random plays + screwed into a single Random bucket per game', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isScrewed: true, isRandom: true, isWinner: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Conny', { isRandom: true, isWinner: true }),
        mkParticipant('Eve', { isScrewed: true, isRandom: true }),
      ]),
    ];
    const result = computeScrewedRate(games);
    const random = result.find((r) => r.player === 'Random');
    expect(random?.played).toBe(2);
    expect(random?.screwed).toBe(2);
    expect(random?.rate).toBe(1);
  });
});

describe('player-collapse: computePlayerRadar', () => {
  it('emits a single Random row aggregating across random participants', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isScrewed: true, isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
    ];
    const result = computePlayerRadar(games);
    const random = result.find((r) => r.player === 'Random');
    expect(random).toBeDefined();
    expect(random?.played).toBe(1);
    expect(random?.wins).toBe(1);
    expect(random?.screwed).toBe(1);
    expect(result.find((r) => r.player === 'Conny')).toBeUndefined();
    expect(result.find((r) => r.player === 'Eve')).toBeUndefined();
  });
});

describe('deck-skip: computeGamesByDeckPie', () => {
  it('skips random participants when counting deck appearances', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true, deckName: 'Atraxa' }),
        mkParticipant('Conny', { isRandom: true, deckName: 'Selvala' }),
      ]),
    ];
    const result = computeGamesByDeckPie(games);
    expect(result.find((d) => d.deck === 'Atraxa')?.games).toBe(1);
    expect(result.find((d) => d.deck === 'Selvala')).toBeUndefined();
  });
});

describe('deck-skip: computeScrewedByDeckPie', () => {
  it('skips random participants when counting deck screwed counts', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true, isScrewed: true, deckName: 'Atraxa' }),
        mkParticipant('Conny', { isScrewed: true, isRandom: true, deckName: 'Selvala' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result.find((d) => d.deck === 'Atraxa')?.screwed).toBe(1);
    expect(result.find((d) => d.deck === 'Selvala')).toBeUndefined();
  });
});

describe('deck-skip: computeDeckWinRate', () => {
  it('skips random participants when counting deck plays and wins', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true, deckName: 'Atraxa' }),
        mkParticipant('Conny', { isRandom: true, deckName: 'Selvala' }),
      ]),
    ];
    const result = computeDeckWinRate(games);
    expect(result.find((d) => d.deck === 'Atraxa')?.played).toBe(1);
    expect(result.find((d) => d.deck === 'Selvala')).toBeUndefined();
  });
});
