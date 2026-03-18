# Phase 2: Serverless Browser Migration - Research

**Researched:** 2026-03-17
**Domain:** Serverless Chromium (Vercel), Puppeteer-core, In-memory caching, Fetch-based API replacement
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Caching:** 1-hour TTL on LGS scrape results; in-memory Map (simple, zero infra, accepted cold-start reset risk); cache key is card name only — all three stores' results stored together per card
- **Per-store error handling:** Partial results + error flag: return whatever succeeded and include a `failedStores: string[]` (or equivalent) in the API response; a single flaky store must NOT block the other two; UI shows a per-store notice when a store fails
- **Moxfield fetch:** Replace browser-based scraper with plain `fetch()` against `api2.moxfield.com`; spoof Chrome User-Agent (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`); existing pagination logic (pageNumber, pageSize=5000) and card filtering (skip basic lands + tokens) stays the same
- **Browser launch structure:** Singleton `browser.ts` removed; one browser launched per incoming API request (lazy-init), reused across ETB/DCC/FTF pages within that single call, closed when done; `browser` instance passed as a parameter into each scraper function; each scraper creates and closes its own page (existing `page.close()` in finally blocks stays)
- **Version pinning:** `@sparticuz/chromium-min` and `puppeteer-core` must be pinned to exact versions (no semver ranges) — verify the compatibility table in the chromium-min README at install time

### Claude's Discretion
- Exact cache data structure (Map shape, entry format)
- `executablePath` resolution and chromium-min launch args for Vercel
- Temp/download directory for chromium binary at runtime
- Specific API response shape for failed-store flags (field name, placement)

### Deferred Ideas (OUT OF SCOPE)
- Turso-backed cache — noted as a future migration if in-memory cold-start resets prove disruptive with ~20 users
- 401 Games scraper fix — deferred to v2 (likely Cloudflare-blocked from Vercel IPs)
- Rate limiting on `/api/scrapeLGS` — v2 requirement (SCRP-V2-02)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCRP-01 | LGS scrapers (ETB, DCC, FTF) run on Vercel serverless using `@sparticuz/chromium-min` + `puppeteer-core` | chromium-min + puppeteer-core version pairing, launch config, Next.js serverExternalPackages, maxDuration |
| SCRP-02 | Moxfield collection scraper replaced with plain `fetch()` — no browser needed | Existing `page.goto()` → `fetch()` swap; same JSON API URL, pagination, and UA header |
| SCRP-03 | LGS scrape results cached per card name with TTL to avoid redundant browser launches | In-memory Map with timestamp-based TTL; cache slot in `route.ts` before `scrapeAllSites` |
| SCRP-04 | Collection update wrapped in Prisma transaction — ALREADY COMPLETE in Phase 1 | No work needed |
</phase_requirements>

---

## Summary

This phase has two independent workstreams: (1) replace the full `puppeteer` package with `@sparticuz/chromium-min` + `puppeteer-core` so LGS scrapers can run in Vercel's serverless environment without bundling a browser binary, and (2) replace the Moxfield browser scraper with a direct `fetch()` call to the same JSON API it was already navigating to via `page.goto()`.

The Chromium swap is the highest-risk work. The key constraint is that `@sparticuz/chromium-min` downloads the Chromium binary at function cold-start from an externally hosted tarball URL (GitHub Releases or S3), decompresses it into `/tmp`, and exposes an `executablePath`. Subsequent warm invocations reuse the `/tmp` binary. This keeps the deployed bundle well under Vercel's 250 MB limit. The version pairing rule is simple: the major version number of `@sparticuz/chromium-min` equals the Chromium major version; choose the `puppeteer-core` release that bundles the same Chromium major. The verified working pair is `@sparticuz/chromium-min@133.0.4` + `puppeteer-core@24.5.0` (confirmed via Vercel community thread, March 2025). However, the README instructs verifying the compatibility table at install time, so check `https://pptr.dev/chromium-support/` against the latest `@sparticuz/chromium-min` release before running `npm install`.

The Moxfield replacement is low-risk: the existing scraper already calls `api2.moxfield.com` through `page.goto()` then `page.evaluate()`. Replacing those two calls with a single `fetch()` + `response.json()` eliminates the browser entirely for that path, and all downstream logic (pagination, filtering, DB write) is unchanged.

**Primary recommendation:** Pin `@sparticuz/chromium-min@133.0.4` + `puppeteer-core@24.5.0` (exact, no ranges). Add both to `serverExternalPackages` in `next.config.ts`. Export `maxDuration = 60` from the scrapeLGS route. Remove the full `puppeteer` package after migration.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sparticuz/chromium-min` | `133.0.4` (pin exact) | Chromium binary fetched at runtime for serverless | -min variant keeps deployed bundle tiny; binary downloads to /tmp on cold start |
| `puppeteer-core` | `24.5.0` (pin exact) | Puppeteer without bundled browser; uses chromium-min binary | Pairs with chromium-min 133; no full browser download at build time |

**Remove:** `puppeteer` (full package, currently `^24.34.0`) — replaced entirely by the above two.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `fetch` (built-in) | built-in (Node 18+) | Replace Moxfield browser scraper | SCRP-02: plain HTTP to `api2.moxfield.com` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sparticuz/chromium-min` | `@sparticuz/chromium` (full) | Full variant bundles Brotli files inside the npm package (~50 MB); -min downloads them at runtime. Use -min for Vercel to stay under 250 MB. |
| In-memory Map cache | Turso-backed cache | Turso survives cold-start resets but adds infra and latency; in-memory is simpler for ~20 users and accepted by user |
| `fetch()` for Moxfield | Keep puppeteer for Moxfield | No benefit to keeping browser; API is publicly accessible JSON |

**Installation (after removing full `puppeteer`):**
```bash
npm uninstall puppeteer
npm install --save-exact @sparticuz/chromium-min@133.0.4 puppeteer-core@24.5.0
```

**Version verification before install — check the README compatibility table:**
```bash
# Check latest chromium-min
npm view @sparticuz/chromium-min dist-tags
# Visit https://pptr.dev/chromium-support/ to match chromium version to puppeteer-core version
# The major version number of @sparticuz/chromium-min IS the Chromium major version
```

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are confined to existing files:

```
src/
├── lib/
│   └── scrapeLGS/
│       ├── browser.ts            ← REWRITE: singleton → per-request factory
│       ├── scrapeAllSites.ts     ← MODIFY: pass browser param, add per-store error isolation
│       ├── scrapeETB.ts          ← MODIFY: accept browser param, remove getBrowser() call
│       ├── scrapeDCC.ts          ← MODIFY: accept browser param, remove getBrowser() call
│       └── scrapeFTF.ts          ← MODIFY: accept browser param, remove getBrowser() call
│   └── scrapeMoxfield/
│       └── scrapeMoxfield.ts     ← REWRITE: puppeteer → fetch()
└── app/
    └── api/
        └── scrapeLGS/
            └── route.ts          ← MODIFY: add cache layer + export maxDuration
next.config.ts                    ← MODIFY: add serverExternalPackages
```

### Pattern 1: chromium-min Launch (per-request, not singleton)

**What:** Launch a fresh browser per API request using the downloaded chromium binary. The singleton pattern from `browser.ts` cannot survive across serverless invocations — cold starts always get a fresh function instance.

**When to use:** Every LGS scrape request.

```typescript
// Source: Vercel community thread + official sparticuz/chromium README
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

const CHROMIUM_REMOTE_PATH = process.env.CHROMIUM_REMOTE_EXEC_PATH;
// Value: "https://github.com/Sparticuz/chromium/releases/download/v133.0.4/chromium-v133.0.4-pack.tar"

export async function launchBrowser() {
  const executablePath = await chromium.executablePath(CHROMIUM_REMOTE_PATH);
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  });
}
```

The `executablePath()` call decompresses the tarball into `/tmp/chromium` on cold start; warm invocations detect the existing file and skip the download.

### Pattern 2: Browser Passed as Parameter

**What:** `scrapeAllSites` launches the browser once, passes it to each scraper, closes it after all scrapers finish.

**When to use:** Every LGS scrape — replaces the old `getBrowser()` singleton calls inside each scraper.

```typescript
// scrapeAllSites.ts — pattern
import { launchBrowser } from './browser';
import { scrapeETB } from './scrapeETB';
import { scrapeDCC } from './scrapeDCC';
import { scrapeFTF } from './scrapeFTF';

export async function scrapeAllSites(card: string): Promise<{
  products: Product[];
  failedStores: string[];
}> {
  const browser = await launchBrowser();
  try {
    const results = await Promise.allSettled([
      scrapeETB({ card, browser }),
      scrapeDCC({ card, browser }),
      scrapeFTF({ card, browser }),
    ]);

    const products: Product[] = [];
    const failedStores: string[] = [];
    const storeNames = ['Enter The Battlefield', 'Dungeon Comics and Cards', 'Face to Face Games'];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        products.push(...result.value);
      } else {
        console.error(`${storeNames[i]} failed:`, result.reason);
        failedStores.push(storeNames[i]);
      }
    });

    return { products, failedStores };
  } finally {
    await browser.close();
  }
}

// Each scraper signature changes:
// Before: scrapeETB({ card }: ScrapeCardProps)
// After:  scrapeETB({ card, browser }: ScrapeCardProps & { browser: Browser })
```

### Pattern 3: In-Memory TTL Cache

**What:** Module-level Map in `route.ts` (or a sibling `cache.ts`). Check before launching browser; set after successful scrape.

**When to use:** Cache check is the first thing in `POST /api/scrapeLGS`.

```typescript
// Cache lives at module scope — survives warm invocations, resets on cold start
import type { Product } from '@/types/product';

interface CacheEntry {
  products: Product[];
  failedStores: string[];
  cachedAt: number;
}

const lgsCache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCached(cardName: string): CacheEntry | null {
  const entry = lgsCache.get(cardName.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    lgsCache.delete(cardName.toLowerCase());
    return null;
  }
  return entry;
}

export function setCache(cardName: string, data: Omit<CacheEntry, 'cachedAt'>): void {
  lgsCache.set(cardName.toLowerCase(), { ...data, cachedAt: Date.now() });
}
```

Cache key is lowercased card name. All three stores' results are stored together per key.

### Pattern 4: Moxfield fetch() Replacement

**What:** Drop-in replacement for `page.goto()` + `page.evaluate()` with a `fetch()` call. All pagination and filtering logic is unchanged.

**When to use:** `scrapeMoxfield.ts` rewrite.

```typescript
// Before (puppeteer):
const response = await page.goto(apiUrl, { waitUntil: 'networkidle0', timeout: 30000 });
const bodyText = await page.evaluate(() => document.body.innerText);
const apiData = JSON.parse(bodyText);

// After (fetch):
const response = await fetch(apiUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});
if (!response.ok) break;
const apiData = await response.json();
```

The rest of the loop body (`pageCards` population, land/token filtering, pagination check) is unchanged.

### Pattern 5: Next.js serverExternalPackages

**What:** Tell Next.js not to bundle `puppeteer-core` and `@sparticuz/chromium-min` into the edge/serverless chunk — they must remain as Node.js externals.

**When to use:** Required for both packages to work at all in Next.js app router.

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"],
};

export default nextConfig;
```

### Pattern 6: maxDuration on scrapeLGS route

**What:** Export the Vercel route segment config `maxDuration` to override the default 10-second timeout.

**When to use:** Required — LGS scrapes involve browser launch + 3 store page navigations; cold start alone can take 10-20 seconds.

```typescript
// src/app/api/scrapeLGS/route.ts
export const maxDuration = 60; // Vercel Pro: up to 60s; Hobby with Fluid Compute: up to 300s

export async function POST(request: Request) { ... }
```

### Pattern 7: CHROMIUM_REMOTE_EXEC_PATH env var

**What:** The tarball URL is provided via environment variable so it can be updated without code changes. In development this variable is left unset (or set to a local path) and Puppeteer falls back to using the locally installed full `puppeteer` chrome — but since we're removing the full package, local development will either need the env var set OR the dev flow is to set `CHROMIUM_REMOTE_EXEC_PATH` to the GitHub release URL and accept the first-run download.

**Recommended dev approach:** Set `CHROMIUM_REMOTE_EXEC_PATH` to the GitHub releases URL in `.env.local`. The `/tmp` cache means second+ runs in the same process are fast.

```bash
# .env.local
CHROMIUM_REMOTE_EXEC_PATH=https://github.com/Sparticuz/chromium/releases/download/v133.0.4/chromium-v133.0.4-pack.tar
```

### Anti-Patterns to Avoid

- **Semver ranges on chromium packages:** `^133.0.4` will break when chromium-min updates because the protocol version changes. Pin exact. The README explicitly warns about this.
- **Importing `puppeteer` (full package) anywhere:** The full package attempts to download a Chromium binary at install time, bloating the Vercel bundle past 250 MB. After migration, only `puppeteer-core` is imported in scraper files.
- **Keeping the singleton `browser.ts` pattern:** Module-level state is not shared across serverless invocations. The singleton will be `null` on every cold start and creates a memory leak if not properly closed.
- **Bundling chromium-min Brotli files:** The `-min` variant intentionally omits them from the npm package. Do not try to copy them into the build; pass a remote URL to `executablePath()` instead.
- **Not adding `serverExternalPackages`:** Without this, Next.js tries to webpack-bundle puppeteer-core, which fails because it uses Node.js native modules.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Running Chrome in serverless | Custom binary packaging or layer | `@sparticuz/chromium-min` | Handles Brotli compression, temp extraction, cross-distro shared libs, ARM vs x64 |
| Browser args for headless serverless | Custom `--disable-*` flags list | `chromium.args` from the package | Maintained list of sandbox disables and renderer flags needed in container environments |
| TTL cache expiration | Custom cache library | Plain `Map` + `Date.now()` comparison | Problem is simple enough; no library needed at this scale |
| Moxfield JSON parsing | Custom HTML parser | `response.json()` | API already returns JSON — no parsing needed |

---

## Common Pitfalls

### Pitfall 1: Version Mismatch Between chromium-min and puppeteer-core
**What goes wrong:** `Protocol error` or `Target closed` on `browser.newPage()` — the CDP protocol version in puppeteer-core doesn't match the Chromium build.
**Why it happens:** `@sparticuz/chromium-min@133` ships Chromium 133; `puppeteer-core@24.39.1` (current latest) expects Chromium 146. The major versions must match.
**How to avoid:** Before installing, check `https://pptr.dev/chromium-support/` to find which `puppeteer-core` version bundles the same major Chromium as the chromium-min version you're installing. Pin both exact.
**Warning signs:** `UnhandledPromiseRejection: ProtocolError` at browser launch time.

### Pitfall 2: Bundle Size Exceeds 250 MB
**What goes wrong:** Vercel deployment fails with bundle size error, or function crashes at cold start.
**Why it happens:** Using `@sparticuz/chromium` (full) instead of `-min`, or forgetting `serverExternalPackages`, or leaving the full `puppeteer` package installed.
**How to avoid:** Use `-min` variant. Remove `puppeteer` from `package.json`. Verify `serverExternalPackages` is set. Run `npm run build` locally to check bundle output.
**Warning signs:** `npm install` shows chromium download during `postinstall`; build output shows large serverless function size.

### Pitfall 3: `executablePath()` Called Without Remote URL
**What goes wrong:** `Error: Could not find chromium binary` in Vercel logs.
**Why it happens:** `-min` has no bundled binary. Without a URL, `executablePath()` looks for local Brotli files that don't exist.
**How to avoid:** Always pass the remote tarball URL (via env var) to `executablePath(CHROMIUM_REMOTE_EXEC_PATH)`. Set the env var in Vercel project settings.
**Warning signs:** Error on first invocation; `/tmp/chromium` never exists.

### Pitfall 4: Serverless Function Timeout During Cold Start
**What goes wrong:** LGS scrape returns 504 on first request after deploy.
**Why it happens:** Cold start includes: Chromium tarball download + decompression + browser launch + 3 page navigations. On Hobby plan default 10s, this always times out.
**How to avoid:** Export `maxDuration = 60` from the route. If on Hobby plan without Fluid Compute, 60s is the ceiling — which should be sufficient for warm starts but cold starts may still be tight. Enable Fluid Compute in Vercel project settings for 300s budget.
**Warning signs:** 504 on first request, fast on second.

### Pitfall 5: `Promise.all` Fails Entire Scrape When One Store Errors
**What goes wrong:** If ETB throws, DCC and FTF results are discarded; the API returns 500.
**Why it happens:** Current `scrapeAllSites.ts` uses `Promise.all` which rejects on any rejection.
**How to avoid:** Switch to `Promise.allSettled` and check each result's `status`. Return partial results + `failedStores` array from the resolved scrapers.
**Warning signs:** Intermittent 500 errors when only one store's HTML structure changes.

### Pitfall 6: Moxfield API Returns 403 Without User-Agent Spoofing
**What goes wrong:** `fetch()` call returns 403 Forbidden; collection sync fails.
**Why it happens:** `api2.moxfield.com` blocks requests without a browser-like User-Agent.
**How to avoid:** Always include `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...` header on every `fetch()` call. This is the same UA the browser scraper was already sending via `page.setUserAgent()`.
**Warning signs:** `response.ok === false` with status 403.

---

## Code Examples

Verified patterns from official sources and working Vercel deployments:

### chromium-min Launch with Remote Binary URL
```typescript
// Source: Vercel community thread (confirmed working: chromium-min@133 + puppeteer-core@24.5.0)
// src/lib/scrapeLGS/browser.ts
import chromium from '@sparticuz/chromium-min';
import puppeteer, { Browser } from 'puppeteer-core';

export async function launchBrowser(): Promise<Browser> {
  const executablePath = await chromium.executablePath(
    process.env.CHROMIUM_REMOTE_EXEC_PATH
  );
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  });
}
```

### Updated Scraper Signature
```typescript
// Source: existing codebase pattern + parameter injection
// src/lib/scrapeLGS/scrapeETB.ts (and DCC, FTF same pattern)
import "server-only";
import type { Browser } from 'puppeteer-core';
import type { Product, ScrapeCardProps } from "@/types/product";

export async function scrapeETB({
  card,
  browser,
}: ScrapeCardProps & { browser: Browser }): Promise<Product[]> {
  const page = await browser.newPage();
  try {
    // ... existing page logic unchanged ...
  } finally {
    await page.close();
  }
}
```

### Cache Layer in route.ts
```typescript
// Source: pattern derived from CONTEXT.md decisions
// src/app/api/scrapeLGS/route.ts
import { NextResponse } from "next/server";
import { scrapeAllSites } from "@/lib/scrapeLGS/scrapeAllSites";
import type { Product } from "@/types/product";

export const maxDuration = 60;

interface CacheEntry {
  products: Product[];
  failedStores: string[];
  cachedAt: number;
}

const lgsCache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json();
  const card = typeof body.card === "string" ? body.card.trim() : "";
  if (!card) {
    return NextResponse.json({ error: "card is required" }, { status: 400 });
  }

  const cacheKey = card.toLowerCase();
  const cached = lgsCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return NextResponse.json({
      products: cached.products,
      failedStores: cached.failedStores,
    });
  }

  try {
    const { products, failedStores } = await scrapeAllSites(card);
    lgsCache.set(cacheKey, { products, failedStores, cachedAt: Date.now() });
    return NextResponse.json({ products, failedStores });
  } catch (error) {
    console.error("Scrape failed", error);
    return NextResponse.json({ error: "Failed to scrape" }, { status: 500 });
  }
}
```

### Moxfield fetch() Replacement (core change)
```typescript
// Source: existing scrapeMoxfield.ts logic, browser calls replaced with fetch()
// Loop body — replaces page.goto() + page.evaluate() + JSON.parse()
const apiUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?...`;

const response = await fetch(apiUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});
if (!response.ok) {
  console.error(`Moxfield API returned ${response.status}`);
  break;
}
const apiData = await response.json();
// Remainder of loop (card parsing, filtering) is unchanged
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `puppeteer` full package | `puppeteer-core` + `@sparticuz/chromium-min` | ~2022 (chromium-min became the standard) | Bundle size drops from ~300 MB to ~5 MB deployed |
| `experimentalServerComponentsExternalPackages` in next.config | `serverExternalPackages` (stable) | Next.js 15 | Property moved to stable config; old key still works but deprecated |
| `headless: "new"` | `headless: true` | Puppeteer 22+ | Chrome headless shell mode; `true` is accepted again in recent versions |
| Module-level singleton browser | Per-request browser launch | N/A for serverless | Singletons don't survive cold starts; per-request is the only correct pattern |

**Deprecated/outdated:**
- `puppeteer` (full package): pulls in a full Chromium binary at install time — incompatible with Vercel's 250 MB function limit.
- `experimentalServerComponentsExternalPackages` in `next.config`: replaced by `serverExternalPackages` (stable) in Next.js 15+. Project uses Next.js 16.x so use the stable key.

---

## Open Questions

1. **Exact compatible puppeteer-core version at install time**
   - What we know: `@sparticuz/chromium-min@133.0.4` + `puppeteer-core@24.5.0` is a confirmed working pair (Vercel community, March 2025). Latest chromium-min is `143.0.4`.
   - What's unclear: Whether 143.x is stable/recommended or still cutting-edge; whether a `puppeteer-core` version exists that bundles Chromium 143.
   - Recommendation: Start with the proven `133.0.4` + `24.5.0` pair. At install time, check `https://pptr.dev/chromium-support/` and the chromium-min README for any newer verified pair. Do not assume latest = best.

2. **Vercel plan and Fluid Compute availability**
   - What we know: Hobby default is 10s; Pro default is 15s configurable to 60s; Fluid Compute gives 300s on Hobby.
   - What's unclear: Whether the project is on Hobby or Pro, and whether Fluid Compute is enabled.
   - Recommendation: Export `maxDuration = 60` unconditionally. Note in implementation comments that Fluid Compute should be enabled in Vercel project settings (STATE.md already flags this).

3. **Moxfield API stability**
   - What we know: The existing scraper already calls `api2.moxfield.com` JSON API directly via `page.goto()` and it works. The same URL will be used with `fetch()`.
   - What's unclear: Whether Moxfield added additional bot protection (CORS, signed headers) beyond User-Agent that puppeteer was implicitly bypassing.
   - Recommendation: Implementation is straightforward; flag in verification that the actual API call must be tested against live Moxfield, not just locally.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files or test directories in project |
| Config file | None — Wave 0 gap |
| Quick run command | N/A until framework installed |
| Full suite command | N/A until framework installed |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRP-01 | launchBrowser() returns a Browser instance using chromium-min | unit | N/A — Wave 0 gap | ❌ Wave 0 |
| SCRP-01 | scrapeAllSites returns products array from all 3 scrapers | integration (live) | manual-only — requires live store URLs | N/A |
| SCRP-02 | scrapeMoxfield fetches cards via fetch() without launching browser | unit (mock fetch) | N/A — Wave 0 gap | ❌ Wave 0 |
| SCRP-03 | Cache returns hit within TTL; returns miss after TTL expires | unit | N/A — Wave 0 gap | ❌ Wave 0 |
| SCRP-03 | Cache returns partial results + failedStores when one scraper rejects | unit | N/A — Wave 0 gap | ❌ Wave 0 |

Note: SCRP-01 (live LGS scrape from Vercel) is manual-only — cannot be automated without a real deployed Vercel function. Unit tests cover the launch/cache layer logic; integration testing happens via `vercel dev` or deployed preview.

### Sampling Rate
- **Per task commit:** No automated test suite yet; manual smoke test via `npm run dev` + manual API call
- **Per wave merge:** Same — manual
- **Phase gate:** Full manual verification per SUCCESS CRITERIA before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/cache.test.ts` — covers SCRP-03 TTL hit/miss + partial results
- [ ] `tests/lib/scrapeMoxfield.test.ts` — covers SCRP-02 fetch() mock returning correct card list
- [ ] `tests/lib/browser.test.ts` — covers SCRP-01 launchBrowser() export shape
- [ ] Test framework install: `npm install --save-dev vitest @vitest/coverage-v8` (Vitest is standard for Next.js 15/16 projects)

---

## Sources

### Primary (HIGH confidence)
- Vercel community thread (chromium-min@133 + puppeteer-core@24.5.0, Next.js 15 `serverExternalPackages`) — confirmed working March 2025
- `npm view @sparticuz/chromium-min dist-tags` — verified latest is `143.0.4`
- `npm view puppeteer-core version` — verified latest is `24.39.1`
- Official sparticuz/chromium README (via raw.githubusercontent.com) — executablePath API, chromium.args, /tmp extraction behavior

### Secondary (MEDIUM confidence)
- [Vercel KB: Deploying Puppeteer with Next.js](https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel) — confirmed 250 MB bundle limit, serverExternalPackages requirement
- [Vercel Docs: Configuring Function Duration](https://vercel.com/docs/functions/configuring-functions/duration) — maxDuration limits by plan; Fluid Compute 300s
- [Next.js Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) — `export const maxDuration` in route.ts
- Kettanaito Gist: Chromium on Vercel — older but pattern-confirming example

### Tertiary (LOW confidence)
- WebSearch result citing `puppeteer-core@23.10.4` + `chromium-min@131.0.1` as working pair — older than the 133/24.5.0 pair; use as fallback reference only

---

## Metadata

**Confidence breakdown:**
- Standard stack (packages + versions): MEDIUM — 133/24.5.0 pair verified via community source; at install time must be re-verified against official compatibility table
- Architecture patterns (launch, cache, parameter passing): HIGH — derived directly from official README behavior + existing codebase patterns
- Moxfield fetch replacement: HIGH — existing code already calls the same JSON API; only the transport changes
- Pitfalls: HIGH — sourced from official docs (bundle size limit, timeout limits) and common community failure modes

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (chromium-min releases frequently; re-verify version pair before install)
