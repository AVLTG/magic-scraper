---
phase: 6
slug: game-tracking-core
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30.x with ts-jest 29.x |
| **Config file** | `jest.config.js` + `jest.setup.ts` (existing) |
| **Quick run command** | `npx jest --testPathPattern={affected}` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~10 seconds (27 existing tests baseline) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern={affected}`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-T1 | 06-01 | 0 | OPT-01 | — | npm test script available for all downstream gates | Config | `npm test -- --listTests` | package.json | ⬜ |
| 06-01-T2 | 06-01 | 0 | OPT-01 | T-06-01 | Sliding-window rate limit rejects >limit req/window per IP; getIpKey falls back to 'unknown' | Unit | `npx jest tests/rate-limit.test.ts` | src/lib/rateLimit.ts, tests/rate-limit.test.ts | ⬜ |
| 06-02-T1 | 06-02 | 1 | GAME-02, GAME-03 | T-06-02 | filterItems is case-insensitive; shouldShowAddNew suppresses row on exact (case-insensitive) match | Unit | `npx jest tests/combobox-helpers.test.ts` | src/app/components/combobox.tsx, tests/combobox-helpers.test.ts | ⬜ |
| 06-03-T1 | 06-03 | 1 | GAME-04, GAME-05, OPT-01 | T-06-03 | /api/players and /api/decks apply 30/60s rate limit before prisma; merged sets are sorted & de-duped | Integration | `npx jest tests/autocomplete-api.test.ts` | src/app/api/players/route.ts, src/app/api/decks/route.ts, tests/autocomplete-api.test.ts | ⬜ |
| 06-04-T1 | 06-04 | 1 | GAME-01, GAME-08, OPT-01 | T-06-04, T-06-05 | POST parses via gameSchema.parse (D-29 — no duplicate sanitization), writes in $transaction; rate limited 30/60s; 400 on validation error, 429 on overflow | Integration | `npx jest tests/games-api.test.ts` | src/app/api/games/route.ts, tests/games-api.test.ts | ⬜ |
| 06-04-T2 | 06-04 | 1 | GAME-06, GAME-07, GAME-08, GAME-09 | T-06-05, T-06-06 | PATCH does delete+recreate participants inside $transaction (D-16); DELETE cascades via FK; 404 on P2025; await params (Next 16) | Integration | `npx jest tests/games-api.test.ts` | src/app/api/games/[id]/route.ts, tests/games-api.test.ts | ⬜ |
| 06-05-T1 | 06-05 | 1 | OPT-01 | T-06-04, T-06-04b, T-06-REG | Additive 10/60s rate limit guard inserted BEFORE existing try block; prisma/scraper never reached on 429; existing behavior preserved | Integration | `npx jest tests/scraper-rate-limit.test.ts` | src/app/api/checkDeck/route.ts, src/app/api/scrapeLGS/route.ts, tests/scraper-rate-limit.test.ts | ⬜ |
| 06-06-T1 | 06-06 | 2 | GAME-01, GAME-02, GAME-03 | T-06-07 | filterEmptyRows trims; validateGameForm blocks empty-winner-row (Pitfall 4), remaps winner index after filtering, trims names, empty deck→undefined | Unit | `npx jest tests/game-form.test.ts` | src/app/games/game-form.tsx, src/app/games/delete-confirm-modal.tsx, tests/game-form.test.ts | ⬜ |
| 06-06-T2 | 06-06 | 2 | GAME-04, GAME-05, GAME-06, GAME-07, GAME-09 | T-06-07 | Pages wire GameForm→API, header gains Games link alphabetically; no console errors | Smoke (lint+typecheck) | `npm run lint && npx tsc --noEmit` | src/app/games/page.tsx, src/app/games/new/page.tsx, src/app/games/[id]/edit/page.tsx, src/app/components/header.tsx | ⬜ |
| 06-06-T3 | 06-06 | 2 | GAME-01..09 | T-06-07 | End-to-end human-verify: 16-step manual checklist (nav, empty state, autocomplete seeding, add-new row, validation, edit, delete modal, rate-limit burst, no console errors) | Manual (checkpoint:human-verify) | MANUAL — user types "approved" after running 16 steps | — | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Threat refs cross-reference each plan's `<threat_model>` STRIDE register.*

---

## Wave 0 Requirements

- [ ] Add `"test": "jest"` script to `package.json` (Plan 06-01 Task 1)
- [ ] Create `src/lib/rateLimit.ts` with `checkRateLimit` + `getIpKey` exports (Plan 06-01 Task 2) — all Wave 1 API plans depend on this
- [ ] Create `tests/rate-limit.test.ts` (7 tests) to gate the helper

*Existing jest infrastructure covers framework needs — no new dependencies required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Combobox keyboard navigation feel (↑↓ Enter Esc) | GAME-04, GAME-05 | Real keyboard UX hard to assert in JSDOM beyond a smoke test | Open /games/new, focus player input, type partial name, press ↓↓ Enter — value should commit |
| Visual expand-row animation on history table | GAME-06 | Pure CSS transition | Click a row, confirm smooth expand and correct participant list |
| Modal focus trap + Esc-to-close | GAME-07 | A11y behavior easier to validate manually than via unit test | Open delete modal, Tab through, press Esc, confirm close |
| 429 Retry-After header on real scraper burst | OPT-01 | Rate-limit window is per-instance in-memory; E2E with dev server is the most reliable check | Burst 11 requests to /api/checkDeck in <60s; expect 429 with `Retry-After` header |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (npm script, rateLimit helper, test scaffolds)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
