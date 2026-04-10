---
phase: 06-game-tracking-core
plan: 05
type: execute
wave: 1
depends_on:
  - 01
files_modified:
  - src/app/api/checkDeck/route.ts
  - src/app/api/scrapeLGS/route.ts
  - tests/scraper-rate-limit.test.ts
autonomous: true
requirements:
  - OPT-01
user_setup: []

must_haves:
  truths:
    - "POST /api/checkDeck applies `checkRateLimit(getIpKey(request), 10, 60000)` before parsing the body and returns 429 with Retry-After header when exceeded"
    - "POST /api/scrapeLGS applies `checkRateLimit(getIpKey(request), 10, 60000)` before any scraping and returns 429 with Retry-After header when exceeded"
    - "Existing checkDeck and scrapeLGS behavior is preserved — legitimate requests still succeed, response shapes unchanged"
    - "Rate limit thresholds match D-24: scraper routes 10/60s (tighter than game routes 30/60s)"
  artifacts:
    - path: "src/app/api/checkDeck/route.ts"
      provides: "Existing deck-check route, now rate-limited"
      contains: "checkRateLimit"
    - path: "src/app/api/scrapeLGS/route.ts"
      provides: "Existing LGS scraper route, now rate-limited"
      contains: "checkRateLimit"
    - path: "tests/scraper-rate-limit.test.ts"
      provides: "Integration tests verifying 429 behavior on both routes"
      min_lines: 60
  key_links:
    - from: "src/app/api/checkDeck/route.ts"
      to: "src/lib/rateLimit.ts"
      via: "import { checkRateLimit, getIpKey }"
      pattern: "from\\s+['\"]@/lib/rateLimit['\"]"
    - from: "src/app/api/scrapeLGS/route.ts"
      to: "src/lib/rateLimit.ts"
      via: "import { checkRateLimit, getIpKey }"
      pattern: "from\\s+['\"]@/lib/rateLimit['\"]"
---

<objective>
Apply the rate limit helper from Plan 06-01 to the two EXISTING scraper routes (`/api/checkDeck` and `/api/scrapeLGS`) at the tighter 10-per-60-second threshold per D-24. This is a surgical edit that adds rate limiting as the first guard inside each route handler, before any request parsing or business logic. No new routes are created; no existing response shape is changed.

Purpose: Completes OPT-01 for scraper routes — game routes are already rate-limited via Plans 06-03 and 06-04. This plan exists separately because it touches files OUTSIDE the new `/api/games` subtree and because the tighter 10/60s threshold is route-specific.

Output: Two modified scraper route files + a focused integration test that verifies both return 429 with the correct Retry-After header.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-game-tracking-core/06-CONTEXT.md
@.planning/phases/06-game-tracking-core/06-RESEARCH.md
@.planning/codebase/CONVENTIONS.md
@src/app/api/checkDeck/route.ts
@src/app/api/scrapeLGS/route.ts
@tests/auth-login.test.ts

<prior_plans>
- 06-01 created `src/lib/rateLimit.ts` with `checkRateLimit(key, limit, windowMs)` and `getIpKey(request)` — imported here
</prior_plans>

<interfaces>
<!-- Contract from 06-01 -->
```typescript
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number };
export function getIpKey(request: Request): string;
```

<!-- 429 response shape (same as games routes) -->
```typescript
return NextResponse.json(
  { error: 'Rate limit exceeded' },
  { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
);
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Apply rate limit to /api/checkDeck and /api/scrapeLGS with tests</name>
  <files>
    - src/app/api/checkDeck/route.ts
    - src/app/api/scrapeLGS/route.ts
    - tests/scraper-rate-limit.test.ts
  </files>
  <read_first>
    - src/app/api/checkDeck/route.ts (current implementation — preserve all existing logic)
    - src/app/api/scrapeLGS/route.ts (current implementation — preserve all existing logic)
    - src/lib/rateLimit.ts (created by 06-01 — confirms the exported signatures)
    - tests/auth-login.test.ts (jest mock pattern to mirror for mocking next/server and scraper dependencies)
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-22, D-23, D-24 (scraper routes 10/60s per IP)
  </read_first>
  <behavior>
    - checkDeck route, rate limit allowed → proceeds as before, returns existing success shape
    - checkDeck route, rate limit denied → returns 429 `{ error: 'Rate limit exceeded' }` + `Retry-After` header; does NOT call the downstream DB logic
    - scrapeLGS route, rate limit allowed → proceeds as before
    - scrapeLGS route, rate limit denied → returns 429 + Retry-After header; does NOT invoke the scraper
    - Both routes call `checkRateLimit(getIpKey(request), 10, 60000)` — tighter threshold than game routes per D-24
  </behavior>
  <action>
    **Step 1 — RED: Create `tests/scraper-rate-limit.test.ts`:**

    ```typescript
    /**
     * Integration tests verifying rate limit behavior for scraper routes.
     * Mocks prisma + scrapeAllSites + rateLimit + next/server.
     */

    const mockCheckRateLimit = jest.fn();
    const mockGetIpKey = jest.fn(() => 'test-ip');
    const mockFindMany = jest.fn();
    const mockScrapeAllSites = jest.fn();

    jest.mock('@/lib/rateLimit', () => ({
      checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
      getIpKey: (...args: unknown[]) => mockGetIpKey(...args),
    }));

    jest.mock('@/lib/prisma', () => ({
      prisma: {
        collectionCard: {
          findMany: (...args: unknown[]) => mockFindMany(...args),
        },
      },
    }));

    // If scrapeLGS route imports scrapeAllSites from a lib path, mock it:
    jest.mock('@/lib/scrapeLGS/scrapeAllSites', () => ({
      scrapeAllSites: (...args: unknown[]) => mockScrapeAllSites(...args),
    }), { virtual: true });

    jest.mock('next/server', () => ({
      NextResponse: {
        json: jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
          body,
          status: init?.status ?? 200,
          headers: init?.headers ?? {},
        })),
      },
    }));

    import { POST as checkDeckPost } from '../src/app/api/checkDeck/route';

    function makeRequest(body?: unknown): Request {
      return {
        headers: { get: (_name: string) => null },
        json: async () => body ?? {},
      } as unknown as Request;
    }

    describe('POST /api/checkDeck rate limiting', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('calls checkRateLimit with (ip, 10, 60000) before any DB work', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: true });
        mockFindMany.mockResolvedValue([]);
        await checkDeckPost(makeRequest({ decklist: '1 Lightning Bolt' }));
        expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 10, 60000);
      });

      it('returns 429 with Retry-After when rate limited and does NOT call prisma', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
        const res: any = await checkDeckPost(makeRequest({ decklist: '1 Lightning Bolt' }));
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ error: 'Rate limit exceeded' });
        expect(res.headers['Retry-After']).toBe('42');
        expect(mockFindMany).not.toHaveBeenCalled();
      });

      it('proceeds when allowed: parses body and queries prisma', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: true });
        mockFindMany.mockResolvedValue([]);
        const res: any = await checkDeckPost(makeRequest({ decklist: '1 Lightning Bolt' }));
        expect(res.status).toBe(200);
        expect(mockFindMany).toHaveBeenCalled();
      });
    });

    // scrapeLGS route test — dynamic require because the route imports server-only puppeteer deps
    // that may not load in jest-node. Use jest.isolateModules + try/catch to skip on import error.
    describe('POST /api/scrapeLGS rate limiting', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('returns 429 with Retry-After when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 15 });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { POST } = require('../src/app/api/scrapeLGS/route');
        const res: any = await POST(makeRequest({ cardName: 'Lightning Bolt' }));
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ error: 'Rate limit exceeded' });
        expect(res.headers['Retry-After']).toBe('15');
        expect(mockScrapeAllSites).not.toHaveBeenCalled();
      });

      it('calls checkRateLimit with (ip, 10, 60000)', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 1 });
        const { POST } = require('../src/app/api/scrapeLGS/route');
        await POST(makeRequest({ cardName: 'Lightning Bolt' }));
        expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 10, 60000);
      });
    });
    ```

    Run `npx jest tests/scraper-rate-limit.test.ts` — MUST fail (routes don't import rateLimit yet).

    **Step 2 — GREEN: Edit `src/app/api/checkDeck/route.ts`** — add rate limit as the FIRST line inside POST, before `request.json()`:

    The current file structure (preserve completely):
    ```typescript
    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/prisma';
    import { parseDeckList } from '@/lib/parseDeck';

    export async function POST(request: Request) {
      try {
        const { decklist } = await request.json();
        // ... existing logic ...
      } catch (error) { ... }
    }
    ```

    The edit:
    1. Add `import { checkRateLimit, getIpKey } from '@/lib/rateLimit';` to the import block (after the existing imports)
    2. Inside `POST`, insert the rate limit guard BEFORE the `try` block (so 429 responses bypass the try/catch and the inner prisma call):

    ```typescript
    export async function POST(request: Request) {
      const rl = checkRateLimit(getIpKey(request), 10, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const { decklist } = await request.json();
        // ... EXISTING LOGIC UNCHANGED ...
      } catch (error) {
        // ... EXISTING ERROR HANDLING UNCHANGED ...
      }
    }
    ```

    Do NOT modify any other line in the file. Preserve:
    - The `decklist` validation (`if (!decklist || typeof decklist !== 'string')`)
    - The `parseDeckList` call
    - The `prisma.collectionCard.findMany` query
    - The grouping logic
    - The error handler console.error message and shape

    **Step 3 — GREEN: Edit `src/app/api/scrapeLGS/route.ts`** — same pattern:
    1. Add `import { checkRateLimit, getIpKey } from '@/lib/rateLimit';` to the import block
    2. Insert the rate limit guard as the first statement of `POST`, BEFORE the `try` block:

    ```typescript
    export async function POST(request: Request) {
      const rl = checkRateLimit(getIpKey(request), 10, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        // ... EXISTING LOGIC UNCHANGED ...
      } catch (error) {
        // ... EXISTING ERROR HANDLING UNCHANGED ...
      }
    }
    ```

    Do NOT modify the scraper invocation, the product assembly, or the response shape. Preserve ALL existing imports and logic — this is an additive change.

    **Step 4 — Run tests:**

    Run `npx jest tests/scraper-rate-limit.test.ts` — MUST pass (5 tests).

    Run `npx jest` — full suite MUST remain green (no regressions in existing checkDeck/scrapeLGS behavior).

    **Do NOT:**
    - Do NOT change the threshold to 30/60s — scraper routes use the tighter 10/60s limit per D-24
    - Do NOT move the rate limit check inside the `try` block — 429 should bypass the generic 500 fallback
    - Do NOT add a cache-control header — rate limiting is additive, not a cache concern
    - Do NOT modify the existing request parsing, validation, or business logic — additive change only
    - Do NOT touch /api/cron or /api/auth routes — per D-22, they are explicitly excluded from rate limiting
  </action>
  <verify>
    <automated>npx jest tests/scraper-rate-limit.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/api/checkDeck/route.ts` contains literal string `import { checkRateLimit, getIpKey } from '@/lib/rateLimit'`
    - `src/app/api/checkDeck/route.ts` contains literal string `checkRateLimit(getIpKey(request), 10, 60000)` (or with `60_000`)
    - `src/app/api/checkDeck/route.ts` still contains `parseDeckList` and `prisma.collectionCard.findMany` (existing logic preserved)
    - `src/app/api/scrapeLGS/route.ts` contains literal string `import { checkRateLimit, getIpKey } from '@/lib/rateLimit'`
    - `src/app/api/scrapeLGS/route.ts` contains literal string `checkRateLimit(getIpKey(request), 10, 60000)`
    - Both routes contain `status: 429` and `'Retry-After'`
    - `tests/scraper-rate-limit.test.ts` exists with describe blocks for both routes
    - `npx jest tests/scraper-rate-limit.test.ts` exits 0
    - `npx jest` full suite exits 0 (no regressions)
    - Neither /api/cron nor /api/auth route files are modified (verify with git status)
  </acceptance_criteria>
  <done>
    Both scraper routes enforce 10/60s rate limiting; existing behavior preserved; full suite green.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public internet → /api/checkDeck, /api/scrapeLGS | Untrusted; tighter rate limit (10/60s) reflects higher resource cost (DB + scraper) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-04 | Denial of Service | checkDeck DB query abuse | mitigate | `checkRateLimit(ip, 10, 60000)` added as first statement in POST handler; 429 returned before prisma is touched. Verified by test "does NOT call prisma" |
| T-06-04b | Denial of Service | scrapeLGS Puppeteer resource exhaustion | mitigate | Same pattern — rate limit before scraper invocation. Puppeteer browser instance is more expensive than DB, making the tight 10/60s limit essential per D-24 |
| T-06-REG | Regression | Existing scrape/check behavior breaks after edit | mitigate | Rate limit added as additive pre-guard; no existing lines modified. Acceptance criteria grep for preserved literals (`parseDeckList`, `prisma.collectionCard.findMany`). Full jest suite must pass. |

</threat_model>

<verification>
- `npx jest tests/scraper-rate-limit.test.ts` passes with 5 tests
- `npx jest` full suite green
- Both scraper routes import and invoke `checkRateLimit`
- Existing response shapes unchanged
- /api/cron and /api/auth unchanged
</verification>

<success_criteria>
- Both scraper routes return 429 on limit+1 within 60s
- Legitimate requests still succeed (existing functionality preserved)
- Rate limit threshold is 10/60s (not 30/60s — that's for game routes)
</success_criteria>

<output>
After completion, create `.planning/phases/06-game-tracking-core/06-05-SUMMARY.md` documenting: which routes were modified, the exact patch added, and a note that OPT-01 is now fully covered (games routes via Plans 03/04, scraper routes via this plan).
</output>
