# Phase 6: Game Tracking Core - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the end-user flow for logging, viewing, editing, and deleting Magic games: a game entry form with player/deck autocomplete, a game history table with inline expand and edit/delete actions, the `/api/games` REST endpoints that back them, and IP-based rate limiting on scraper + game routes. Phase 6 is complete when a user can sign in, click "Games" in the header, log a new game with 1–4 participants (winner + screwed flags per row), see it appear in a newest-first history table, edit or delete it, and have scraper endpoints return 429 after abuse. The Prisma schema, zod validators, and SCHEMA.md landed in Phase 5 — Phase 6 consumes them directly.

Out of phase: all stats/charts (Phase 7), sync history UI and Discord alerting (Phase 8), scraper retry logic and 401 Games Cloudflare bypass (Phase 9), Commander/format/venue tracking (v2 deferred).

</domain>

<decisions>
## Implementation Decisions

### Game Entry Form — Layout & Mechanics

- **D-01:** **Single form with 4 fixed participant rows.** Date + notes + wonByCombo live at the top. Four participant rows are always rendered (most games are 2–4 players; free-text is cheap). Empty rows are filtered client-side before POST so the final payload only contains rows with a non-empty `playerName`. No add/remove buttons, no dynamic row state.
- **D-02:** **Per-row Winner (radio) + Screwed (checkbox).** Each participant row has a `name="winner"` radio (exactly one across the 4 rows) and an independent Screwed checkbox. A player can be both winner AND screwed (rare edge case, allowed — the user explicitly wanted this not blocked). The form-level invariant is "exactly one winner among non-empty rows".
- **D-03:** **Winner required at submit time.** The form refuses to submit unless exactly one winner is selected among the filled rows. No "draft" state — drafts aren't in requirements and would complicate Phase 7 stats filters.
- **D-04:** **Inline per-field errors + top-of-form banner for cross-field errors.** Field-level errors (empty `playerName` in a filled row, `playerName` > 100 chars, `deckName` > 100 chars) render as red text under the field. Cross-field/form errors ("exactly one winner required", "at least one participant required", "date required") render in a banner at the top of the form. Matches typical React form UX and gives the user clear locality for each error.
- **D-05:** **`wonByCombo` toggle placement: top of form, beside the date.** It's a game-level flag (like date/notes), not per-participant. Render as a checkbox labeled "Won by combo" in the game-level header section.
- **D-06:** **No add/remove/reorder buttons.** Four rows are always present. If the user needs to "remove" a player, they clear the `playerName` field and that row gets filtered out client-side before submit.

### Autocomplete Component UX

- **D-07:** **Headless custom combobox in `src/app/components/`.** Hand-rolled: an `<input>` + a filtered dropdown rendered below + keyboard navigation (↑↓ to move, Enter to select, Esc to close, click-outside to close). ~100–150 lines. No new dependencies. One component reused for both player and deck fields, parameterized by `{ items, value, onChange, placeholder }`. Matches the project's "minimal-dependency" ethos and avoids pulling in Radix/Headless UI/Downshift for 2 use sites.
- **D-08:** **Explicit "Add 'xyz' as new player" row at bottom of dropdown.** When the user's typed value doesn't exactly match any existing item in the filtered list, the combobox appends an extra row at the bottom: `+ Add "xyz" as new player` (or "…as new deck" for the deck combobox). Clicking it or pressing Enter while it's highlighted commits the new value. This prevents silent typo-duplicates like "Alince" vs "Alice" by forcing an explicit confirm.
- **D-09:** **Seed once on mount, filter client-side.** The parent form component issues two fetches on mount — `GET /api/players` and `GET /api/decks` — and passes the returned string arrays as `items` to the two comboboxes. Subsequent filtering is pure client-side `items.filter(i => i.toLowerCase().includes(query.toLowerCase()))`. Acceptable for ≤ a few thousand names total; no debounce, no loading spinners on keystroke. Re-fetch is not needed within a single form session because newly-added names only become "real" after the POST succeeds.
- **D-10:** **Two separate endpoints: `/api/players` and `/api/decks`.**
  - `GET /api/players` → returns `string[]` sorted alphabetically. Source: `SELECT DISTINCT playerName FROM game_participants` **UNION** `SELECT DISTINCT name FROM users` (the existing Moxfield users table). This satisfies GAME-04 ("seeded from Moxfield users and all previously entered player names").
  - `GET /api/decks` → returns `string[]` sorted alphabetically. Source: `SELECT DISTINCT deckName FROM game_participants WHERE deckName IS NOT NULL`. Empty on first load (no games yet), fills in as games are logged. Satisfies GAME-05.

### Game History Table — Layout, Loading, Edit/Delete

- **D-11:** **Collapsed row + click-to-expand participant detail.** Main row columns: `Date | Winner (name + deck) | Player count | Notes snippet | Actions (Edit/Delete)`. Clicking a row (outside the action buttons) expands an inner panel that lists all participant rows with name, winner flag, screwed flag, and deckName. Dense default view, detail on demand.
- **D-12:** **Load all games, newest-first, client-side sort/filter.** `GET /api/games` returns every game with its participants (nested include) ordered by `Game.date desc`. No pagination, no Load More, no infinite scroll. For a ~10-user private app a few thousand rows stays well under 1 MB. If growth ever threatens this, a follow-up phase can add cursor pagination.
- **D-13:** **Edit via dedicated `/games/[id]/edit` page.** The Edit button in a table row navigates (via `<Link>` or `router.push`) to `/games/[id]/edit`, which renders the same form component used for `/games/new`, pre-populated via a server-side `Game.findUnique` include participants (or a client-side fetch to `GET /api/games/[id]`). Saving does a PATCH to `/api/games/[id]`. Navigates back to `/games` on success. Reuses a single form component, matches Next.js App Router conventions, avoids inline/modal complexity with 4 participant rows.
- **D-14:** **Delete confirmation via custom modal component.** Clicking Delete on a row opens a small app-styled modal: `Delete game from <date>? This cannot be undone.` with Cancel (secondary) and Delete (destructive) buttons. On confirm, issues `DELETE /api/games/[id]` and removes the row from the client state optimistically (no undo). Consistent with the app's visual language and avoids `window.confirm()`. The modal component is local to the game history page (new file in `src/app/components/` or inline under `src/app/games/`).
- **D-15:** **No undo toast / no optimistic list updates beyond delete.** Creating a new game or editing one navigates to `/games` and hard-refetches the list. Optimistic UI is reserved for delete only (where the modal already acted as the confirmation step).

### API Route Layout

- **D-16:** **REST-style routes under `/api/games`**:
  - `POST /api/games` — create. Body parsed with `gameSchema` from `src/lib/validators.ts`. Creates a `Game` row and its `GameParticipant` children in a single `prisma.$transaction` (atomicity — partial participant insert on failure is unacceptable).
  - `GET /api/games` — list all. Response shape: `{ games: (Game & { participants: GameParticipant[] })[] }`, sorted by `date desc`.
  - `GET /api/games/[id]` — fetch one (for the edit form pre-populate). 404 if not found.
  - `PATCH /api/games/[id]` — full replace. Body validated by `gameSchema` (same as POST). Strategy: in a single transaction, `deleteMany` the existing `GameParticipant` rows for that `gameId` and recreate from the new body. Simpler than reconciling per-row diffs and matches the "always send all 4 rows" form contract.
  - `DELETE /api/games/[id]` — delete. `GameParticipant` rows cascade automatically (D-04 in 05-CONTEXT).
- **D-17:** **Autocomplete routes**: `GET /api/players` and `GET /api/decks` (see D-10). Both wrapped in `try/catch` following the existing route convention (NextResponse.json + 500 on failure).
- **D-18:** **All new routes return JSON only**, follow the existing `NextResponse.json({...}, { status: N })` pattern from `src/app/api/checkDeck/route.ts`, and sit behind the existing shared-password middleware (no additional per-route auth code needed — middleware runs first).

### Page Structure & Navigation

- **D-19:** **Three pages under `/games`**:
  - `src/app/games/page.tsx` — client component, lists games (the history table + expand/delete modal). Has a "Log game" button that links to `/games/new`.
  - `src/app/games/new/page.tsx` — client component, renders the game form. POSTs to `/api/games`, navigates to `/games` on success.
  - `src/app/games/[id]/edit/page.tsx` — client component, renders the same form pre-populated with a fetch to `GET /api/games/[id]` on mount. PATCHes to `/api/games/[id]`, navigates to `/games` on success.
- **D-20:** **Shared game form component** lives at `src/app/games/game-form.tsx` (or similar inside `src/app/games/`) and accepts an optional `initial` prop for edit mode. Both `new` and `edit` pages render this component. Prevents code duplication.
- **D-21:** **Header nav gains a "Games" link.** Edit `src/app/components/header.tsx` to add a `<Link href="/games">Games</Link>` in the existing nav. Placement: alongside the existing Check Deck / Search LGS links, order is Claude's discretion — keep alphabetical or insert after Check Deck, whichever matches the existing pattern.

### Rate Limiting

- **D-22:** **Scope: all `/api` routes** except `/api/cron` (Vercel scheduler, not a user) and `/api/auth` (login — rate limiting it would let an attacker lock legitimate users out of the shared-password app). Both scraper routes and game routes are limited, but with **different thresholds per D-24** so legitimate game-night logging isn't blocked.
- **D-23:** **Key: client IP from `x-forwarded-for` header.** On Vercel, the first entry in `x-forwarded-for` is the client IP. Parse with `request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'`. Falls back to the literal string `'unknown'` if the header is missing so rate limiting still functions (all unknown-IP requests share a single bucket, which is acceptable for a private app). Do NOT key by auth cookie — the shared-password cookie is identical for all users, and cookie rotation on logout would let an attacker reset their limit by logging out/in.
- **D-24:** **Thresholds (sliding window)**:
  - Scraper routes (`/api/checkDeck`, `/api/scrapeLGS`, and any future scraper routes): **10 requests per 60-second sliding window per IP**.
  - Game routes (`/api/games`, `/api/games/[id]`, `/api/players`, `/api/decks`): **30 requests per 60-second sliding window per IP**. Generous enough that logging 5-6 games in a game-night session (plus the GET list refresh after each) stays well under the limit.
  - The helper accepts `(limit, windowMs)` per call site so each route picks its own threshold explicitly.
- **D-25:** **Sliding-window algorithm**, not fixed-bucket. Store a `Map<string, number[]>` where each value is an array of request timestamps. On each call, prune entries older than `now - windowMs` and compare the remaining count to the limit. Prevents the fixed-bucket edge case where a user bursts 10 requests at 0:59 and 10 more at 1:00.
- **D-26:** **429 response shape**: `NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(secondsUntilWindowReset) } })`. The `Retry-After` value is computed as `Math.ceil((oldestTimestampInWindow + windowMs - now) / 1000)`. Standard HTTP pattern; clients can honor it.
- **D-27:** **Helper location & shape**: New file `src/lib/rateLimit.ts` exporting a single function `checkRateLimit(key: string, limit: number, windowMs: number): { allowed: true } | { allowed: false; retryAfterSeconds: number }`. Module-level `const buckets = new Map<string, number[]>()` singleton (same pattern as `src/lib/prisma.ts`). Route handlers call it near the top of the handler, before any DB work, and short-circuit with a 429 response when `allowed === false`.
- **D-28:** **Per-instance memory is acceptable.** Vercel serverless instances each keep their own `Map`, so a user hitting two different cold instances in quick succession could technically get 2× the limit. For a private ~10-user app this is not a meaningful weakness — PROJECT.md already ruled out Upstash Redis as overkill.

### GAME-09 Sanitization Boundary

- **D-29:** **All sanitization happens in `gameSchema`** (already landed in Phase 5 — trim + length caps + empty-string-to-undefined for notes/deckName). The API route's only sanitization responsibility is running `gameSchema.parse(body)` and returning 400 on `ZodError`. No manual string cleaning in route handlers. This keeps the contract "if it passed zod, it's safe to insert."

### Claude's Discretion

- Exact keyboard-navigation semantics of the combobox (Home/End keys, Tab behavior on a highlighted "Add new" row, whether typing Esc clears the input or just closes the dropdown).
- Exact styling of the combobox dropdown (match existing Tailwind patterns seen in `src/app/checkDeck/page.tsx` and `src/app/components/header.tsx`).
- Exact column widths / responsive behavior of the game history table (collapse to stacked rows on narrow viewports is a plus but not required).
- Modal overlay implementation (native `<dialog>` vs positioned div + backdrop) — either is fine as long as it's accessible (Esc to close, focus trap is a nice-to-have).
- Whether `PATCH /api/games/[id]` accepts the full body as a replace or uses `gameSchema.partial()` — planner should lean toward full-replace (D-16 says full replace) because the form always sends all 4 rows.
- Date input: native `<input type="date">` is fine. No date library needed.
- Timestamp display format in the history table (ISO vs `toLocaleDateString()` — pick something readable).
- Empty-state copy for `/games` when 0 games exist ("No games logged yet. Log your first game →" or similar).
- Nav link order/placement in the header.

### Folded Todos

None — no backlog todos were surfaced for Phase 6.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level Specs
- `.planning/PROJECT.md` — Vision, v1.1 milestone scope, out-of-scope list (no Player table, no Upstash Redis, shared-password auth)
- `.planning/REQUIREMENTS.md` — GAME-01 through GAME-09 and OPT-01 (this phase's requirements)
- `.planning/ROADMAP.md` §"Phase 6: Game Tracking Core" — phase goal, success criteria, UI hint
- `.planning/STATE.md` — Recent v1.1 decisions (normalized Game schema, rate limiting approach, shared-password auth in place)

### Phase 5 Foundation (consumed directly)
- `.planning/phases/05-schema-migration-foundation/05-CONTEXT.md` — Schema design decisions (D-01 through D-19), especially the "free-text playerName, no Player table" rationale and the cascade on Game→GameParticipant
- `.planning/codebase/SCHEMA.md` — Game/GameParticipant/SyncLog design rationale, index justifications; single reference for Phase 6 researcher/planner instead of re-deriving from `prisma/schema.prisma`
- `prisma/schema.prisma` — Live schema for `Game`, `GameParticipant`, `User` models and their field types / `@@map` names
- `src/lib/validators.ts` — `gameSchema`, `gameParticipantSchema`, `GameInput` type. Phase 6 API routes import these for body validation. Do not duplicate validation logic.
- `src/lib/prisma.ts` — PrismaClient singleton. All DB calls in new routes go through this.

### Existing Codebase Conventions
- `.planning/codebase/CONVENTIONS.md` — Naming, file org, error handling, API route pattern, client component pattern. New code must follow.
- `.planning/codebase/ARCHITECTURE.md` — App Router layout, how existing routes are structured, middleware auth flow
- `.planning/codebase/STRUCTURE.md` — Where files live: `src/app/<route>/page.tsx`, `src/app/api/<route>/route.ts`, `src/lib/` for shared logic, `src/app/components/` for shared components
- `.planning/codebase/STACK.md` — Next.js 16 / React 19 / Prisma-libsql / Tailwind v4 versions
- `.planning/codebase/TESTING.md` — Existing test approach (if any) so Phase 6 follows the same pattern
- `src/app/checkDeck/page.tsx` — Reference client component: `"use client"` + `useState` + `handleSubmit` + `fetch` + error/loading state. New game form follows the same pattern.
- `src/app/api/checkDeck/route.ts` — Reference API route: `POST(request: Request)` + try/catch + `NextResponse.json({ error }, { status })`. New game CRUD routes follow this.
- `src/app/components/header.tsx` — Nav component to edit when adding the "Games" link (D-21)

### No External ADRs
No external specs, ADRs, or third-party docs required for Phase 6 — the project is self-contained and all decisions are captured in the `<decisions>` section above plus the files listed.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/validators.ts`** — `gameSchema` and `gameParticipantSchema` already validate everything the form submits. Phase 6 route handlers just call `gameSchema.parse(body)` and the 1–4 participants rule, trimming, and length caps are enforced for free.
- **`src/lib/prisma.ts`** — PrismaClient singleton, already configured with the libsql driver adapter. New models (`Game`, `GameParticipant`) are accessible as `prisma.game`, `prisma.gameParticipant` without any setup.
- **`src/app/checkDeck/page.tsx`** — Canonical form pattern to mirror: `useState` for form fields, error, isLoading; `async handleSubmit` with `try/fetch/catch/finally`; render errors in a `<p className="text-red-...">`. New game form follows the same shape.
- **`src/app/api/checkDeck/route.ts`** — Canonical API route pattern: `export async function POST(request: Request)`, `try { const body = await request.json(); /* validate + logic */; return NextResponse.json({ ... }) } catch (err) { console.error(...); return NextResponse.json({ error: '...' }, { status: 500 }) }`. New `/api/games` routes use this shape.
- **Cascade delete via Prisma** — Phase 5 D-04 established `onDelete: Cascade` on `GameParticipant.gameId`. `DELETE /api/games/[id]` is a single `prisma.game.delete({ where: { id } })` — participants wipe automatically.
- **Existing cuid IDs + `@@map` naming** — Game uses `String @id @default(cuid())` already; no surprises in PK generation.

### Established Patterns
- **Client component + fetch pattern** — No data-fetching library (SWR / React Query). Pages manage their own `useState` + `fetch` + loading/error state. New game/list/edit pages follow suit.
- **Module-level singleton** — `src/lib/prisma.ts` uses a `let instance` guard. The new `src/lib/rateLimit.ts` mirrors the pattern (`const buckets = new Map<string, number[]>()` at module scope).
- **Shared-password middleware** — All `/api/*` and page routes are already protected by the existing HMAC cookie middleware. New routes inherit this for free. Rate limiting is additive (runs inside the handler, after middleware, before DB work).
- **Tailwind v4 inline utility classes** — No CSS module files, no separate stylesheet for components. New form + table use the same inline-class approach.
- **Error handling**: API routes log with `console.error('...')` + emoji prefixes, return `NextResponse.json({ error }, { status })`, never throw to the framework.

### Integration Points
- **Header nav** — `src/app/components/header.tsx` is where the new "Games" link is added (D-21). One edit, no new component needed.
- **Middleware** — No changes required; the shared-password middleware already covers `/games/**` and `/api/games/**` under the same matcher (verify the matcher includes these paths during planning; if it uses an allowlist, add the new paths).
- **Prisma transactions** — `POST /api/games` and `PATCH /api/games/[id]` use `prisma.$transaction([...])` to insert Game + participants atomically. The existing code already has one reference example in the Moxfield collection update path, so the pattern is familiar to the codebase.
- **Rate-limit insertion points** — Top of each handler, after the request-parsing line but before any DB call: `const rl = checkRateLimit(getIpKey(request), 10, 60_000); if (!rl.allowed) return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Content-Type': 'application/json' } });`.

</code_context>

<specifics>
## Specific Ideas

- **Winner + Screwed on the same player is allowed** (D-02). User called this out explicitly — don't "optimize" it away as validation.
- **"Add 'xyz'" explicit row** (D-08) — user wanted the typo-prevention affordance over implicit creation. Planner should implement it as a visibly distinct row at the bottom of the dropdown (e.g., separator + different styling) so it's obvious the user is creating, not selecting.
- **Fetch once on mount** (D-09) — no debounce, no server-side search. User picked the simplest option deliberately; don't overengineer this by adding useSWR, React Query, or a revalidation layer.
- **30/60s threshold on game routes** (D-24) — chosen specifically so a game-night burst of logging doesn't trigger a limit. This is a feature, not a "loose" default.
- **Full-replace PATCH** (D-16) — form always sends all 4 rows, so route deletes existing participants and re-inserts. Don't build diff reconciliation; it's unused.
- **No undo toast on delete** (D-14) — user explicitly chose the confirm-modal path over optimistic-delete-with-undo. Don't add toast infrastructure.

</specifics>

<deferred>
## Deferred Ideas

- **Cursor pagination on `/api/games`** — deferred. Load-all is sufficient for ≤ a few thousand rows; revisit only if list size ever justifies it.
- **Debounced server-side autocomplete search** — deferred. Seed-once is sufficient for the private user base.
- **Combobox library dependency** (Radix / Headless UI / Downshift) — rejected. Hand-rolled combobox is preferred.
- **Optimistic delete with undo toast** — rejected. Custom confirm modal was chosen instead.
- **Rate limiting via Upstash Redis / Vercel KV** — rejected at the project level (PROJECT.md "Out of Scope"). In-memory Map is the accepted tradeoff.
- **Rate limiting on `/api/auth`** — deferred. Would let an attacker lock legitimate users out of a shared-password app; no clear benefit.
- **Game draft state (winner not yet known)** — deferred. Not in requirements; would complicate Phase 7 stats filtering.
- **Dynamic add/remove participant rows** — deferred. Fixed 4 rows is simpler and sufficient for GAME-01 ("1-4 players").
- **Per-participant notes** — deferred (also noted in 05-CONTEXT). Game-level notes only.
- **Mobile-first responsive history table layout** — Claude's Discretion, but not a hard requirement for Phase 6. Desktop-first is fine.
- **Accessibility audit / keyboard traps on modal** — nice-to-have; planner should include basic focus management (Esc to close, focus to first input) but a full WAI-ARIA audit is out of scope.
- **Audit log of edits/deletes** — deferred. No requirement, no `updatedAt` on Game (Phase 5 D-01 rejected audit columns).
- **Bulk delete / bulk edit** — deferred. One game at a time.

</deferred>

---

*Phase: 06-game-tracking-core*
*Context gathered: 2026-04-10*
