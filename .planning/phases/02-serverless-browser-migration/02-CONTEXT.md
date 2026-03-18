# Phase 2: Serverless Browser Migration - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Swap Puppeteer for `@sparticuz/chromium-min` + `puppeteer-core` so LGS scrapers (ETB, DCC, FTF) run inside Vercel serverless functions. Replace the Moxfield browser scraper with a plain `fetch()` call. Add TTL caching for LGS results to avoid redundant browser launches on repeated requests.

Auth, cron automation, admin user management, and deployment guide are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Caching
- 1-hour TTL on LGS scrape results
- In-memory Map (simple, zero infra, accepted cold-start reset risk for now)
- May migrate to Turso-backed cache if cold-start resets prove disruptive with ~20 concurrent users
- Cache key: card name only — all three stores' results stored together per card

### Per-store error handling
- Partial results + error flag: return whatever succeeded and include a `failedStores: string[]` (or equivalent) in the API response
- UI shows a per-store notice when a store failed (e.g. "FTF unavailable — results may be incomplete")
- A single flaky store should NOT block results from the other two stores

### Moxfield fetch
- Replace browser-based scraper with plain `fetch()` against `api2.moxfield.com`
- Spoof Chrome User-Agent header (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`) to avoid bot detection — keep the same UA the existing scraper uses
- Existing pagination logic (pageNumber, pageSize=5000) and card filtering (skip basic lands + tokens) stays the same

### Browser launch structure
- Singleton `browser.ts` removed — it won't survive across serverless invocations
- One browser launched per incoming API request (lazy-init), reused across ETB/DCC/FTF pages within that single call, closed when done — matches the existing `closeBrowser()` after `scrapeAllSites`
- `browser` instance passed as a parameter into each scraper function; each scraper creates and closes its own page (existing `page.close()` in finally blocks stays)

### Version pinning
- `@sparticuz/chromium-min` and `puppeteer-core` versions must be pinned exactly (no semver ranges) — verify the compatibility table in the chromium-min README at install time

### Claude's Discretion
- Exact cache data structure (Map shape, entry format)
- `executablePath` resolution and chromium-min launch args for Vercel
- Temp/download directory for chromium binary at runtime
- Specific API response shape for failed-store flags (field name, placement)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scraper requirements
- `.planning/REQUIREMENTS.md` §Scrapers — SCRP-01 through SCRP-04 (SCRP-04 already complete)

### Chromium compatibility
- `@sparticuz/chromium-min` README (npm) — compatibility table for chromium-min ↔ puppeteer-core version pairing; check at install time, pin exact versions

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/scrapeLGS/scrapeETB.ts`, `scrapeDCC.ts`, `scrapeFTF.ts` — scraping logic is sound; only the browser acquisition changes (receive `browser` param instead of calling `getBrowser()`)
- `src/lib/scrapeLGS/scrapeAllSites.ts` — orchestration stays: `Promise.all` across three scrapers, close browser after. Needs error isolation per scraper (currently a rejection in one could propagate).
- `src/lib/scrapeMoxfield/scrapeMoxfield.ts` — already calls `api2.moxfield.com` JSON API; just replace `page.goto()` + `page.evaluate()` with `fetch()`. Pagination and filtering logic is reusable as-is.
- `src/app/api/scrapeLGS/route.ts` — entry point for LGS scrapes; cache layer slots in here before calling `scrapeAllSites`

### Established Patterns
- `server-only` import at top of scraper files — keep this
- `page.close()` in `finally` blocks — keep this pattern; browser close moves to `scrapeAllSites` caller
- `Promise.all` for parallel store scraping — keep; add `allSettled`-style isolation or per-scraper try/catch to avoid one failure cancelling others

### Integration Points
- `src/app/api/scrapeLGS/route.ts` — cache check/set wraps `scrapeAllSites` call here
- `src/lib/scrapeLGS/browser.ts` — will be rewritten from singleton to a factory/launcher that accepts chromium-min `executablePath`
- `src/lib/scrapeMoxfield/scrapeMoxfield.ts` — standalone replacement; called from `src/lib/updateCollections.ts`

</code_context>

<specifics>
## Specific Ideas

No specific references — open to standard approaches for chromium-min integration.

</specifics>

<deferred>
## Deferred Ideas

- Turso-backed cache — noted as a future migration if in-memory cold-start resets prove disruptive with ~20 users
- 401 Games scraper fix — deferred to v2 (likely Cloudflare-blocked from Vercel IPs)
- Rate limiting on `/api/scrapeLGS` — v2 requirement (SCRP-V2-02)

</deferred>

---

*Phase: 02-serverless-browser-migration*
*Context gathered: 2026-03-17*
