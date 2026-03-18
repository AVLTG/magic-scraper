# Roadmap: magic-scraper

## Overview

The app works locally but can't deploy to Vercel as-is. Four infrastructure changes are needed in strict dependency order: swap the database driver for a cloud-compatible one, replace the browser tooling with a serverless-safe binary, add authentication before any public exposure, then layer on automation and finalize deployment. Each phase leaves the app in a better-than-before state and can be verified independently before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Database Migration** - Replace local SQLite with Turso cloud DB so the app can persist data on Vercel (completed 2026-03-17)
- [x] **Phase 2: Serverless Browser Migration** - Swap Puppeteer for serverless-compatible Chromium and replace the Moxfield browser scraper with a plain fetch call (completed 2026-03-17)
- [ ] **Phase 3: Authentication** - Gate all routes behind a shared group password and protect admin routes with a separate admin credential
- [ ] **Phase 4: Automation and Deployment** - Add nightly collection sync via Vercel Cron, finalize admin user management, and produce a deployment guide

## Phase Details

### Phase 1: Database Migration
**Goal**: The app connects to Turso cloud DB and all existing features work against it — data persists across requests with no local filesystem dependency
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03
**Success Criteria** (what must be TRUE):
  1. The app runs locally against a Turso database URL and all routes (checkDeck, updateCollections, scrapeLGS) return correct data
  2. The Prisma schema is applied to the Turso database and all existing data models (User, CollectionCard) are present with no schema changes
  3. A collection update completes atomically — if it fails mid-way, the user's cards are not left in a partially-deleted state
  4. The app builds without errors on Vercel (no `better-sqlite3` native addon, no local filesystem writes)
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Swap dependencies (better-sqlite3 to libsql) and rewrite Prisma client singleton with adapter
- [ ] 01-02-PLAN.md — Wrap collection update in Prisma interactive transaction for atomicity

### Phase 2: Serverless Browser Migration
**Goal**: LGS scrapers run inside Vercel serverless functions using a remote Chromium binary, and the Moxfield sync no longer launches a browser at all
**Depends on**: Phase 1
**Requirements**: SCRP-01, SCRP-02, SCRP-03, SCRP-04
**Success Criteria** (what must be TRUE):
  1. The LGS scrape endpoint returns store results when called from a Vercel function (ETB, DCC, FTF all return card data)
  2. A Moxfield collection sync completes by calling the Moxfield API directly with fetch — no browser is launched during sync
  3. Repeated LGS scrape requests for the same card name within the TTL window return cached results without launching a new browser
  4. The deployed function bundle stays within Vercel's 250MB limit (chromium-min fetches binary at runtime, not bundled)
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Swap puppeteer for chromium-min + puppeteer-core, update all scraper signatures, rewrite Moxfield to use fetch()
- [ ] 02-02-PLAN.md — Add in-memory TTL cache for LGS results, update route with maxDuration, add failedStores UI notice

### Phase 3: Authentication
**Goal**: Every route requires a valid session cookie — unauthenticated visitors see only the login page, and admin routes require a second stronger credential
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. A visitor navigating to any route without a session cookie is redirected to the login page
  2. A visitor who enters the correct group password can access all non-admin routes and their session persists across browser sessions
  3. An authenticated user who navigates to an admin route without the admin credential is blocked (not just redirected to login)
  4. An authenticated user who clicks log out is redirected to login and their session cookie is cleared — back-navigation does not restore access
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Automation and Deployment
**Goal**: Collections sync automatically every night without admin involvement, admin can manage users without touching seed scripts, and anyone with the guide can deploy the full app from scratch on Vercel free tier
**Depends on**: Phase 3
**Requirements**: AUTO-01, AUTO-02, ADMIN-01, ADMIN-02, ADMIN-03, DEPLOY-01
**Success Criteria** (what must be TRUE):
  1. The Vercel Cron Jobs dashboard shows a scheduled nightly run and the sync log confirms all user collections were updated after it fires
  2. An unauthenticated request to the cron sync route (missing or incorrect Authorization header) is rejected with a non-2xx response
  3. Admin can add a new user with a name and Moxfield collection ID via the admin panel UI — the user appears in the deck checker immediately
  4. Admin can delete a user from the admin panel — the user and all their cards are removed
  5. A developer following the deployment guide alone can deploy a working instance of the app on Vercel + Turso free tier with no undocumented steps
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Migration | 2/2 | Complete    | 2026-03-17 |
| 2. Serverless Browser Migration | 2/2 | Complete    | 2026-03-17 |
| 3. Authentication | 0/? | Not started | - |
| 4. Automation and Deployment | 0/? | Not started | - |
