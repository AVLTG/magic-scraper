---
phase: 06-game-tracking-core
plan: 06-games-pages
subsystem: ui/games
tags: [nextjs, react19, client-component, form, crud]
status: awaiting-human-verification
requires:
  - 06-02-combobox-component (Combobox with items/value/onChange/placeholder/addLabel)
  - 06-03-autocomplete-api (GET /api/players, GET /api/decks)
  - 06-04-games-api (POST/GET/PATCH/DELETE /api/games, GET /api/games/[id])
provides:
  - "GameForm component (shared between new + edit)"
  - "DeleteConfirmModal component"
  - "/games list page with expand/edit/delete"
  - "/games/new page (POST)"
  - "/games/[id]/edit page (GET + PATCH)"
  - "Header nav link to /games"
  - "Unit tests for filterEmptyRows + validateGameForm (13 cases)"
affects:
  - src/app/games/game-form.tsx (new)
  - src/app/games/delete-confirm-modal.tsx (new)
  - src/app/games/page.tsx (new)
  - src/app/games/new/page.tsx (new)
  - src/app/games/[id]/edit/page.tsx (new)
  - src/app/components/header.tsx (modified — added Games nav entry)
  - tests/game-form.test.ts (new)
tech-stack:
  added: []
  patterns:
    - "React 19 use(params) to unwrap async route params in client components (Next 15+)"
    - "useEffect with cancelled flag for fetch cleanup"
    - "Optimistic delete without rollback (D-15)"
    - "Fragment wrapper for sibling <tr> rows in tbody (React 19 key semantics)"
key-files:
  created:
    - src/app/games/game-form.tsx
    - src/app/games/delete-confirm-modal.tsx
    - src/app/games/page.tsx
    - src/app/games/new/page.tsx
    - src/app/games/[id]/edit/page.tsx
    - tests/game-form.test.ts
  modified:
    - src/app/components/header.tsx
decisions:
  - "Extracted pure helpers (filterEmptyRows, validateGameForm, buildInitialState) from GameForm so business logic is unit-testable without React Testing Library"
  - "Used React Fragment (not array) to wrap sibling <tr> elements inside <tbody> map, satisfying React 19 key semantics"
  - "Optimistic delete: row removed from client state before DELETE resolves; error path sets banner but does not re-add row (D-15)"
  - "use(params) from react to unwrap async params in /games/[id]/edit/page.tsx (Next.js 15+ pattern)"
metrics:
  duration: ~15min (Task 1 + Task 2)
  completed: 2-of-3-tasks
  task3_status: awaiting-human-verification
---

# Phase 06 Plan 06: Games Pages Summary

**One-liner:** Full Phase 6 UI layer — shared GameForm + DeleteConfirmModal + three /games pages + header nav link, with 13 unit tests covering form helpers; end-to-end manual verification pending.

## Status: Awaiting Human Verification

**Tasks 1 and 2 complete.** Task 3 is a blocking `checkpoint:human-verify` gate requiring a 16-step manual procedure against a running dev server. This executor stopped before attempting that procedure as instructed by the orchestrator.

## What Was Built

### Task 1 — GameForm, DeleteConfirmModal, and unit tests (commits `6bf1430`, `f134a00`)

**`src/app/games/game-form.tsx`** — Shared form component for both new + edit modes.

- Exports: `GameForm`, `filterEmptyRows`, `validateGameForm`, `buildInitialState`, plus type exports (`GameFormState`, `GameFormPayload`, `ParticipantRow`, `ValidationResult`, `GameFormErrors`).
- **Fixed 4 participant rows** (D-06) — never dynamically added/removed; empty rows filtered at payload-build time.
- **Autocomplete seeding** — One-shot `useEffect` on mount fetching `/api/players` and `/api/decks` in parallel (D-09). No debounce, no refresh.
- **Pure helpers** extracted for unit testability:
  - `filterEmptyRows(rows)` — strips trimmed-empty playerName rows.
  - `validateGameForm(state)` — returns `{ ok: true, payload }` or `{ ok: false, errors }`. Handles: missing date, zero filled rows, winnerIndex = -1, winner-on-empty-row (Pitfall 4), playerName/deckName > 100 chars, winnerIndex remapping after filter, trim on both fields, deckName "" → undefined in payload.
  - `buildInitialState(game)` — maps API response back into form state for edit mode.
- **No `dangerouslySetInnerHTML`** anywhere (T-06-03 XSS mitigation — verified by absence).
- **No `window.confirm`** (D-14 — custom modal instead).
- **No SWR / react-query** — plain `fetch` matches CONVENTIONS.md.

**`src/app/games/delete-confirm-modal.tsx`** — Accessible modal.

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on title.
- Escape key triggers `onCancel` via document keydown listener (cleaned up on close).
- Backdrop click triggers `onCancel`.
- Title: `Delete game from {gameDate}?` — body "This cannot be undone."
- Cancel (secondary) + Delete (destructive red) buttons.

**`tests/game-form.test.ts`** — 13 test cases (plan called for 10+).

- 3 tests for `filterEmptyRows` (removes empty, preserves order, trims before checking).
- 10 tests for `validateGameForm` (accept valid 2-player, reject missing date, reject zero filled, reject winnerIndex -1, reject winner-on-empty-row [Pitfall 4], allow winner+screwed [D-02], reject >100 char name, deckName "" → undefined, trim in payload, remap winner after filter).
- Result: **13 passed, 0 failed.**

### Task 2 — Pages + header nav (commit `fa939b3`)

**`src/app/games/new/page.tsx`** — `"use client"` wrapper. POSTs payload to `/api/games`, pushes to `/games` on success, displays server errors via the GameForm's submitError banner.

**`src/app/games/[id]/edit/page.tsx`** — Uses React 19 `use(params)` to unwrap async `params: Promise<{ id: string }>`. Fetches `GET /api/games/[id]` on mount, calls `buildInitialState` to pre-populate form, PATCHes on submit. Handles 404 → "Game not found", other errors → "Failed to load game", and loading state → "Loading...".

**`src/app/games/page.tsx`** — History table.

- Fetches `GET /api/games` once on mount; trusts server ordering (newest-first from 06-04).
- Empty state: "No games logged yet. Log your first game →".
- Row columns: Date (formatted), Winner (playerName + optional deckName), Players count, Notes snippet, Actions (Edit link + Delete button).
- Row click toggles expanded panel showing all participants with WINNER/SCREWED tags and a `Won by combo` note.
- Delete button stages `pendingDelete` → opens `DeleteConfirmModal` → on confirm, optimistically removes row from state (D-14, D-15), then DELETEs. On error, sets error banner (no rollback, per D-15).
- Uses `Fragment` wrapper around sibling `<tr>` rows inside `<tbody>` with a single `key` on the fragment (React 19 compliance).

**`src/app/components/header.tsx`** — Single change: inserted `{ href: "/games", label: "Games" }` between `/checkDeck` and `/SearchLGS` in the `navLinks` array. Both desktop and mobile nav render via the same `navLinks` loop, so both get the entry automatically. Three entries total.

## Automated Verification (Task 2 acceptance gate)

- `npx jest` → **97 passed, 0 failed** (all 11 suites green including the new `game-form.test.ts`).
- `npx tsc --noEmit` → **clean** (exit 0, no output).
- Header grep: contains `{ href: "/games", label: "Games" }` ✅, still contains `/checkDeck` + `/SearchLGS` ✅.

## Threat Model Coverage

| Threat ID      | Mitigation                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T-06-01 Spoofing | Inherited from proxy.ts middleware — /games/** paths covered automatically.                                                                 |
| T-06-03 XSS      | 100% JSX rendering. Zero `dangerouslySetInnerHTML`. Zero `innerHTML`. React auto-escapes all text (playerName, deckName, notes, formatDate). |
| T-06-05 Mass Assignment | `validateGameForm` builds the exact POST body shape; server gameSchema.parse strips unknown fields on top of that.                  |
| T-06-09 Info Disclosure | Client error paths surface `err.message` or `data.error` from sanitized API responses — no stack traces.                           |
| T-06-CSRF      | Inherited SameSite session cookie from existing auth system — no new CSRF surface.                                                          |
| T-06-optimistic | Accepted per D-15 — optimistic delete with no rollback.                                                                                     |

## Deviations from Plan

### None material

- Test count: plan called for 10+ `it(` blocks; delivered 13 (3 filterEmptyRows + 10 validateGameForm).
- Used `Fragment` (the documented fallback in the plan) instead of bare `<>` fragments for sibling `<tr>` rows in `<tbody>`. This was explicitly called out in the plan as the React 19 fallback — not a deviation, just the chosen path.
- Added a guard in `validateGameForm` so the "Exactly one winner required" error is not redundantly set when "At least one participant required" already applies — keeps the error banner single-source. Tests still pass because the no-winner case is verified separately.

## GAME-01..09 Satisfaction (UI layer)

| Req    | Where satisfied                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------- |
| GAME-01 | `/games/new` + `GameForm` — user logs a game with 1-4 participants, winner, date, notes, wonByCombo |
| GAME-02 | Per-row Screwed checkbox; validateGameForm test covers winner+screwed coexistence (D-02)                 |
| GAME-03 | `/games` list page with date (newest-first from server)                                                  |
| GAME-04 | Row expand shows all participants + WINNER/SCREWED tags                                                  |
| GAME-05 | Edit link → `/games/[id]/edit` → `buildInitialState` pre-population → PATCH                              |
| GAME-06 | Delete button → `DeleteConfirmModal` → optimistic client-side removal + DELETE fetch                     |
| GAME-07 | Player + deck Combobox seeded from `/api/players` and `/api/decks` (D-09)                                |
| GAME-08 | `wonByCombo` checkbox in form header + displayed in expanded row panel                                   |
| GAME-09 | Header nav gains `/games` link (D-21) — discoverable from every page                                     |

Full end-to-end proof pending Task 3 human verification.

## Task 3: Blocking Checkpoint — Pending

**Type:** `checkpoint:human-verify` (blocking)

This executor did **not** attempt the 16-step manual verification procedure. That requires:

1. `npm run dev` in the project root
2. Browser access to http://localhost:3000
3. Interactive log-in + form submission + DOM inspection
4. Manual curl burst for rate-limit verification
5. Browser devtools Console inspection

The orchestrator must present the 16 steps (see `06-06-games-pages-PLAN.md` → `<how-to-verify>`) to the user and wait for the `approved` resume signal. If any step fails, a gap-closure plan must be created before this plan is marked complete.

## Commits

| Hash      | Message                                                            |
| --------- | ------------------------------------------------------------------ |
| `6bf1430` | test(06-06): add failing tests for game-form helpers (RED)         |
| `f134a00` | feat(06-06): add GameForm component and DeleteConfirmModal (GREEN) |
| `fa939b3` | feat(06-06): add /games list/new/edit pages and header nav link    |

## Self-Check: PASSED

- `src/app/games/game-form.tsx` — FOUND
- `src/app/games/delete-confirm-modal.tsx` — FOUND
- `src/app/games/page.tsx` — FOUND
- `src/app/games/new/page.tsx` — FOUND
- `src/app/games/[id]/edit/page.tsx` — FOUND
- `tests/game-form.test.ts` — FOUND
- `src/app/components/header.tsx` — contains `"/games"` entry
- Commit `6bf1430` — FOUND
- Commit `f134a00` — FOUND
- Commit `fa939b3` — FOUND
- `npx jest` — 97 passed
- `npx tsc --noEmit` — clean
