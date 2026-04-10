---
phase: 06-game-tracking-core
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - src/lib/rateLimit.ts
  - tests/rate-limit.test.ts
autonomous: true
requirements:
  - OPT-01
user_setup: []

must_haves:
  truths:
    - "Running `npm test` invokes jest and exits 0 with the 27 existing tests + new rate-limit tests passing"
    - "checkRateLimit(key, limit, windowMs) returns { allowed: true } until limit is reached within the window, then { allowed: false, retryAfterSeconds }"
    - "checkRateLimit resets after windowMs elapses (sliding window prunes expired timestamps)"
    - "getIpKey(request) extracts first entry of x-forwarded-for or falls back to 'unknown'"
  artifacts:
    - path: "package.json"
      provides: "npm test script"
      contains: '"test": "jest"'
    - path: "src/lib/rateLimit.ts"
      provides: "Sliding-window rate limiter + IP key extractor"
      exports: ["checkRateLimit", "getIpKey"]
      min_lines: 30
    - path: "tests/rate-limit.test.ts"
      provides: "Unit tests for checkRateLimit and getIpKey"
      min_lines: 40
  key_links:
    - from: "src/lib/rateLimit.ts"
      to: "module-level buckets Map<string, number[]>"
      via: "const buckets = new Map<string, number[]>()"
      pattern: "const\\s+buckets\\s*=\\s*new\\s+Map"
---

<objective>
Establish the Wave 0 foundation for Phase 6: the missing `npm test` script, the rate limit helper (`src/lib/rateLimit.ts`), and its unit tests. Every downstream plan in this phase (06-03, 06-04, 06-05) imports `checkRateLimit` and `getIpKey` from this file, so it MUST land first.

Purpose: Unblocks rate limiting for OPT-01 across scraper + game routes. Fixes the `package.json` gap identified in RESEARCH.md (npm test currently errors). Provides the unit-test harness pattern used by all subsequent Phase 6 tests.

Output: A working `checkRateLimit` helper, a `getIpKey` helper, a passing `tests/rate-limit.test.ts`, and `package.json` with `"test": "jest"`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-game-tracking-core/06-CONTEXT.md
@.planning/phases/06-game-tracking-core/06-RESEARCH.md
@src/lib/prisma.ts
@tests/auth-login.test.ts
@jest.config.js
@jest.setup.ts
@package.json

<interfaces>
<!-- Contract for downstream plans (06-03, 06-04, 06-05) -->

From src/lib/rateLimit.ts (to be created):
```typescript
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function getIpKey(request: Request): string;
```

Singleton pattern mirrors src/lib/prisma.ts — module-level `const buckets = new Map<string, number[]>()`.

Usage example (from RESEARCH.md Pattern 4):
```typescript
const rl = checkRateLimit(getIpKey(request), 30, 60_000);
if (!rl.allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
  );
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add npm test script to package.json</name>
  <files>package.json</files>
  <read_first>
    - package.json (current scripts block)
    - jest.config.js (confirms jest is already configured)
  </read_first>
  <action>
    Edit `package.json`. In the `"scripts"` object, add a new entry `"test": "jest"` after the existing `"lint"` entry. The final scripts block MUST be:

    ```json
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "lint": "eslint",
      "test": "jest"
    }
    ```

    Do NOT modify any other fields (name, dependencies, devDependencies, overrides). Do NOT run `npm install`. Do NOT add `"test:watch"` or any other test script — only the single `"test": "jest"` line per D-27 minimalism and RESEARCH.md Open Question #2.
  </action>
  <verify>
    <automated>npm test -- --passWithNoTests 2>&1 | grep -qE "Tests:|No tests found"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` contains the exact string `"test": "jest"` inside the scripts object
    - `package.json` still contains `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"lint": "eslint"` (no existing scripts removed)
    - `npm test` exits 0 (runs jest successfully; the 27 existing tests still pass)
    - No new dependencies added to `dependencies` or `devDependencies`
  </acceptance_criteria>
  <done>
    `npm test` runs jest via the new script and the existing 27-test suite remains green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create rate limit helper and unit tests</name>
  <files>
    - src/lib/rateLimit.ts
    - tests/rate-limit.test.ts
  </files>
  <read_first>
    - src/lib/prisma.ts (singleton pattern to mirror — module-level const + conditional assignment)
    - tests/auth-login.test.ts (jest mock + Request-stub pattern to mirror for the getIpKey test)
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md "Pattern 4: Rate Limit Helper" (reference implementation)
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-23 through D-28 (rate limit decisions)
  </read_first>
  <behavior>
    - Test 1: `checkRateLimit('ip-a', 3, 60000)` called 3 times in quick succession → all return `{ allowed: true }`
    - Test 2: 4th call to same key within the window → returns `{ allowed: false, retryAfterSeconds: <number > 0 && <= 60> }`
    - Test 3: Different keys are tracked independently (`'ip-a'` limited, `'ip-b'` still allowed)
    - Test 4: After the window elapses (use `jest.useFakeTimers()` + `jest.advanceTimersByTime(60001)`), the same key is allowed again
    - Test 5: `getIpKey` with header `'1.2.3.4, 5.6.7.8'` → returns `'1.2.3.4'`
    - Test 6: `getIpKey` with header `'  1.2.3.4  '` (leading/trailing whitespace) → returns `'1.2.3.4'`
    - Test 7: `getIpKey` with missing `x-forwarded-for` header → returns `'unknown'`
  </behavior>
  <action>
    **Step 1 — Write `tests/rate-limit.test.ts` FIRST (RED):**

    Create `tests/rate-limit.test.ts` with the following structure. Use `jest.isolateModules` or `jest.resetModules` in `beforeEach` to get a fresh `buckets` Map per test (the module-level singleton persists across tests otherwise).

    ```typescript
    describe('checkRateLimit', () => {
      let checkRateLimit: typeof import('../src/lib/rateLimit').checkRateLimit;
      let getIpKey: typeof import('../src/lib/rateLimit').getIpKey;

      beforeEach(() => {
        jest.resetModules();
        const mod = require('../src/lib/rateLimit');
        checkRateLimit = mod.checkRateLimit;
        getIpKey = mod.getIpKey;
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('allows calls up to the limit', () => {
        expect(checkRateLimit('ip-a', 3, 60000)).toEqual({ allowed: true });
        expect(checkRateLimit('ip-a', 3, 60000)).toEqual({ allowed: true });
        expect(checkRateLimit('ip-a', 3, 60000)).toEqual({ allowed: true });
      });

      it('denies the call that exceeds the limit with retryAfterSeconds', () => {
        checkRateLimit('ip-a', 2, 60000);
        checkRateLimit('ip-a', 2, 60000);
        const result = checkRateLimit('ip-a', 2, 60000);
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
          expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
        }
      });

      it('tracks different keys independently', () => {
        checkRateLimit('ip-a', 1, 60000);
        expect(checkRateLimit('ip-a', 1, 60000).allowed).toBe(false);
        expect(checkRateLimit('ip-b', 1, 60000).allowed).toBe(true);
      });

      it('resets after the window elapses', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-10T12:00:00Z'));
        checkRateLimit('ip-a', 1, 60000);
        expect(checkRateLimit('ip-a', 1, 60000).allowed).toBe(false);
        jest.advanceTimersByTime(60001);
        expect(checkRateLimit('ip-a', 1, 60000).allowed).toBe(true);
      });
    });

    describe('getIpKey', () => {
      let getIpKey: typeof import('../src/lib/rateLimit').getIpKey;
      beforeEach(() => {
        jest.resetModules();
        getIpKey = require('../src/lib/rateLimit').getIpKey;
      });

      function makeRequest(headers: Record<string, string>): Request {
        return {
          headers: {
            get: (name: string) => headers[name.toLowerCase()] ?? null,
          },
        } as unknown as Request;
      }

      it('returns first entry from x-forwarded-for', () => {
        expect(getIpKey(makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
      });

      it('trims whitespace', () => {
        expect(getIpKey(makeRequest({ 'x-forwarded-for': '  1.2.3.4  ' }))).toBe('1.2.3.4');
      });

      it('falls back to unknown when header missing', () => {
        expect(getIpKey(makeRequest({}))).toBe('unknown');
      });
    });
    ```

    Run `npx jest tests/rate-limit.test.ts` — it MUST fail (module does not exist yet).

    **Step 2 — Implement `src/lib/rateLimit.ts` (GREEN):**

    Create `src/lib/rateLimit.ts` with exactly this code:

    ```typescript
    // Sliding-window rate limiter (D-25, D-27)
    // In-memory Map per Vercel instance (D-28 — per-instance memory accepted for private app)
    // Mirrors the module-level singleton pattern from src/lib/prisma.ts.

    const buckets = new Map<string, number[]>();

    export function checkRateLimit(
      key: string,
      limit: number,
      windowMs: number
    ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
      const now = Date.now();
      const windowStart = now - windowMs;
      const timestamps = buckets.get(key) ?? [];
      // Prune entries older than the window (D-25 sliding window)
      const recent = timestamps.filter((t) => t > windowStart);

      if (recent.length >= limit) {
        const oldestInWindow = recent[0];
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldestInWindow + windowMs - now) / 1000)
        );
        buckets.set(key, recent);
        return { allowed: false, retryAfterSeconds };
      }

      recent.push(now);
      buckets.set(key, recent);
      return { allowed: true };
    }

    export function getIpKey(request: Request): string {
      const forwarded = request.headers.get('x-forwarded-for');
      return forwarded?.split(',')[0]?.trim() ?? 'unknown';
    }
    ```

    Run `npx jest tests/rate-limit.test.ts` — it MUST pass (all 7 tests green).

    **Step 3 — Sanity run full suite:**

    Run `npx jest` — 27 existing + 7 new = 34 tests should pass.

    Do NOT add any cleanup/GC logic to the buckets Map — per RESEARCH.md Pitfall 5, the filter call naturally shrinks arrays and the ~10-user private app does not need active cleanup.

    Do NOT add cookie-based keying — per D-23, IP-only keying is required.

    Do NOT use `NextRequest` — use the standard `Request` type so the helper works in any route handler signature (matches existing pattern in `src/app/api/checkDeck/route.ts`).
  </action>
  <verify>
    <automated>npx jest tests/rate-limit.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/rateLimit.ts` exists
    - Contains literal string `const buckets = new Map<string, number[]>()`
    - Contains literal string `export function checkRateLimit(`
    - Contains literal string `export function getIpKey(`
    - Contains literal string `'x-forwarded-for'`
    - Contains literal string `?? 'unknown'`
    - File `tests/rate-limit.test.ts` exists with at least 7 `it(` blocks
    - `npx jest tests/rate-limit.test.ts` exits 0 with 7 passing tests
    - `npx jest` full suite exits 0 (no regressions in 27 existing tests)
    - No new dependencies added to `package.json`
  </acceptance_criteria>
  <done>
    `checkRateLimit` and `getIpKey` are exported from `src/lib/rateLimit.ts`, all unit tests pass, full test suite is green.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public internet → /api/* | Untrusted request source; rate limit applied at handler entry |
| Vercel proxy → Node.js handler | `x-forwarded-for` is injected by Vercel; treated as trusted for IP extraction |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-04 | Denial of Service | checkRateLimit helper | mitigate | Sliding-window limiter with per-IP buckets; downstream routes (06-03/04/05) enforce the limit via `checkRateLimit(getIpKey(request), limit, windowMs)` at handler top |
| T-06-08 | Spoofing | x-forwarded-for parsing | accept | Vercel sets the header; `?? 'unknown'` fallback means a spoofed empty header just joins the shared 'unknown' bucket. Private ~10-user app per D-28 |
| T-06-DoS-Map | Denial of Service | In-memory buckets Map growth | accept | Per RESEARCH.md Pitfall 5, timestamp arrays prune on every call; Map keys stay but hold `[]` — negligible memory for private app. PROJECT.md rejected Upstash Redis as overkill |

</threat_model>

<verification>
- `npm test` runs jest (previously errored with "missing script: test")
- `npx jest tests/rate-limit.test.ts` exits 0 with 7 passing tests
- `npx jest` full suite exits 0 (27 existing + 7 new = 34 tests)
- No new `dependencies` or `devDependencies` in package.json
- `src/lib/rateLimit.ts` exports both `checkRateLimit` and `getIpKey`
</verification>

<success_criteria>
- `src/lib/rateLimit.ts` exists and compiles (`tsc --noEmit` succeeds)
- `checkRateLimit` unit tests cover: allow up to limit, deny on limit+1, independent keys, window reset
- `getIpKey` unit tests cover: multi-entry header, whitespace, missing header
- `package.json` has `"test": "jest"` in scripts
</success_criteria>

<output>
After completion, create `.planning/phases/06-game-tracking-core/06-01-SUMMARY.md` documenting: what was created, exact function signatures, the exported contract for downstream plans.
</output>
