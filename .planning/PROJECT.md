# magic-scraper

## What This Is

A private web app for a friend group to share their Magic: The Gathering collections and check local game store card prices. Friends can paste a decklist to see who owns which cards across the group's combined Moxfield collections, and search which local stores (ETB, DCC, FTF) currently stock specific cards. Access is restricted behind a shared group password.

## Core Value

Friends can instantly see who in the group owns any card from a decklist, and check which local stores have it in stock.

## Requirements

### Validated

- ✓ LGS card price scraping (ETB, DCC, FTF) via Puppeteer — existing
- ✓ Moxfield collection scraping and storage in SQLite — existing
- ✓ Deck checker: paste a decklist, see which friends own which cards — existing
- ✓ Admin panel to manually trigger full collection refresh — existing
- ✓ Next.js UI with header navigation and Tailwind styling — existing
- ✓ Database migration to Turso cloud DB — v1.0
- ✓ Prisma schema preserved with libsql adapter — v1.0
- ✓ LGS scrapers on Vercel serverless via chromium-min + puppeteer-core — v1.0
- ✓ Moxfield collection scraper replaced with pure fetch — v1.0
- ✓ LGS scrape result caching with TTL — v1.0
- ✓ Collection update wrapped in Prisma transaction — v1.0
- ✓ Shared password authentication on all routes — v1.0
- ✓ Separate admin password for admin routes — v1.0
- ✓ Session/logout with httpOnly cookie — v1.0
- ✓ Nightly automated Moxfield sync via Vercel Cron — v1.0
- ✓ Cron route Bearer token authentication — v1.0
- ✓ Admin user management (add/delete) via UI — v1.0
- ✓ Deployment guide (DEPLOYMENT.md) — v1.0

### Active

- [ ] Game tracking system — spreadsheet-style input (date, players, winner, screwed, winner deck)
- [ ] Autocomplete dropdowns with shared player list and separate deck list
- [ ] Stats dashboard — win rates, screwed rates, deck winrates, graphs, pie charts
- [ ] Seed player list from existing Moxfield users (optional, allow new players too)
- [ ] Fix 401 Games scraper — proxy/Cloudflare bypass
- [ ] Rate limiting on API routes — protect against abuse
- [ ] Scraper error handling hardening — retry logic, better failure modes
- [ ] Admin can edit existing user's Moxfield collection ID
- [ ] Admin can view sync history / last-updated timestamps per user
- [ ] Error alerting when nightly cron sync fails
- [ ] Scraper health dashboard with logging
- [ ] Self-service password reset — no flow today; admin manually clears credentials + issues a new bound invite (#6 follow-up)
- [ ] Password change for logged-in users (account settings page) (#6 follow-up)
- [ ] Per-user decks & card library (#7) — Deck/DeckCard models, /decks + /library pages, tiered games dropdown, Moxfield plaintext import (in progress on `feature/user-decks-library`)

## Current Milestone: v1.1 Game Tracking & Polish

**Goal:** Add a game tracking system with stats dashboard, harden existing scrapers and add rate limiting, and improve admin tooling.

**Target features:**
- Game tracking with spreadsheet-style input and autocomplete dropdowns
- Stats dashboard with visualizations (bar graphs, pie charts, win/screwed rates)
- 401 Games scraper fix, rate limiting, scraper hardening
- Admin improvements: edit Moxfield IDs, sync history, error alerting, health dashboard

### Out of Scope

- ~~Individual user accounts/logins~~ — superseded by #5/#6: per-user accounts via admin invites (in progress on `feature/user-accounts`)
- Public access or sign-up flow — invite-only by design (admin invites only; no public sign-up)
- Mobile app — web-only is fine
- Real-time price updates — nightly sync is sufficient
- Price history tracking — not needed for this use case
- OAuth / social login — unnecessary complexity for a private tool

## Context

- **Stack**: Next.js 16, React 19, TypeScript, Prisma + Turso (libsql), chromium-min + puppeteer-core, Tailwind v4
- **Deployment**: Vercel free tier + Turso free tier, deployed and operational
- **Users**: Small closed friend group (~5-10 people), one admin (the developer)
- **Codebase**: ~2,100 LOC TypeScript across src/
- **Known issues**: 401 Games scraper disabled (Cloudflare blocks Vercel IPs), no rate limiting, no error alerting on cron failures

## Constraints

- **Budget**: Free tier only — Vercel Hobby + Turso free tier
- **Auth complexity**: No user accounts needed — shared secret is sufficient
- **DB**: Turso cloud DB (SQLite-compatible via libsql)
- **Scraping**: chromium-min for LGS stores, fetch for Moxfield API
- **Cron**: Vercel Cron (free tier allows 1 cron job, daily frequency, ~59 min variance)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shared password (not individual accounts) | Small closed group, no need for per-user identity | ✓ Good — simple and effective |
| Turso for DB | SQLite-compatible = minimal Prisma changes, generous free tier | ✓ Good — seamless migration |
| chromium-min for serverless scraping | Keeps existing scraper logic, works in Vercel serverless | ✓ Good — runtime binary fetch avoids 250MB bundle limit |
| Vercel Cron for nightly sync | Free tier supports daily cron, no external service needed | ✓ Good — zero-config automation |
| HMAC cookie for auth | Simple stateless auth with httpOnly cookie, no auth library overhead | ✓ Good — lightweight and secure |
| Moxfield fetch instead of browser | Moxfield API accessible without browser, eliminates heavy dependency | ✓ Good — faster and more reliable |
| prisma db push (not migrate deploy) | Turso incompatible with migrate deploy | ⚠️ Revisit — track Prisma/Turso support |
| Collection update in Prisma transaction | Prevents partial data loss during deleteMany + createMany | ✓ Good — atomic operations |
| maxDuration=300 on cron route | Fluid Compute budget for multi-user sync | ✓ Good — sufficient for current user count |
| Per-user accounts via admin invites (#6) | Per-user decks/library (#5) need identity; shared password retired via env-gated legacy bootstrap (`ALLOW_LEGACY_LOGIN`) | — in progress on `feature/user-accounts` |
| Decks store cards by value, not FK (#7) | Nightly sync deletes+recreates CollectionCard rows; FKs would orphan daily | — in progress |
| CollectionCard.source column for manual adds (#7) | One library source of truth; sync only replaces source='moxfield' | — in progress |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-09 after v1.1 milestone start*
