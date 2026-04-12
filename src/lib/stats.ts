/**
 * Pure stat computation helpers for the stats dashboard.
 * All functions are pure (no React, no side effects) and independently testable.
 *
 * Filtering rules (from design decisions):
 * - D-16: Deck/combo stats EXCLUDE imported games (isImported === true)
 * - D-17: Player-level stats INCLUDE all games (imported + non-imported)
 * - D-19: Omit entries with zero denominator (0 games played / 0 participations)
 */

import type { Game } from '@/app/games/page';

// ---------------------------------------------------------------------------
// Utility: ISO week helpers
// ---------------------------------------------------------------------------

/**
 * Returns the YYYY-MM-DD string of the Monday that starts the ISO week
 * containing the given date. Uses getUTCDay() (D-21) to avoid timezone shifts.
 */
export function isoWeekStartUTC(isoDateString: string): string {
  const d = new Date(isoDateString);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Shift so Monday=0: (day + 6) % 7 gives 0 for Mon, 6 for Sun
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns all Monday YYYY-MM-DD strings between startWeek and endWeek
 * inclusive, stepping 7 days at a time.
 */
export function weeksBetween(startWeek: string, endWeek: string): string[] {
  const result: string[] = [];
  const current = new Date(startWeek + 'T00:00:00Z');
  const end = new Date(endWeek + 'T00:00:00Z');
  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 7);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stat helpers
// ---------------------------------------------------------------------------

/**
 * Win rate per player across ALL games (D-17). Omits players with 0 games (D-19).
 * Sorted by rate descending.
 */
export function computePlayerWinRate(
  games: Game[]
): { player: string; wins: number; played: number; rate: number }[] {
  const map = new Map<string, { wins: number; played: number }>();
  for (const g of games) {
    for (const p of g.participants) {
      const entry = map.get(p.playerName) ?? { wins: 0, played: 0 };
      entry.played++;
      if (p.isWinner) entry.wins++;
      map.set(p.playerName, entry);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, wins: v.wins, played: v.played, rate: v.wins / v.played }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Win rate per deck, EXCLUDING imported games (D-16). Omits decks with 0 games (D-19).
 * A deck's "played" count = games where ANY participant used that deck.
 * A deck's "wins" count = games where the winning participant used that deck.
 * Participants with null/empty deckName are skipped.
 * Sorted by rate descending.
 */
export function computeDeckWinRate(
  games: Game[]
): { deck: string; wins: number; played: number; rate: number }[] {
  const nonImported = games.filter((g) => !g.isImported);
  const deckPlayed = new Map<string, Set<string>>(); // deck -> set of gameIds
  const deckWins = new Map<string, number>();

  for (const g of nonImported) {
    const decksInGame = new Set<string>();
    let winnerDeck: string | null = null;

    for (const p of g.participants) {
      const deck = p.deckName?.trim();
      if (!deck) continue;
      decksInGame.add(deck);
      if (p.isWinner) winnerDeck = deck;
    }

    for (const deck of decksInGame) {
      if (!deckPlayed.has(deck)) deckPlayed.set(deck, new Set());
      deckPlayed.get(deck)!.add(g.id);
    }

    if (winnerDeck) {
      deckWins.set(winnerDeck, (deckWins.get(winnerDeck) ?? 0) + 1);
    }
  }

  return Array.from(deckPlayed.entries())
    .filter(([, gameIds]) => gameIds.size > 0)
    .map(([deck, gameIds]) => {
      const played = gameIds.size;
      const wins = deckWins.get(deck) ?? 0;
      return { deck, wins, played, rate: wins / played };
    })
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Screwed rate per player across ALL games (D-17). Omits players with 0 games (D-19).
 * Sorted by rate descending.
 */
export function computeScrewedRate(
  games: Game[]
): { player: string; screwed: number; played: number; rate: number }[] {
  const map = new Map<string, { screwed: number; played: number }>();
  for (const g of games) {
    for (const p of g.participants) {
      const entry = map.get(p.playerName) ?? { screwed: 0, played: 0 };
      entry.played++;
      if (p.isScrewed) entry.screwed++;
      map.set(p.playerName, entry);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({
      player,
      screwed: v.screwed,
      played: v.played,
      rate: v.screwed / v.played,
    }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Weekly game frequency across ALL games (D-17). Fills gaps with 0 (D-22a).
 * Sorted chronologically.
 */
export function computeWeeklyFrequency(
  games: Game[]
): { weekStart: string; gameCount: number }[] {
  if (games.length === 0) return [];

  const weekCounts = new Map<string, number>();
  for (const g of games) {
    const week = isoWeekStartUTC(g.date);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
  }

  const weeks = Array.from(weekCounts.keys()).sort();
  const allWeeks = weeksBetween(weeks[0], weeks[weeks.length - 1]);

  return allWeeks.map((w) => ({ weekStart: w, gameCount: weekCounts.get(w) ?? 0 }));
}

/**
 * Participation rate per player across ALL games (D-17, D-23).
 * Rate = participations / totalGames. Omits players with 0 participations (D-19).
 * Sorted by rate descending.
 */
export function computeMostLikelyToPlay(
  games: Game[]
): { player: string; participations: number; totalGames: number; rate: number }[] {
  if (games.length === 0) return [];
  const totalGames = games.length;
  const map = new Map<string, number>();
  for (const g of games) {
    for (const p of g.participants) {
      map.set(p.playerName, (map.get(p.playerName) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([player, participations]) => ({
      player,
      participations,
      totalGames,
      rate: participations / totalGames,
    }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Bump chart data: cumulative participation-rate rank per player per week (D-25).
 * Rank 1 = highest rate. Ties share rank. Includes ALL games (D-17).
 * Sorted chronologically.
 */
export function computeMostLikelyToPlayBump(
  games: Game[]
): { weekStart: string; ranks: { player: string; rank: number }[] }[] {
  if (games.length === 0) return [];

  // Sort games chronologically
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));

  // Get all weeks chronologically
  const weekSet = new Set<string>();
  for (const g of sorted) weekSet.add(isoWeekStartUTC(g.date));
  const allWeekStarts = Array.from(weekSet).sort();

  // Fill gaps
  const filledWeeks = weeksBetween(allWeekStarts[0], allWeekStarts[allWeekStarts.length - 1]);

  const result: { weekStart: string; ranks: { player: string; rank: number }[] }[] = [];

  // Cumulative counts
  let cumulativeGames = 0;
  const cumulativeParticipations = new Map<string, number>();
  let gameIdx = 0;

  for (const week of filledWeeks) {
    // Add all games in this week
    while (gameIdx < sorted.length && isoWeekStartUTC(sorted[gameIdx].date) === week) {
      cumulativeGames++;
      for (const p of sorted[gameIdx].participants) {
        cumulativeParticipations.set(p.playerName, (cumulativeParticipations.get(p.playerName) ?? 0) + 1);
      }
      gameIdx++;
    }

    if (cumulativeGames === 0) continue;

    // Compute rates
    const rates = Array.from(cumulativeParticipations.entries()).map(([player, count]) => ({
      player,
      rate: count / cumulativeGames,
    }));

    // Sort by rate descending
    rates.sort((a, b) => b.rate - a.rate);

    // Assign ranks with ties sharing rank
    const ranks: { player: string; rank: number }[] = [];
    let currentRank = 1;
    for (let i = 0; i < rates.length; i++) {
      if (i > 0 && rates[i].rate < rates[i - 1].rate) {
        currentRank = i + 1;
      }
      ranks.push({ player: rates[i].player, rank: currentRank });
    }

    result.push({ weekStart: week, ranks });
  }

  return result;
}

/**
 * Total wins per player across ALL games (D-17). Omits 0-win players.
 * Sorted by wins descending.
 */
export function computeWinsByPlayerPie(
  games: Game[]
): { player: string; wins: number }[] {
  const map = new Map<string, number>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isWinner) {
        map.set(p.playerName, (map.get(p.playerName) ?? 0) + 1);
      }
    }
  }
  return Array.from(map.entries())
    .filter(([, wins]) => wins > 0)
    .map(([player, wins]) => ({ player, wins }))
    .sort((a, b) => b.wins - a.wins);
}

/**
 * Games per deck, EXCLUDING imported games (D-16). Counts participant appearances
 * with each deck name. Omits decks with 0 appearances. Skips null/empty deckName.
 * Sorted by games descending.
 */
export function computeGamesByDeckPie(
  games: Game[]
): { deck: string; games: number }[] {
  const nonImported = games.filter((g) => !g.isImported);
  const map = new Map<string, number>();
  for (const g of nonImported) {
    for (const p of g.participants) {
      const deck = p.deckName?.trim();
      if (!deck) continue;
      map.set(deck, (map.get(deck) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([deck, count]) => ({ deck, games: count }))
    .sort((a, b) => b.games - a.games);
}

/**
 * 4-axis radar data per player. played/wins/screwed include ALL games (D-27).
 * wonByCombo counts wins where game.wonByCombo === true AND !game.isImported (D-27).
 * Omits players with 0 played. No sorting requirement.
 */
export function computePlayerRadar(
  games: Game[]
): { player: string; played: number; wins: number; screwed: number; wonByCombo: number; nonImportedPlayed: number; totalGames: number }[] {
  const totalGames = games.length;
  const map = new Map<string, { played: number; wins: number; screwed: number; wonByCombo: number; nonImportedPlayed: number }>();

  for (const g of games) {
    for (const p of g.participants) {
      const entry = map.get(p.playerName) ?? { played: 0, wins: 0, screwed: 0, wonByCombo: 0, nonImportedPlayed: 0 };
      entry.played++;
      if (!g.isImported) entry.nonImportedPlayed++;
      if (p.isWinner) entry.wins++;
      if (p.isScrewed) entry.screwed++;
      if (p.isWinner && g.wonByCombo && !g.isImported) entry.wonByCombo++;
      map.set(p.playerName, entry);
    }
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, ...v, totalGames }));
}
