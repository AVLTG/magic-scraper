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
  computePlayerRadar,
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
    deckName = null as string | null,
  } = {}
) {
  return {
    id: `p-${++idCounter}`,
    gameId: '',
    playerName,
    isWinner,
    isScrewed,
    deckName,
  };
}

function mkGame(
  date: string,
  participants: ReturnType<typeof mkParticipant>[],
  opts: { wonByCombo?: boolean; isImported?: boolean } = {}
): Game {
  const id = `g-${++idCounter}`;
  for (const p of participants) p.gameId = id;
  return {
    id,
    date: new Date(date + 'T00:00:00Z').toISOString(),
    wonByCombo: opts.wonByCombo ?? false,
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
