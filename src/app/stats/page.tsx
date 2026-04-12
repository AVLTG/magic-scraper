"use client";

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown } from 'lucide-react';
import type { Game } from '@/app/games/page';
import {
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
// Dynamic chart imports (ssr: false — Recharts needs DOM)
// These components are created in Plan 03. TypeScript may warn about missing
// modules until then; dynamic() handles missing chunks gracefully at runtime.
// ---------------------------------------------------------------------------
const PlayerRadarCard = dynamic(() => import('./charts/PlayerRadarCard'), { ssr: false });
const PlayerWinRateBar = dynamic(() => import('./charts/PlayerWinRateBar'), { ssr: false });
const DeckWinRateBar = dynamic(() => import('./charts/DeckWinRateBar'), { ssr: false });
const WinsByPlayerPie = dynamic(() => import('./charts/WinsByPlayerPie'), { ssr: false });
const GamesByDeckPie = dynamic(() => import('./charts/GamesByDeckPie'), { ssr: false });
const WeeklyFrequencyLine = dynamic(() => import('./charts/WeeklyFrequencyLine'), { ssr: false });
const MostLikelyBump = dynamic(() => import('./charts/MostLikelyBump'), { ssr: false });

// ---------------------------------------------------------------------------
// Data visualization color palette (20 colors, Tableau-20 adjusted)
// Exported so chart components can import it.
// ---------------------------------------------------------------------------
export const CHART_COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  "#1f77b4", "#aec7e8", "#ffbb78", "#98df8a", "#ff9896",
  "#c5b0d5", "#c49c94", "#f7b6d2", "#dbdb8d", "#17becf",
];

// ---------------------------------------------------------------------------
// Chart IDs for mobile expand/collapse state
// ---------------------------------------------------------------------------
const CHART_IDS = {
  RADAR: 'player-radar',
  PLAYER_WIN_BAR: 'player-win-rate',
  DECK_WIN_BAR: 'deck-win-rate',
  WINS_BY_PLAYER_PIE: 'wins-by-player',
  GAMES_BY_DECK_PIE: 'games-by-deck',
  WEEKLY_FREQ: 'weekly-frequency',
  LIKELY_BUMP: 'most-likely-bump',
} as const;

// ---------------------------------------------------------------------------
// ChartSection — renders mobile collapsed card + desktop always-visible card
// ---------------------------------------------------------------------------
function ChartSection({
  id,
  title,
  summary,
  children,
  expanded,
  onToggle,
}: {
  id: string;
  title: string;
  summary: string;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Mobile: collapsible card */}
      <div className="rounded-lg border border-border bg-surface sm:hidden mb-3">
        <button
          className="w-full flex items-center justify-between px-4 min-h-[44px] text-left gap-2"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`chart-${id}`}
        >
          <span className="text-sm font-bold text-foreground">{title}</span>
          <span className="text-xs text-muted truncate">{summary}</span>
          <ChevronDown
            className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        {expanded && (
          <div id={`chart-${id}`} className="px-4 pb-4">
            {children}
          </div>
        )}
      </div>

      {/* Desktop: always visible card */}
      <div className="hidden sm:block rounded-lg border border-border bg-surface p-4 mb-6">
        <h3 className="text-sm text-muted mb-4">{title}</h3>
        {children}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state placeholder for charts with no data
// ---------------------------------------------------------------------------
function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-32 text-muted text-sm">
      No data yet
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Page
// ---------------------------------------------------------------------------
export default function StatsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set());

  // ---------- Fetch on mount ----------
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/games');
        if (!res.ok) throw new Error('Failed to load stats');
        const data = await res.json();
        if (cancelled) return;
        setGames(Array.isArray(data.games) ? data.games : []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load stats');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Memoized stat computations (D-11) ----------
  const playerWinRate = useMemo(() => computePlayerWinRate(games), [games]);
  const deckWinRate = useMemo(() => computeDeckWinRate(games), [games]);
  const screwedRate = useMemo(() => computeScrewedRate(games), [games]);
  const weeklyFrequency = useMemo(() => computeWeeklyFrequency(games), [games]);
  const mostLikelyToPlay = useMemo(() => computeMostLikelyToPlay(games), [games]);
  const mostLikelyBump = useMemo(() => computeMostLikelyToPlayBump(games), [games]);
  const winsByPlayer = useMemo(() => computeWinsByPlayerPie(games), [games]);
  const gamesByDeck = useMemo(() => computeGamesByDeckPie(games), [games]);
  const playerRadar = useMemo(() => computePlayerRadar(games), [games]);

  // ---------- Chart chrome tokens (adaptive to light/dark) ----------
  const chartTokens = useMemo(() => {
    if (typeof window === 'undefined') {
      return { foreground: '#18181b', muted: '#71717a', border: '#e4e4e7', surface: '#f4f4f5' };
    }
    const style = getComputedStyle(document.documentElement);
    return {
      foreground: style.getPropertyValue('--foreground').trim() || '#18181b',
      muted: style.getPropertyValue('--muted').trim() || '#71717a',
      border: style.getPropertyValue('--border').trim() || '#e4e4e7',
      surface: style.getPropertyValue('--surface').trim() || '#f4f4f5',
    };
  }, []);

  // ---------- Unique player names for bump chart ----------
  const bumpPlayers = useMemo(() => {
    const set = new Set<string>();
    for (const week of mostLikelyBump) {
      for (const r of week.ranks) {
        set.add(r.player);
      }
    }
    return Array.from(set);
  }, [mostLikelyBump]);

  // ---------- Mobile expand/collapse ----------
  function toggleChart(id: string) {
    setExpandedCharts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---------- Mobile summary text helper ----------
  function getSummary(chartId: string): string {
    switch (chartId) {
      case CHART_IDS.RADAR:
        return playerRadar.length > 0 ? `${playerRadar.length} players` : 'No data yet';
      case CHART_IDS.PLAYER_WIN_BAR:
        return playerWinRate.length > 0
          ? `Top: ${playerWinRate[0].player} ${Math.round(playerWinRate[0].rate * 100)}%`
          : 'No data yet';
      case CHART_IDS.DECK_WIN_BAR:
        return deckWinRate.length > 0
          ? `Top: ${deckWinRate[0].deck} ${Math.round(deckWinRate[0].rate * 100)}%`
          : 'No data yet';
      case CHART_IDS.WINS_BY_PLAYER_PIE:
        return winsByPlayer.length > 0
          ? `${winsByPlayer[0].player} leads with ${winsByPlayer[0].wins} wins`
          : 'No data yet';
      case CHART_IDS.GAMES_BY_DECK_PIE:
        return gamesByDeck.length > 0
          ? `${gamesByDeck[0].deck} most played`
          : 'No data yet';
      case CHART_IDS.WEEKLY_FREQ: {
        if (weeklyFrequency.length === 0) return 'No data yet';
        const totalGames = weeklyFrequency.reduce((sum, w) => sum + w.gameCount, 0);
        const avg = (totalGames / weeklyFrequency.length).toFixed(1);
        return `Avg ${avg} games/week`;
      }
      case CHART_IDS.LIKELY_BUMP:
        return mostLikelyToPlay.length > 0
          ? `#1: ${mostLikelyToPlay[0].player} ${Math.round(mostLikelyToPlay[0].rate * 100)}%`
          : 'No data yet';
      default:
        return '';
    }
  }

  // ---------- Render ----------
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-6">Stats</h1>

      {isLoading && (
        <p className="text-muted text-sm py-8 text-center">Loading stats...</p>
      )}

      {error && (
        <p className="text-destructive text-sm py-4">
          Failed to load stats. Try refreshing the page.
        </p>
      )}

      {!isLoading && !error && (
        <>
          {/* Section 1: Player Overview */}
          <section className="mb-12">
            <h2 className="text-xl font-bold text-foreground tracking-tight mb-4">Player Overview</h2>
            <ChartSection
              id={CHART_IDS.RADAR}
              title="Player overview by stat"
              summary={getSummary(CHART_IDS.RADAR)}
              expanded={expandedCharts.has(CHART_IDS.RADAR)}
              onToggle={() => toggleChart(CHART_IDS.RADAR)}
            >
              {playerRadar.length > 0 ? (
                <PlayerRadarCard data={playerRadar} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
          </section>

          {/* Section 2: Win Rates */}
          <section className="mb-12">
            <h2 className="text-xl font-bold text-foreground tracking-tight mb-4">Win Rates</h2>
            <ChartSection
              id={CHART_IDS.PLAYER_WIN_BAR}
              title="Win rate per player"
              summary={getSummary(CHART_IDS.PLAYER_WIN_BAR)}
              expanded={expandedCharts.has(CHART_IDS.PLAYER_WIN_BAR)}
              onToggle={() => toggleChart(CHART_IDS.PLAYER_WIN_BAR)}
            >
              {playerWinRate.length > 0 ? (
                <PlayerWinRateBar data={playerWinRate} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
            <ChartSection
              id={CHART_IDS.DECK_WIN_BAR}
              title="Win rate per deck"
              summary={getSummary(CHART_IDS.DECK_WIN_BAR)}
              expanded={expandedCharts.has(CHART_IDS.DECK_WIN_BAR)}
              onToggle={() => toggleChart(CHART_IDS.DECK_WIN_BAR)}
            >
              {deckWinRate.length > 0 ? (
                <DeckWinRateBar data={deckWinRate} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
          </section>

          {/* Section 3: Breakdowns */}
          <section className="mb-12">
            <h2 className="text-xl font-bold text-foreground tracking-tight mb-4">Breakdowns</h2>
            <div className="sm:grid sm:grid-cols-2 sm:gap-6">
              <ChartSection
                id={CHART_IDS.WINS_BY_PLAYER_PIE}
                title="Wins by player"
                summary={getSummary(CHART_IDS.WINS_BY_PLAYER_PIE)}
                expanded={expandedCharts.has(CHART_IDS.WINS_BY_PLAYER_PIE)}
                onToggle={() => toggleChart(CHART_IDS.WINS_BY_PLAYER_PIE)}
              >
                {winsByPlayer.length > 0 ? (
                  <WinsByPlayerPie data={winsByPlayer} chartTokens={chartTokens} />
                ) : (
                  <EmptyChart />
                )}
              </ChartSection>
              <ChartSection
                id={CHART_IDS.GAMES_BY_DECK_PIE}
                title="Games by deck"
                summary={getSummary(CHART_IDS.GAMES_BY_DECK_PIE)}
                expanded={expandedCharts.has(CHART_IDS.GAMES_BY_DECK_PIE)}
                onToggle={() => toggleChart(CHART_IDS.GAMES_BY_DECK_PIE)}
              >
                {gamesByDeck.length > 0 ? (
                  <GamesByDeckPie data={gamesByDeck} chartTokens={chartTokens} />
                ) : (
                  <EmptyChart />
                )}
              </ChartSection>
            </div>
          </section>

          {/* Section 4: Frequency */}
          <section className="mb-12">
            <h2 className="text-xl font-bold text-foreground tracking-tight mb-4">Frequency</h2>
            <ChartSection
              id={CHART_IDS.WEEKLY_FREQ}
              title="Games per week"
              summary={getSummary(CHART_IDS.WEEKLY_FREQ)}
              expanded={expandedCharts.has(CHART_IDS.WEEKLY_FREQ)}
              onToggle={() => toggleChart(CHART_IDS.WEEKLY_FREQ)}
            >
              {weeklyFrequency.length > 0 ? (
                <WeeklyFrequencyLine data={weeklyFrequency} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
            <ChartSection
              id={CHART_IDS.LIKELY_BUMP}
              title="Most likely to play over time"
              summary={getSummary(CHART_IDS.LIKELY_BUMP)}
              expanded={expandedCharts.has(CHART_IDS.LIKELY_BUMP)}
              onToggle={() => toggleChart(CHART_IDS.LIKELY_BUMP)}
            >
              {mostLikelyBump.length > 0 ? (
                <MostLikelyBump data={mostLikelyBump} players={bumpPlayers} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
          </section>
        </>
      )}
    </div>
  );
}
