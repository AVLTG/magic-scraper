---
phase: 02-serverless-browser-migration
verified: 2026-03-17T18:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 2: Serverless Browser Migration Verification Report

**Phase Goal:** LGS scrapers run inside Vercel serverless functions using a remote Chromium binary, and the Moxfield sync no longer launches a browser at all
**Verified:** 2026-03-17
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | LGS scrapers accept a Browser parameter instead of calling getBrowser() singleton | VERIFIED | scrapeETB/DCC/FTF all have `{ card, browser }: ScrapeCardProps & { browser: Browser }` signature; no `getBrowser` anywhere in src/ |
| 2  | scrapeAllSites launches a per-request browser via chromium-min and closes it after all scrapers finish | VERIFIED | `browser.ts` exports `launchBrowser()` using `@sparticuz/chromium-min`; `scrapeAllSites.ts` calls `launchBrowser()`, passes browser to scrapers, closes in `finally` block |
| 3  | scrapeAllSites uses Promise.allSettled so one store failure does not cancel the others | VERIFIED | Line 13 of `scrapeAllSites.ts`: `await Promise.allSettled([...])` |
| 4  | scrapeAllSites returns { products, failedStores } instead of a flat Product[] | VERIFIED | Return type declared as `Promise<{ products: Product[]; failedStores: string[] }>`, fulfilled at line 36 |
| 5  | scrapeMoxfield uses fetch() with User-Agent header instead of launching a browser | VERIFIED | `scrapeMoxfield.ts` uses `fetch(apiUrl, { headers: { "User-Agent": USER_AGENT } })`, zero puppeteer/browser/page references |
| 6  | The full puppeteer package is removed from dependencies | VERIFIED | `package.json` has no `"puppeteer":` key; no `from "puppeteer"` imports in `src/` |
| 7  | puppeteer-core and @sparticuz/chromium-min are pinned to exact versions | VERIFIED | `"@sparticuz/chromium-min": "143.0.4"` (no caret), `"puppeteer-core": "24.39.1"` (no caret) |
| 8  | next.config.ts includes serverExternalPackages for both new packages | VERIFIED | `serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"]` at line 4 |
| 9  | Repeated LGS scrape requests for the same card within 1 hour return cached results without launching a browser | VERIFIED | `lgsCache.ts` implements TTL_MS = 60*60*1000; `route.ts` calls `getCached(card)` before `scrapeAllSites` |
| 10 | Cache key is the lowercased card name | VERIFIED | `lgsCache.ts` line 16: `const key = cardName.toLowerCase()` |
| 11 | Cached response includes both products and failedStores from the original scrape | VERIFIED | `CacheEntry` interface stores both fields; `getCached` returns `{ products, failedStores }` |
| 12 | The scrapeLGS route has a 60-second maxDuration for Vercel serverless | VERIFIED | `route.ts` line 5: `export const maxDuration = 60` |
| 13 | The API response includes a failedStores array alongside products | VERIFIED | `route.ts` returns `NextResponse.json({ products, failedStores })` on both cache hit and cache miss paths |
| 14 | The UI shows a notice when one or more stores failed | VERIFIED | `page.tsx` lines 75-79: conditional `<p className="text-sm text-yellow-600 mb-4">` rendered when `failedStores.length > 0` |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/scrapeLGS/browser.ts` | Per-request browser launch using chromium-min | VERIFIED | Exports only `launchBrowser()`, imports from `@sparticuz/chromium-min` and `puppeteer-core`, 14 lines, substantive |
| `src/lib/scrapeLGS/scrapeAllSites.ts` | Orchestration with Promise.allSettled and failedStores | VERIFIED | 41 lines, imports `launchBrowser`, uses `Promise.allSettled`, returns `{ products, failedStores }` |
| `src/lib/scrapeMoxfield/scrapeMoxfield.ts` | Fetch-based Moxfield collection scraper | VERIFIED | 79 lines, `fetch(apiUrl, ...)` with User-Agent, no browser dependency, pagination preserved |
| `next.config.ts` | serverExternalPackages config | VERIFIED | Contains `serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"]` |
| `package.json` | Correct dependency versions | VERIFIED | chromium-min@143.0.4 and puppeteer-core@24.39.1 at exact pins; no full `puppeteer` key |
| `src/lib/scrapeLGS/lgsCache.ts` | In-memory TTL cache for LGS scrape results | VERIFIED | Exports `getCached` and `setCache`, TTL_MS = 3,600,000ms, lowercased key |
| `src/app/api/scrapeLGS/route.ts` | Cache-wrapped LGS scrape endpoint with maxDuration | VERIFIED | Exports `POST` and `maxDuration = 60`, checks cache before scraping, caches results after |
| `src/app/SearchLGS/page.tsx` | UI with failedStores notice | VERIFIED | `failedStores` state, `setFailedStores(data.failedStores || [])`, yellow warning banner rendered conditionally |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scrapeAllSites.ts` | `browser.ts` | `import { launchBrowser }` | WIRED | Line 2: `import { launchBrowser } from "./browser"`, called at line 11 |
| `scrapeETB.ts` | `puppeteer-core` | `import type { Browser }` | WIRED | Line 2: `import type { Browser } from "puppeteer-core"`, used in function signature |
| `scrapeDCC.ts` | `puppeteer-core` | `import type { Browser }` | WIRED | Line 2: `import type { Browser } from "puppeteer-core"`, used in function signature |
| `scrapeFTF.ts` | `puppeteer-core` | `import type { Browser }` | WIRED | Line 2: `import type { Browser } from "puppeteer-core"`, used in function signature |
| `scrapeMoxfield.ts` | `api2.moxfield.com` | `fetch()` call | WIRED | Line 20: URL template targets `api2.moxfield.com`; `fetch(apiUrl, ...)` at line 23 with response handling |
| `route.ts` | `lgsCache.ts` | `import { getCached, setCache }` | WIRED | Line 3 import; `getCached(card)` at line 17, `setCache(card, ...)` at line 29 |
| `route.ts` | `scrapeAllSites.ts` | `scrapeAllSites` returning `{ products, failedStores }` | WIRED | Line 2 import; destructured at line 26: `const { products, failedStores } = await scrapeAllSites(card)` |
| `page.tsx` | `/api/scrapeLGS` | `fetch POST, reads failedStores from response` | WIRED | Line 24: `fetch("/api/scrapeLGS", { method: "POST", ... })`; `failedStores` read from response at line 40 and rendered at line 75 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SCRP-01 | 02-01 | LGS scrapers run on Vercel serverless using `@sparticuz/chromium-min` + `puppeteer-core` | SATISFIED | browser.ts uses chromium-min; all three scrapers use puppeteer-core Browser type; next.config.ts has serverExternalPackages |
| SCRP-02 | 02-01 | Moxfield collection scraper replaced with plain `fetch()` — no browser needed | SATISFIED | scrapeMoxfield.ts uses fetch() only, zero puppeteer imports |
| SCRP-03 | 02-02 | LGS scrape results cached per card name with TTL to avoid redundant browser launches on repeated requests | SATISFIED | lgsCache.ts with 1h TTL; route.ts checks cache before calling scrapeAllSites |
| SCRP-04 | 02-02 (claimed); actually completed in Phase 1 | Collection update wrapped in a Prisma transaction to prevent partial data loss | SATISFIED | `src/lib/updateCollections.ts` contains `prisma.$transaction(async (tx) => {...})` — completed in Phase 1 commit `376773f`, re-confirmed present |

**Note on SCRP-04:** ROADMAP.md lists SCRP-04 under Phase 2 requirements, and 02-02-PLAN.md claims it. However, REQUIREMENTS.md traceability records it as "Phase 1 (early)" and it was completed in Phase 1 commit `376773f`. The 02-02 plan claimed it without needing to implement it (already done). The requirement is satisfied in the codebase regardless of which plan claims credit. No gap.

---

### Anti-Patterns Found

No blockers or warnings found.

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| — | None | — | No TODO/FIXME/placeholder comments in any modified file |
| — | None | — | No stub return patterns (return null / return {}) in implementation paths |
| — | None | — | No getBrowser/closeBrowser/browserInstance references in src/ |
| — | None | — | No `from "puppeteer"` (full package) imports in src/ |

---

### Human Verification Required

#### 1. LGS Scraper End-to-End on Vercel

**Test:** Deploy to Vercel (or run `vercel dev`), search for a card name (e.g. "Lightning Bolt") on the LGS Search page.
**Expected:** Results appear from at least one of ETB, DCC, FTF. No 500 error. Response time under 60 seconds.
**Why human:** Requires actual Chromium binary download from `CHROMIUM_REMOTE_EXEC_PATH` at runtime. The remote binary URL must be set in Vercel environment variables. Cannot verify binary download or real browser launch programmatically.

#### 2. Cache Behavior Under Warm Invocation

**Test:** Search the same card name twice within 1 hour. Observe that the second request returns noticeably faster (cache hit skips browser launch).
**Expected:** Second response is nearly instant (< 1 second) vs. first response (10-60 seconds).
**Why human:** The in-memory cache resets on cold starts. Whether a warm invocation is reused is determined by Vercel infrastructure, not by the code alone.

#### 3. failedStores Warning Banner Appearance

**Test:** Simulate a store failure (e.g., by temporarily breaking one store URL) and trigger a scrape.
**Expected:** The yellow warning banner appears with the failed store name and "unavailable — results may be incomplete" text. Partial results from other stores are shown.
**Why human:** Requires deliberate store failure injection. Visual appearance of the banner cannot be verified programmatically.

#### 4. Vercel Function Bundle Size

**Test:** Run `vercel build` and inspect the output bundle size for the scrapeLGS function.
**Expected:** Function bundle is under 250 MB. The Chromium binary is NOT included in the bundle (it is fetched at runtime via CHROMIUM_REMOTE_EXEC_PATH).
**Why human:** Bundle size verification requires a real Vercel build and inspection of the `.vercel/output` directory. The serverExternalPackages config is correct in code, but actual exclusion from the bundle must be confirmed.

---

### Gaps Summary

No gaps found. All 14 must-have truths verified. All artifacts exist and are substantive and wired. All 5 documented commits confirmed to exist in git history. Phase goal is achieved.

---

_Verified: 2026-03-17_
_Verifier: Claude (gsd-verifier)_
