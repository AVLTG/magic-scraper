# Games & Stats Feature Bundle — Design

**Date:** 2026-05-15
**Scope:** Four related changes to the `/games` and `/stats` sections of magic-scraper.
**Status:** Approved, pending implementation plan.

## Context

The friend group has discovered they sometimes play 6- or 7-player Magic games (and occasionally 3-player), but the app currently caps games at 4 participants. Separately, the stats dashboard has three layout/scaling issues now that ~4 months of game data has accumulated: the player overview radar's legend bleeds into the radar itself, the "games by deck" pie's "Other" bucket dominates the chart, and the two frequency charts will get visually squished as weeks accumulate.

This spec bundles four independent changes addressing all of the above.

## Change A — 2-8 Player Game Support

### User-facing flow

**New games (`/games/new`):**

1. Page loads and immediately presents a modal: *"How many players?"*
2. Modal contains seven buttons — **2 / 3 / 4 / 5 / 6 / 7 / 8** — plus a "Cancel" link that navigates back to `/games`.
3. On click, the modal closes and the form renders with exactly N participant rows.
4. The chosen player count is **locked** for the duration of the form. To change it, the user navigates away (Cancel / browser back) and clicks "Log game" again — the form state is discarded.
5. All N rows must be filled before submit. If any row's `playerName` is blank, validation fails with a form-level error "All N participant names are required" (current message "At least one participant required" applies only when *every* row is blank). The existing "Exactly one winner required" rule is unchanged.

**Editing games (`/games/[id]/edit`):**

- No popup. Form renders directly with `participants.length` rows.
- The player count of an existing game cannot be changed via edit. To "fix" a wrong-count game, delete and re-create.
- The "all N rows must be filled" rule applies on edit as well: blanking a player name on a 6-player game is rejected, not interpreted as "drop that participant".

**Games list (`/games`):**

- The "Player count" filter dropdown extends from `2 | 3 | 4` to `2 | 3 | 4 | 5 | 6 | 7 | 8`.

### Code changes

- **`src/lib/validators.ts`**
  `gameSchema.participants.max(4, ...)` → `.max(8, "at most eight participants per game")`.
  Min stays at 1 (forward-compat with historic 1–3 player games).

- **`src/app/games/game-form.tsx`**
  - Add a required `playerCount: number` (2–8) prop to `GameFormProps`.
  - `GameFormState.rows` becomes variable length; the JSDoc comment "always length 4" is removed.
  - The initial-state `useState` initializer uses `Array.from({ length: playerCount }, emptyRow)` instead of the hardcoded 4-element array.
  - `buildInitialState({ participants })` drops `.slice(0, 4)` and the four-element seed; rows array is built from `participants.length`.
  - `winnerIndex` comment "0..3 or -1" is updated to "0..playerCount-1 or -1".
  - Participants `<fieldset>` map continues to iterate `state.rows`; no per-row changes.

- **`src/app/games/new/page.tsx`**
  - Adds `const [playerCount, setPlayerCount] = useState<number | null>(null);`.
  - When `playerCount === null`, renders a `PlayerCountPicker` modal (inline component or extracted — implementer's choice).
  - When set, renders `<GameForm playerCount={playerCount} onSubmit={...} />`.
  - Modal styling matches the existing post-save Discord notify modal (fixed inset, surface background, rounded border).

- **`src/app/games/[id]/edit/page.tsx`**
  - Passes `playerCount={game.participants.length}` into `<GameForm>` after fetching the game.

- **`src/app/games/page.tsx`**
  - `FilterState.playerCount` type widens: `2 | 3 | 4 | null` → `2 | 3 | 4 | 5 | 6 | 7 | 8 | null`.
  - `useState<2 | 3 | 4 | null>` updates accordingly.
  - The `<select>` for player count adds options 5 / 6 / 7 / 8.
  - Cast in the `onChange` updates to the wider union.

### Data compatibility

Existing games with 1–4 participants render unchanged. Filter dropdown only widens; nothing narrows. No DB migration required (`GameParticipant` already has no count constraint).

## Change B — Player Overview Radar Legend Bleed

### Problem

`PlayerRadarCard` uses Recharts' built-in `<Legend>` inside the `<ResponsiveContainer height={400}>`. The legend lives in the SVG and competes with the radar for vertical space. As player count grows, the legend wraps to multiple rows and eats the radar's bottom.

### Fix

In `src/app/stats/charts/PlayerRadarCard.tsx`:

- Remove the `<Legend iconType="circle" />` element from inside `<RadarChart>`.
- Wrap the `<ResponsiveContainer>` and a new custom legend in a `<>` fragment.
- The custom legend is a Tailwind block under the chart: `flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs`. Each item is `<span><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % length] }} /> {player}</span>`.
- Color mapping mirrors the `<Radar>` mapping exactly: `CHART_COLORS[i % CHART_COLORS.length]` for index `i` into the `players` array.

The 400px chart container is unchanged. The legend takes its own block-level space outside the SVG and wraps freely.

## Change C — Games by Deck Pie: Top 15, Drop "Other"

### Problem

`computeGamesByDeckPie` returns top 14 + an "Other" bucket. With ~20 logged decks, "Other" frequently exceeds half the pie because the long tail aggregates.

### Fix

In `src/lib/stats.ts`, `computeGamesByDeckPie` (lines 293–316):

- Change the early-return threshold: `if (all.length <= 14)` → `if (all.length <= 15)`.
- When `all.length > 15`, return `all.slice(0, 15)` directly. Delete the `otherGames` reduce and the `{ deck: 'Other', games: otherGames }` push.

### Scope note

`computeDeckWinRate` is **not** changed. It uses the same top-14 + Other pattern, but the user confirmed the "Other" slice is small there because long-tail decks rarely accumulate wins. Future-flag, not in scope.

## Change D — Timeframe Selector for Frequency Section

### User-facing control

A pill-button row sits at the top of the **Frequency** section on `/stats`, above both the "Games per week" and "Most likely to play over time" charts. Five options:

**1M · 3M · 1Y · 3Y · All**

- Visual: segmented row, rounded container, active pill `bg-accent text-background`, inactive `text-muted bg-surface`.
- Default selection on page load: **3M**.
- One shared control governs both Frequency charts.

### Filtering rules

- `1M` → games whose date is within the last 30 days.
- `3M` → within the last 90 days.
- `1Y` → within the last 365 days.
- `3Y` → within the last 1095 days.
- `All` → no filter.

"Last N days" is computed from `Date.now()` at render time; date-only games (UTC midnight as stored) compare directly against the cutoff.

### "Don't compress short history"

This falls out automatically: `computeWeeklyFrequency` and `computeMostLikelyToPlayBump` derive their X axis from min/max date of their input. If the user has 4 months of data and picks 3Y, the timeframe filter excludes nothing, and the chart still shows ~17 weeks. No compression, no zero-padding to 3 years.

### Code changes

- **`src/lib/stats.ts`** — add a new pure helper:
  ```ts
  export type Timeframe = '1M' | '3M' | '1Y' | '3Y' | 'all';

  export function filterGamesByTimeframe(games: Game[], timeframe: Timeframe): Game[] {
    if (timeframe === 'all') return games;
    const daysMap = { '1M': 30, '3M': 90, '1Y': 365, '3Y': 1095 } as const;
    const cutoffMs = Date.now() - daysMap[timeframe] * 24 * 60 * 60 * 1000;
    return games.filter(g => new Date(g.date).getTime() >= cutoffMs);
  }
  ```

- **`src/app/stats/page.tsx`**
  - New state: `const [timeframe, setTimeframe] = useState<Timeframe>('3M');`
  - New memo: `const frequencyGames = useMemo(() => filterGamesByTimeframe(games, timeframe), [games, timeframe]);`
  - Update existing memos to use `frequencyGames`:
    ```ts
    const weeklyFrequency = useMemo(() => computeWeeklyFrequency(frequencyGames), [frequencyGames]);
    const mostLikelyBump = useMemo(() => computeMostLikelyToPlayBump(frequencyGames), [frequencyGames]);
    ```
  - All other compute memos continue to read the unfiltered `games`.
  - The pill control is rendered just above `<ChartSection id={CHART_IDS.WEEKLY_FREQ}>` inside the Frequency `<section>`.
  - Mobile collapsed summaries (`getSummary` for `WEEKLY_FREQ` and `LIKELY_BUMP`) automatically reflect the filtered window because they read from the same memos.

### Cumulative-rate caveat (Most likely to play)

`computeMostLikelyToPlayBump` computes ranks from a *cumulative* running count starting at the first game in its input array. When the user picks 3M, the cumulative count effectively restarts at the 3M boundary. This is arguably correct semantics for "most likely to play *recently*" and ships as-is.

## Out of Scope

- Adding/removing participant rows mid-form (user picked locked + restart).
- Edit-page popup to change an existing game's player count.
- Symmetric top-15 fix on the deck win-rate bar chart (future-flag).
- Per-chart timeframe selectors (shared selector chosen).
- Default-timeframe persistence (e.g., localStorage). Resets to 3M on every page load.

## Testing Notes

- **Change A**: unit-test `validateGameForm` with 5–8 rows and one winner; integration-test that `/api/games` POST accepts 8 participants and rejects 9.
- **Change C**: extend existing `computeGamesByDeckPie` tests — 15 decks returns all 15, 16 decks returns top 15 with no Other entry.
- **Change D**: unit-test `filterGamesByTimeframe` for each preset; assert empty-input returns empty.
- Visual check: log a test game with 8 players and verify the radar legend wraps cleanly under the chart on both mobile and desktop widths.

## File Inventory

Files touched by this design:

| File | Change |
|------|--------|
| `src/lib/validators.ts` | Raise participants `.max(4)` → `.max(8)` |
| `src/lib/stats.ts` | Top-15 in `computeGamesByDeckPie`; new `filterGamesByTimeframe` + `Timeframe` type |
| `src/app/games/game-form.tsx` | `playerCount` prop, variable-length rows, `buildInitialState` rework |
| `src/app/games/new/page.tsx` | Popup gate before form |
| `src/app/games/[id]/edit/page.tsx` | Pass `playerCount` to form |
| `src/app/games/page.tsx` | Widen `playerCount` filter union and dropdown options |
| `src/app/stats/page.tsx` | Timeframe state + pill control + frequency memo wiring |
| `src/app/stats/charts/PlayerRadarCard.tsx` | Drop Recharts `<Legend>`, add custom HTML legend |

No new files are required, though the popup may be extracted into its own component (`src/app/games/player-count-picker.tsx`) at the implementer's discretion.
