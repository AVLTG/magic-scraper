---
phase: quick
plan: 260411-wgv
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/stats/page.tsx
  - src/app/stats/charts/WinsByPlayerPie.tsx
  - src/app/stats/charts/PlayerRadarCard.tsx
  - src/lib/stats.ts
  - tests/stats.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Stats page does NOT refetch data when tab regains focus"
    - "Wins by player chart shows horizontal bars with absolute win counts (not pie slices)"
    - "Radar chart axes show per-player percentages (win rate, screwed rate, combo rate, participation rate) not per-axis-max normalization"
    - "Radar tooltip shows raw count AND percentage for each player"
  artifacts:
    - path: "src/app/stats/page.tsx"
      provides: "Stats page without focus refetch"
      contains: "void fetchData"
    - path: "src/app/stats/charts/WinsByPlayerPie.tsx"
      provides: "Horizontal bar chart for wins by player"
      contains: "BarChart"
    - path: "src/app/stats/charts/PlayerRadarCard.tsx"
      provides: "Per-player percentage normalization"
      contains: "d.wins / d.played"
    - path: "src/lib/stats.ts"
      provides: "computePlayerRadar with totalGames field"
      contains: "totalGames"
  key_links:
    - from: "src/app/stats/charts/PlayerRadarCard.tsx"
      to: "src/lib/stats.ts"
      via: "totalGames field in computePlayerRadar return type"
      pattern: "totalGames"
---

<objective>
Fix three stats dashboard issues: remove disruptive auto-refresh on focus, replace misleading pie chart with horizontal bar chart, and fix radar chart normalization to use per-player percentages instead of per-axis-max.

Purpose: Improve data visualization accuracy and reduce UX annoyance.
Output: Updated stats page and chart components with corrected behavior.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/stats/page.tsx
@src/lib/stats.ts
@src/app/stats/charts/WinsByPlayerPie.tsx
@src/app/stats/charts/PlayerRadarCard.tsx
@tests/stats.test.ts
@.planning/quick/260411-wgv-fix-stats-dashboard-remove-auto-refresh-/260411-wgv-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove focus refetch and fix computePlayerRadar return type</name>
  <files>src/app/stats/page.tsx, src/lib/stats.ts, tests/stats.test.ts</files>
  <action>
1. In `src/app/stats/page.tsx` lines 127-159, simplify the useEffect to only fetch on mount:
   - Remove the `onFocus` function (lines 150-152)
   - Remove `window.addEventListener('focus', onFocus)` (line 154)
   - Remove `window.removeEventListener('focus', onFocus)` from cleanup (line 157)
   - Rename `refetch` to `fetchData` since it's only called once
   - Keep the `cancelled` flag and abort cleanup for the initial fetch

2. In `src/lib/stats.ts`, update `computePlayerRadar`:
   - Change return type to include `totalGames: number`
   - Add `const totalGames = games.length;` at the top of the function
   - In the `.map()` at the end, spread `totalGames` into each returned object: `({ player, ...v, totalGames })`

3. In `tests/stats.test.ts`, update the `computePlayerRadar` test suite:
   - Add assertion for `totalGames` field: `expect(alice.totalGames).toBe(5)`
   - Add a test: `it('includes totalGames equal to games array length', ...)` verifying `result[0].totalGames === testGames.length`
  </action>
  <verify>
    <automated>npx vitest run tests/stats.test.ts</automated>
  </verify>
  <done>Focus listener removed from stats page useEffect. computePlayerRadar returns totalGames field. All existing + new tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Replace pie chart with horizontal bar chart and fix radar normalization</name>
  <files>src/app/stats/charts/WinsByPlayerPie.tsx, src/app/stats/charts/PlayerRadarCard.tsx</files>
  <action>
1. Replace the entire content of `src/app/stats/charts/WinsByPlayerPie.tsx` with a horizontal BarChart:
   - Import `ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid` from recharts (remove PieChart, Pie, Legend)
   - Keep same Props interface (`data: { player: string; wins: number }[]`, `chartTokens: ChartTokens`)
   - Keep export name `WinsByPlayerPie` (avoids changing dynamic import in page.tsx)
   - Use `layout="vertical"` with `XAxis type="number"` and `YAxis type="category" dataKey="player"`
   - Dynamic height: `Math.max(200, data.length * 40)`
   - Left margin 60px for player names, `Bar dataKey="wins" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]}`
   - Tooltip formatter: `(value: number) => [\`${value} wins\`, "Wins"]`
   - CartesianGrid with `horizontal={false}` and `strokeDasharray="3 3"`

2. Rewrite normalization in `src/app/stats/charts/PlayerRadarCard.tsx`:
   - Update `PlayerRadarDatum` interface to add `totalGames: number`
   - Replace the per-axis-max normalization block (lines 44-60) with per-player-percentage logic:
     - "Played" axis: `d.played / d.totalGames` (participation rate)
     - "Wins" axis: `d.wins / d.played` (win rate)
     - "Screwed" axis: `d.screwed / d.played` (screwed rate)
     - "Won by Combo" axis: `d.wonByCombo / d.played` (combo win rate)
   - Remove `axisMax` computation entirely
   - Update `rawByPlayer` to include `totalGames`: add `totalGames: d.totalGames` to each player's raw record
   - Update tooltip to show raw count AND percentage:
     ```
     const raw = rawByPlayer[playerName]?.[axis] ?? 0;
     const played = rawByPlayer[playerName]?.["Played"] ?? 0;
     const totalGames = rawByPlayer[playerName]?.["totalGames"] ?? 1;
     const pct = axis === "Played"
       ? Math.round((raw / totalGames) * 100)
       : played > 0 ? Math.round((raw / played) * 100) : 0;
     // Display: "{playerName}: {raw} ({pct}%)"
     ```
   - Keep `PolarRadiusAxis domain={[0, 1]}` unchanged (all values are 0-1 percentages)
  </action>
  <verify>
    <automated>npx tsc --noEmit --project tsconfig.json</automated>
  </verify>
  <done>WinsByPlayerPie renders horizontal bar chart with absolute win counts. PlayerRadarCard normalizes each axis as a per-player percentage (0-1 range). Tooltip shows "raw (pct%)" format. TypeScript compiles cleanly.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries introduced — these are pure UI/visualization fixes with no data flow changes.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | I (Info Disclosure) | chart tooltips | accept | Charts display same data already available via /api/games; no new exposure |
</threat_model>

<verification>
1. `npx vitest run tests/stats.test.ts` — all stat computation tests pass including new totalGames assertions
2. `npx tsc --noEmit` — no TypeScript errors
3. Manual: open /stats, switch tabs, verify no refetch on focus return
4. Manual: "Wins by player" section shows horizontal bars (not pie)
5. Manual: Radar chart shows smaller, more honest shapes (percentages not relative maximums)
</verification>

<success_criteria>
- Auto-refresh on focus completely removed
- Pie chart replaced with horizontal bar chart showing absolute win counts
- Radar chart uses per-player percentage normalization (0-1 scale)
- All tests pass, TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260411-wgv-fix-stats-dashboard-remove-auto-refresh-/260411-wgv-SUMMARY.md`
</output>
