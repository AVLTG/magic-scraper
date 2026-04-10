# Phase 6: Game Tracking Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 06-game-tracking-core
**Areas discussed:** Game entry form layout & mechanics, Autocomplete component UX, Game history + edit/delete flow, Rate limiting scope & keying

---

## Game entry form layout & mechanics

### Q: How should the new-game form be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Single form, 4 fixed rows | Date + notes + wonByCombo at top, 4 stacked participant rows, empty rows filtered on submit | ✓ |
| Dynamic rows with add/remove | Start with 2 rows, [+ Add player] button up to 4, [x] to remove | |
| Modal from game history page | `/games` shows the history table; "Log game" button opens a modal with the form | |

**User's choice:** Single form, 4 fixed rows (Recommended)
**Notes:** Simplest mental model, no dynamic state, unused rows get filtered client-side.

### Q: How should the winner and screwed players be selected among participants?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-row: Winner radio + Screwed checkbox (both allowed) | Winner radio (one across rows), independent Screwed checkbox; winner can also be screwed | ✓ |
| Per-row: Mutually exclusive Winner/Screwed | Selecting Won clears Screwed for that row | |
| Separate Winner dropdown + Screwed multi-select below rows | Rows are just names; winner and screwed fields below reference entered names | |

**User's choice:** Per-row Winner radio + Screwed checkbox, both allowed on same player
**Notes:** Edge case (winner + screwed) is rare but explicitly allowed — don't over-constrain.

### Q: Should the form require a winner before submit, or allow draft games with no winner?

| Option | Description | Selected |
|--------|-------------|----------|
| Winner required | Form won't submit without exactly one winner; no draft state | ✓ |
| Winner optional (drafts allowed) | Allow saving with no winner; Phase 7 must filter drafts | |

**User's choice:** Winner required
**Notes:** Matches ROADMAP success criterion 1 ("winner, winner deck"); avoids complicating Phase 7 stats filters.

### Q: Where should validation errors surface in the form?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline per-field + top banner for cross-field errors | Red text under invalid fields; banner for form-wide errors | ✓ |
| Single top banner only | All errors listed at the top; user hunts for which field is bad | |
| Browser-native (required, maxLength) | HTML5 attrs + browser popups; can't handle cross-field rules | |

**User's choice:** Inline per-field + top banner
**Notes:** Standard React form UX; each error has clear locality.

---

## Autocomplete component UX

### Q: Which implementation approach for the player/deck autocomplete?

| Option | Description | Selected |
|--------|-------------|----------|
| Headless custom combobox in `src/app/components/` | Hand-rolled: input + filtered dropdown + keyboard nav; ~100-150 lines, no deps | ✓ |
| Native `<input list>` + `<datalist>` | Zero JS, zero deps; but inconsistent styling, no "add new" affordance | |
| Radix / Headless UI / Downshift library | Battle-tested accessible combobox but adds a dependency for 2 use sites | |

**User's choice:** Headless custom combobox
**Notes:** Matches project's minimal-dependency ethos; full control over "add new" UX.

### Q: How should the user add a new player/deck that isn't in the list?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "Add 'xyz'" row at bottom of dropdown | Extra row appears when no match; click/Enter commits the new value | ✓ |
| Implicit: whatever is in the input on blur is saved | Typos silently become new players | |
| Hybrid: explicit hint + implicit commit | Hint text below field but also accept on blur | |

**User's choice:** Explicit "Add 'xyz'" row
**Notes:** Typo-prevention — no silent "Alince" vs "Alice" duplicates.

### Q: How should autocomplete seed data be loaded?

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch once on page load via `/api/players` and `/api/decks` | Two GETs on mount, client-side filter | ✓ |
| Debounced server search per keystroke | `/api/players?q=...` with 200ms debounce; scales to thousands | |
| Server-render initial list via Server Component | Parent Server Component passes lists as props to client form | |

**User's choice:** Fetch once on mount
**Notes:** Simplest; ~10-user tool won't hit a scale where server search matters.

### Q: Player vs deck lists — unified or separate data sources?

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate endpoints: `/api/players`, `/api/decks` | `/players` UNIONs participant names + Moxfield users; `/decks` from participants only | ✓ |
| Single `/api/autocomplete?type=player\|deck` endpoint | One route with a type switch | |

**User's choice:** Two separate endpoints
**Notes:** RESTful, clean separation of concerns.

---

## Game history + edit/delete flow

### Q: How should the game history table present each row?

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed row + click to expand participants | Main row: date, winner, player count, notes, actions; click to expand participant detail | ✓ |
| Always-expanded flat table with one row per game | Columns for Player 1-4, winner, screwed, combo, notes | |
| Card-per-game layout (not a table) | Each game is a card/tile | |

**User's choice:** Collapsed row + click-to-expand
**Notes:** Dense default view, detail on demand.

### Q: How should the game list be paginated or loaded?

| Option | Description | Selected |
|--------|-------------|----------|
| Load all, client-side sort/filter | Single GET returns all games; no pagination | ✓ |
| Server-paginated with Load More button | Cursor pagination | |
| Infinite scroll | IntersectionObserver auto-fetch | |

**User's choice:** Load all
**Notes:** Fine for ~10-user private tool.

### Q: How should edit work?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `/games/[id]/edit` page | Reuses the form component, pre-populated | ✓ |
| Inline edit in the table row | Row expands into an editable form inline | |
| Modal edit from the table | Click Edit opens a modal with the form | |

**User's choice:** Dedicated `/games/[id]/edit` page
**Notes:** Clean URLs, form component reused, matches App Router conventions.

### Q: How should delete confirmation work?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom confirm modal | Small app-styled modal: "Delete game from [date]?" with Cancel/Delete | ✓ |
| Browser `confirm()` dialog | Native popup | |
| Optimistic delete + 5s undo toast | Row disappears immediately, toast offers Undo | |

**User's choice:** Custom confirm modal
**Notes:** Consistent with app visual language; no toast infrastructure needed.

---

## Rate limiting scope & keying

### Q: Which routes should be rate limited?

| Option | Description | Selected |
|--------|-------------|----------|
| Scraper routes only: `/api/checkDeck`, `/api/scrapeLGS` | Matches ROADMAP success criterion 5 exactly | |
| All `/api` routes (scrapers + games) | Defense in depth | ✓ |
| Scrapers + game writes only | Limit scrapers and game mutations, but not reads | |

**User's choice:** All `/api` routes
**Notes:** User wanted defense-in-depth beyond what ROADMAP required. Follow-up question tuned thresholds per route so legitimate game-night logging isn't blocked.

### Q: How should rate-limit keys be derived?

| Option | Description | Selected |
|--------|-------------|----------|
| IP address from `x-forwarded-for` header | First entry is client IP on Vercel; fallback to 'unknown' | ✓ |
| Session cookie value (HMAC auth cookie) | Key by existing auth cookie; rotates on logout | |
| Composite: IP + cookie | Combine both | |

**User's choice:** IP from `x-forwarded-for`
**Notes:** Cookie-keying is pointless when everyone shares the same password cookie.

### Q: What limits and 429 response shape?

| Option | Description | Selected |
|--------|-------------|----------|
| 10 req / 60s sliding window, return 429 + Retry-After header | Standard HTTP pattern | ✓ |
| 20 req / 60s sliding window, plain 429 JSON | More generous, no retry signal | |
| Fixed bucket: 10 req per clock-minute | Simpler algorithm but edge case around bucket boundaries | |

**User's choice:** Sliding window + Retry-After header
**Notes:** Threshold was refined in follow-up (see next question).

### Q: Where should the rate-limit helper live and how is it structured?

| Option | Description | Selected |
|--------|-------------|----------|
| `src/lib/rateLimit.ts` module-level Map singleton | `checkRateLimit(key, limit, windowMs)` helper, per-instance Map | ✓ |
| Next.js middleware.ts at project root | Add to global middleware | |
| Inline check at the top of each scraper route | Copy-paste | |

**User's choice:** `src/lib/rateLimit.ts` helper
**Notes:** Matches existing `src/lib/prisma.ts` singleton pattern.

---

## Follow-up: threshold tuning and route structure

### Q: Should rate-limit thresholds differ between scrapers and game routes, and which routes are excluded entirely?

| Option | Description | Selected |
|--------|-------------|----------|
| Scrapers 10/60s, games 30/60s; exclude `/api/cron`, `/api/auth` | Different thresholds per call site; cron and auth bypass | ✓ |
| Uniform 10/60s everywhere except `/api/cron` | One threshold; cron excluded | |
| Scrapers 10/60s, games 60/60s; exclude `/api/cron`, `/api/auth` | Very generous game limit | |

**User's choice:** Scrapers 10/60s, games 30/60s; cron and auth excluded
**Notes:** Game-night burst logging won't trigger the limit; `/api/auth` exclusion prevents lockout attacks on shared-password app.

### Q: What should the game CRUD API route layout look like?

| Option | Description | Selected |
|--------|-------------|----------|
| REST: `/api/games` (GET, POST) + `/api/games/[id]` (GET, PATCH, DELETE) | Standard REST with dynamic route | ✓ |
| Action-based: `/api/games/create`, `/api/games/list`, etc. | Four POST endpoints named by action | |
| Single `/api/games` with `action` in POST body | One route with RPC-style dispatch | |

**User's choice:** REST with dynamic route
**Notes:** Matches Next.js App Router conventions.

### Q: How should the games pages be routed and linked from the header?

| Option | Description | Selected |
|--------|-------------|----------|
| `/games` + `/games/new` + `/games/[id]/edit`; header link "Games" | Three pages, shared form component | ✓ |
| `/games` (list + form) + `/games/[id]/edit` | Merge list and new-entry | |
| `/games/new` + `/games/history` (split) + `/games/[id]/edit` | Separate pages under /games/ | |

**User's choice:** Three-page layout
**Notes:** Clean separation; form component reused between new and edit.

---

## Claude's Discretion

Items captured as "Claude's Discretion" in CONTEXT.md §decisions:
- Exact keyboard-navigation semantics of the combobox (Home/End keys, Tab behavior, Esc behavior)
- Combobox dropdown styling (match existing Tailwind patterns)
- History table column widths and responsive behavior
- Modal overlay implementation (native `<dialog>` vs positioned div)
- PATCH route: full-replace vs `gameSchema.partial()` (planner should pick full-replace per D-16)
- Date input: native `<input type="date">`
- Timestamp display format
- Empty-state copy for `/games`
- Nav link order/placement in the header

## Deferred Ideas

See CONTEXT.md `<deferred>` section. Summary:
- Cursor pagination on `/api/games`
- Debounced server-side autocomplete search
- Combobox library dependency (Radix/Headless UI/Downshift)
- Optimistic delete with undo toast
- Rate limiting via Upstash Redis / Vercel KV
- Rate limiting on `/api/auth`
- Game draft state
- Dynamic add/remove participant rows
- Per-participant notes
- Mobile-first responsive history table
- Audit log of edits/deletes
- Bulk delete / bulk edit
