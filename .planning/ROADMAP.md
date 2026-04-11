# Roadmap: magic-scraper

## Milestones

- v1.0 MVP -- Phases 1-4 (shipped 2026-04-08)
- v1.1 Game Tracking & Polish -- Phases 5-9 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) -- SHIPPED 2026-04-08</summary>

- [x] **Phase 1: Database Migration** - Migrate to Turso cloud DB with Prisma libsql adapter -- completed 2026-03-17
- [x] **Phase 2: Serverless Browser Migration** - Replace Puppeteer with chromium-min for Vercel serverless -- completed 2026-03-17
- [x] **Phase 3: Authentication** - Shared password auth with HMAC cookies and admin route protection -- completed 2026-03-17
- [x] **Phase 4: Automation and Deployment** - Vercel Cron nightly sync, admin user management, deployment guide -- completed 2026-03-17

</details>

### v1.1 Game Tracking & Polish (In Progress)

**Milestone Goal:** Add a game tracking system with stats dashboard, harden existing scrapers and add rate limiting, and improve admin tooling.

- [ ] **Phase 5: Schema Migration & Foundation** - Add Game, GameParticipant, and SyncLog tables to local and production Turso
- [x] **Phase 6: Game Tracking Core** - Game entry form with autocomplete, CRUD endpoints, game history table, rate limiting
- [ ] **Phase 7: Stats Dashboard** - Win/screwed rate charts, game frequency, pie charts with Recharts dynamic import
- [ ] **Phase 8: Admin Improvements** - Sync history view, inline collection ID edit, cron failure alerting, scraper health dashboard
- [ ] **Phase 9: Scraper Hardening** - Retry logic, typed errors, 401 Games Cloudflare bypass attempt

## Phase Details

### Phase 5: Schema Migration & Foundation
**Goal**: Game, GameParticipant, and SyncLog tables exist in both local dev and production Turso, with Prisma schema updated and all existing functionality still working
**Depends on**: Phase 4
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04, GAME-05, GAME-06, GAME-07, GAME-08, GAME-09, STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, STAT-06, STAT-07, STAT-08, ADM-03
**Success Criteria** (what must be TRUE):
  1. `prisma db push` applies Game, GameParticipant, and SyncLog tables without errors in local dev
  2. Production Turso schema matches local after manual `turso db shell` migration
  3. All existing app routes (deck checker, admin, LGS scraper) still function after schema change
  4. Prisma client regenerated and TypeScript compiles without errors
**Plans**: 3 plans
  - [x] 05-01-PLAN.md — Add Game/GameParticipant/SyncLog models to prisma/schema.prisma and apply to local dev via prisma db push
  - [x] 05-02-PLAN.md — Install zod, create src/lib/validators.ts, and write .planning/codebase/SCHEMA.md design doc
  - [x] 05-03-PLAN.md — Back up production Turso, generate migration.sql, and apply to production via turso db shell

### Phase 6: Game Tracking Core
**Goal**: Users can log new games with autocomplete player/deck selection, view game history, and edit or delete past games; API routes are rate limited
**Depends on**: Phase 5
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04, GAME-05, GAME-06, GAME-07, GAME-08, GAME-09, OPT-01
**Success Criteria** (what must be TRUE):
  1. User can submit a game with date, 1-4 players, winner, winner deck, and 0+ screwed players
  2. Player autocomplete dropdown is seeded from Moxfield usernames and all previously entered player names; user can type to filter or add a new name
  3. Deck autocomplete maintains a separate list of all previously entered deck names; user can add new names
  4. User can view all past games in a newest-first table and click to edit or delete any entry
  5. Scraper API routes return 429 after exceeding rate limit; normal usage is unaffected
**Plans**: 6 plans
- [x] 06-01-foundation-rate-limit-PLAN.md — Add npm test script and build sliding-window rate limit helper (getIpKey + checkRateLimit) with unit tests
- [x] 06-02-combobox-component-PLAN.md — Build headless Combobox React component (hand-rolled per D-07) with keyboard nav, ARIA, and Add-new row + pure-helper unit tests
- [x] 06-03-autocomplete-api-PLAN.md — Create GET /api/players (union of Moxfield users + participant history) and GET /api/decks autocomplete routes with rate limiting
- [x] 06-04-games-api-PLAN.md — Create /api/games POST+GET and /api/games/[id] GET+PATCH+DELETE using gameSchema.parse and $transaction, with full integration tests
- [x] 06-05-scraper-rate-limit-PLAN.md — Apply tighter 10/60s rate limit to existing /api/checkDeck and /api/scrapeLGS routes (additive edit, no behavior change)
- [x] 06-06-games-pages-PLAN.md — Build /games, /games/new, /games/[id]/edit pages, GameForm, DeleteConfirmModal, header nav link, end-to-end checkpoint
**UI hint**: yes

### Phase 06.1: Game differentiation and sanitization (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 06.1 to break down)

### Phase 7: Stats Dashboard
**Goal**: Users can view visual stats for win rates, screwed rates, game frequency, and participation across all logged games
**Depends on**: Phase 6
**Requirements**: STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, STAT-06, STAT-07, STAT-08
**Success Criteria** (what must be TRUE):
  1. User can view a bar chart of win rate per player and a bar chart of win rate per deck
  2. User can view a screwed-rate-per-player chart and a weekly game frequency chart
  3. User can view pie chart breakdowns of wins by player and games by deck
  4. Stats update immediately after a new game is submitted without a full page reload
  5. Players and decks with zero relevant games are not shown in any chart
**Plans**: TBD
**UI hint**: yes

### Phase 8: Admin Improvements
**Goal**: Admin can view per-user sync history, edit Moxfield collection IDs inline, receive Discord alerts on cron failures, and inspect scraper health from a dashboard
**Depends on**: Phase 5
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04
**Success Criteria** (what must be TRUE):
  1. Admin can see last-sync timestamp and sync status for each user in the admin panel
  2. Admin can click to inline-edit any user's Moxfield collection ID and save without a page reload
  3. A Discord webhook message is posted when the nightly cron sync fails, including which user failed and the error
  4. Admin can view a scraper health page showing last-run status (success/failure) and recent log entries for each LGS store
**Plans**: TBD
**UI hint**: yes

### Phase 9: Scraper Hardening
**Goal**: All LGS scrapers retry on transient failures with typed errors, and 401 Games scraper returns real results or a clear failure message instead of being disabled
**Depends on**: Phase 5
**Requirements**: OPT-02, OPT-03
**Success Criteria** (what must be TRUE):
  1. A transient scraper failure (network timeout, empty response) triggers up to 2 automatic retries before returning a typed error to the caller
  2. Scraper failures surface a structured error type (not an untyped exception) that the API route can log and return as a readable message
  3. 401 Games scraper returns product listings or a clear "store unavailable" message; it does not silently return empty results
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Database Migration | v1.0 | 2/2 | Complete | 2026-03-17 |
| 2. Serverless Browser Migration | v1.0 | 2/2 | Complete | 2026-03-17 |
| 3. Authentication | v1.0 | 3/3 | Complete | 2026-03-17 |
| 4. Automation and Deployment | v1.0 | 3/3 | Complete | 2026-03-17 |
| 5. Schema Migration & Foundation | v1.1 | 0/3 | Planned | - |
| 6. Game Tracking Core | v1.1 | 0/? | Not started | - |
| 7. Stats Dashboard | v1.1 | 0/? | Not started | - |
| 8. Admin Improvements | v1.1 | 0/? | Not started | - |
| 9. Scraper Hardening | v1.1 | 0/? | Not started | - |
