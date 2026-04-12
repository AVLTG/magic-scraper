# Quick Task Research: Fix Stats Dashboard

**Researched:** 2026-04-11
**Domain:** React client-side data fetching, Recharts visualization
**Confidence:** HIGH

## Summary

Three targeted fixes to `src/app/stats/page.tsx` and related chart components. All changes are localized — no new dependencies needed.

## Fix 1: Remove Auto-Refresh on Focus

### Current Behavior
In `src/app/stats/page.tsx` lines 127-159, a `useEffect` adds a `window.addEventListener('focus', onFocus)` that re-fetches `/api/games` every time the tab regains focus.

### Recommended Fix
Simply remove the focus listener. Keep the initial fetch on mount. No refresh button needed — the user can reload the page manually if they want fresh data.

**Specific changes to `src/app/stats/page.tsx`:**
- Remove the `onFocus` function definition (line 150-152)
- Remove `window.addEventListener('focus', onFocus)` (line 154)
- Remove `window.removeEventListener('focus', onFocus)` from cleanup (line 157)
- The `cancelled` flag and cleanup can stay for the initial fetch abort pattern

```typescript
// AFTER: simplified useEffect
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
  return () => { cancelled = true; };
}, []);
```

[VERIFIED: reading src/app/stats/page.tsx lines 127-159]

## Fix 2: Replace Misleading Pie Chart with Bar Chart

### Problem
The pie chart for "Wins by Player" is semantically valid (shares of total wins = 100%) but the user finds it misleading. There's already a `PlayerWinRateBar` component showing win RATE — but total win COUNT is different information (a player who played more games may have more total wins even with a lower rate).

### Recommended Fix
Replace the pie chart with a horizontal bar chart showing absolute win counts. This avoids the "percentage of whole" implication while clearly showing who has the most wins.

**Changes needed:**

1. **Replace `WinsByPlayerPie.tsx`** content with a horizontal `BarChart` (same pattern as `PlayerWinRateBar` but using `wins` count instead of `rate`). Rename the file to `WinsByPlayerBar.tsx` or just change the implementation in-place.

2. **Update `src/app/stats/page.tsx`**: Change the dynamic import from `WinsByPlayerPie` to the new bar chart component.

**New `WinsByPlayerPie.tsx` implementation (in-place replacement):**

```typescript
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface WinsByPlayerDatum {
  player: string;
  wins: number;
}

interface Props {
  data: WinsByPlayerDatum[];
  chartTokens: ChartTokens;
}

export default function WinsByPlayerPie({ data, chartTokens }: Props) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.border} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: chartTokens.muted }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="player"
          tick={{ fontSize: 12, fill: chartTokens.foreground }}
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
          formatter={(value: number) => [`${value} wins`, "Wins"]}
        />
        <Bar dataKey="wins" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Note: Keeping the export name `WinsByPlayerPie` and filename avoids changing the dynamic import in `page.tsx`. The title in ChartSection already says "Wins by player" which works for a bar chart too.

[VERIFIED: reading current WinsByPlayerPie.tsx and PlayerWinRateBar pattern from project]

## Fix 3: Radar Chart Normalization — Per-Player Percentages

### Current Behavior
`PlayerRadarCard.tsx` normalizes per-axis: finds the max value across all players for each axis, then divides each player's raw value by that axis max. This means the player with the most wins always shows 1.0 on the "Wins" axis, making it hard to tell actual rates.

### Recommended Fix
Normalize each player's stats as a percentage of their own games played:
- **Wins axis**: `wins / played` (win rate)
- **Screwed axis**: `screwed / played` (screwed rate)  
- **Won by Combo axis**: `wonByCombo / played` (combo win rate)
- **Played axis**: `played / totalGamesInDataset` (participation rate — percentage of all games this player was in)

This makes every axis a 0-1 percentage, and the radar becomes a "player profile" showing their rates. The tooltip should show both the percentage and the raw count.

**Changes to `computePlayerRadar` in `src/lib/stats.ts`:**
Add `totalGames` to the return type so the chart component can compute participation rate.

```typescript
export function computePlayerRadar(
  games: Game[]
): { player: string; played: number; wins: number; screwed: number; wonByCombo: number; totalGames: number }[] {
  const totalGames = games.length;
  // ... existing logic ...
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, ...v, totalGames }));
}
```

**Changes to `PlayerRadarCard.tsx`:**

```typescript
interface PlayerRadarDatum {
  player: string;
  played: number;
  wins: number;
  screwed: number;
  wonByCombo: number;
  totalGames: number;
}

// Replace the normalization logic:
const radarData = AXES.map((axis) => {
  const row: Record<string, string | number> = { axis };
  for (const d of data) {
    let normalized: number;
    switch (axis) {
      case "Played":
        normalized = d.totalGames > 0 ? d.played / d.totalGames : 0;
        break;
      case "Wins":
        normalized = d.played > 0 ? d.wins / d.played : 0;
        break;
      case "Screwed":
        normalized = d.played > 0 ? d.screwed / d.played : 0;
        break;
      case "Won by Combo":
        normalized = d.played > 0 ? d.wonByCombo / d.played : 0;
        break;
      default:
        normalized = 0;
    }
    row[d.player] = normalized;
  }
  return row;
});
```

**Tooltip update** — show percentage and raw count:
```typescript
// In the tooltip content renderer:
const raw = rawByPlayer[playerName]?.[axis] ?? 0;
const played = rawByPlayer[playerName]?.["Played"] ?? 0;
const pct = axis === "Played" 
  ? `${Math.round((raw / (data[0]?.totalGames || 1)) * 100)}%`
  : `${played > 0 ? Math.round((raw / played) * 100) : 0}%`;
return (
  <div key={playerName} style={{ color: entry.color, marginBottom: 2 }}>
    {playerName}: {raw} ({pct})
  </div>
);
```

**Domain consideration**: Since all axes are now percentages (0-1 range), the `PolarRadiusAxis domain={[0, 1]}` stays correct. However, values will rarely reach 1.0 (e.g., nobody has 100% win rate), so the chart shapes will be smaller but more honest about player profiles.

[VERIFIED: reading PlayerRadarCard.tsx and computePlayerRadar in stats.ts]

## Common Pitfalls

### Pitfall 1: Radar chart domain mismatch
**What goes wrong:** If participation rate can exceed 1.0 (shouldn't happen since played <= totalGames), chart clips.
**How to avoid:** Keep `domain={[0, 1]}` and ensure all calculations produce 0-1 values.

### Pitfall 2: Tooltip raw values need updating
**What goes wrong:** The `rawByPlayer` object in the radar tooltip must include `totalGames` for the Played axis percentage calculation.
**How to avoid:** Add totalGames to the rawByPlayer lookup or pass it separately.

### Pitfall 3: Bar chart height with many players
**What goes wrong:** Fixed height won't accommodate growing player count.
**How to avoid:** Use `Math.max(200, data.length * 40)` for dynamic height.

## Files to Modify

| File | Change |
|------|--------|
| `src/app/stats/page.tsx` | Remove focus event listener from useEffect |
| `src/app/stats/charts/WinsByPlayerPie.tsx` | Replace PieChart with horizontal BarChart |
| `src/app/stats/charts/PlayerRadarCard.tsx` | Change normalization from per-axis-max to per-player-percentage |
| `src/lib/stats.ts` | Add `totalGames` field to `computePlayerRadar` return |

## Sources

### Primary (HIGH confidence)
- Direct code reading of all affected files in the project
- Recharts BarChart and RadarChart API patterns already used in existing project charts
