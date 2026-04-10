---
phase: 06-game-tracking-core
plan: 03
type: execute
wave: 1
depends_on:
  - 01
files_modified:
  - src/app/api/players/route.ts
  - src/app/api/decks/route.ts
  - tests/autocomplete-api.test.ts
autonomous: true
requirements:
  - GAME-04
  - GAME-05
  - OPT-01
user_setup: []

must_haves:
  truths:
    - "GET /api/players returns `{ players: string[] }` — union of `users.name` and DISTINCT `game_participants.playerName`, deduped case-sensitively, sorted alphabetically"
    - "GET /api/decks returns `{ decks: string[] }` — DISTINCT `game_participants.deckName` where not null, sorted alphabetically"
    - "Both routes apply rate limiting via `checkRateLimit(getIpKey(request), 30, 60000)` and return 429 with `Retry-After` header when exceeded"
    - "Both routes return 500 with `{ error: '...' }` on unexpected DB errors (try/catch pattern per CONVENTIONS.md)"
    - "Both routes use two separate prisma findMany calls merged via Set (Option B per RESEARCH.md — no $queryRaw)"
  artifacts:
    - path: "src/app/api/players/route.ts"
      provides: "GET /api/players autocomplete endpoint"
      exports: ["GET"]
    - path: "src/app/api/decks/route.ts"
      provides: "GET /api/decks autocomplete endpoint"
      exports: ["GET"]
    - path: "tests/autocomplete-api.test.ts"
      provides: "Integration tests for both autocomplete routes"
      min_lines: 80
  key_links:
    - from: "src/app/api/players/route.ts"
      to: "src/lib/rateLimit.ts"
      via: "import { checkRateLimit, getIpKey }"
      pattern: "from\\s+['\"]@/lib/rateLimit['\"]"
    - from: "src/app/api/players/route.ts"
      to: "src/lib/prisma.ts"
      via: "import { prisma }"
      pattern: "prisma\\.(gameParticipant|user)\\.findMany"
    - from: "src/app/api/decks/route.ts"
      to: "src/lib/prisma.ts"
      via: "prisma.gameParticipant.findMany with distinct+where not null"
      pattern: "prisma\\.gameParticipant\\.findMany"
---

<objective>
Implement the two autocomplete GET endpoints that seed the Combobox components in the game form: `/api/players` (union of Moxfield users + previously entered participant names) and `/api/decks` (distinct deck names from previous game entries). Both routes are rate-limited at 30/60s per IP.

Purpose: Satisfies GAME-04 (player seed source), GAME-05 (deck seed source), and partial OPT-01 (rate limiting applied to game-adjacent routes).

Output: Two new route files + an integration test that mocks Prisma and verifies the response shapes, sort order, dedup, and 429 behavior.
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
@src/lib/prisma.ts
@prisma/schema.prisma
@tests/auth-login.test.ts

<prior_plans>
- 06-01 created `src/lib/rateLimit.ts` with `checkRateLimit(key, limit, windowMs)` and `getIpKey(request)` — this plan imports those.
</prior_plans>

<interfaces>
<!-- Prisma model fields used (from prisma/schema.prisma) -->

From prisma/schema.prisma:
```
model User {
  id   String @id
  name String  // use this for player autocomplete seed
}

model GameParticipant {
  id         String  @id
  playerName String  // use this for player autocomplete seed
  deckName   String? // nullable — use for deck autocomplete (filter nulls)
}
```

From src/lib/rateLimit.ts (created by 06-01):
```typescript
export function checkRateLimit(key: string, limit: number, windowMs: number):
  { allowed: true } | { allowed: false; retryAfterSeconds: number };
export function getIpKey(request: Request): string;
```

<!-- Response shapes this plan produces (consumed by 06-06) -->

GET /api/players response:
```json
{ "players": ["Alice", "Bob", "Carol"] }
```

GET /api/decks response:
```json
{ "decks": ["Atraxa", "Edric", "Prosper"] }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create /api/players and /api/decks routes with integration tests</name>
  <files>
    - src/app/api/players/route.ts
    - src/app/api/decks/route.ts
    - tests/autocomplete-api.test.ts
  </files>
  <read_first>
    - src/app/api/checkDeck/route.ts (canonical route pattern: try/catch, NextResponse.json)
    - src/lib/prisma.ts (singleton import path `@/lib/prisma`)
    - prisma/schema.prisma (confirm User.name and GameParticipant.playerName / deckName field names and nullability)
    - tests/auth-login.test.ts (jest mock pattern for next/server + route handler isolation)
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md "Pattern 2: UNION Query for /api/players" (Option B recommended — two findMany merged via Set)
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-10, D-17, D-22, D-24, D-26
  </read_first>
  <behavior>
    - GET /api/players when users=[{name:'Bob'},{name:'Carol'}] and participants=[{playerName:'Alice'},{playerName:'Bob'}] → returns `{ players: ['Alice', 'Bob', 'Carol'] }` (sorted, deduped)
    - GET /api/players when no data → returns `{ players: [] }`
    - GET /api/decks when participants=[{deckName:'Edric'},{deckName:'Atraxa'},{deckName:null},{deckName:'Edric'}] → returns `{ decks: ['Atraxa', 'Edric'] }` (sorted, null filtered, deduped)
    - GET /api/decks when no games → returns `{ decks: [] }`
    - Both routes: when `checkRateLimit` returns `{ allowed: false, retryAfterSeconds: 42 }` → returns status 429, JSON body `{ error: 'Rate limit exceeded' }`, header `Retry-After: 42`
    - Both routes: when prisma throws → returns status 500, JSON body `{ error: 'Failed to ...' }`
  </behavior>
  <action>
    **Step 1 — RED: Create `tests/autocomplete-api.test.ts`** using the mock pattern from `tests/auth-login.test.ts`.

    ```typescript
    /**
     * Integration tests for /api/players and /api/decks route handlers
     * Mocks prisma, rateLimit, and next/server
     */

    const mockUserFindMany = jest.fn();
    const mockParticipantFindMany = jest.fn();
    const mockCheckRateLimit = jest.fn();
    const mockGetIpKey = jest.fn(() => 'test-ip');

    jest.mock('@/lib/prisma', () => ({
      prisma: {
        user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
        gameParticipant: { findMany: (...args: unknown[]) => mockParticipantFindMany(...args) },
      },
    }));

    jest.mock('@/lib/rateLimit', () => ({
      checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
      getIpKey: (...args: unknown[]) => mockGetIpKey(...args),
    }));

    jest.mock('next/server', () => ({
      NextResponse: {
        json: jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
          body,
          status: init?.status ?? 200,
          headers: init?.headers ?? {},
        })),
      },
    }));

    import { GET as getPlayers } from '../src/app/api/players/route';
    import { GET as getDecks } from '../src/app/api/decks/route';

    function makeRequest(): Request {
      return {
        headers: { get: (_name: string) => null },
      } as unknown as Request;
    }

    describe('GET /api/players', () => {
      beforeEach(() => {
        mockUserFindMany.mockReset();
        mockParticipantFindMany.mockReset();
        mockCheckRateLimit.mockReset();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
      });

      it('returns union of users.name and participants.playerName sorted and deduped', async () => {
        mockUserFindMany.mockResolvedValue([{ name: 'Bob' }, { name: 'Carol' }]);
        mockParticipantFindMany.mockResolvedValue([{ playerName: 'Alice' }, { playerName: 'Bob' }]);
        const res: any = await getPlayers(makeRequest());
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ players: ['Alice', 'Bob', 'Carol'] });
      });

      it('returns empty array when there is no data', async () => {
        mockUserFindMany.mockResolvedValue([]);
        mockParticipantFindMany.mockResolvedValue([]);
        const res: any = await getPlayers(makeRequest());
        expect(res.body).toEqual({ players: [] });
      });

      it('returns 429 with Retry-After header when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
        const res: any = await getPlayers(makeRequest());
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ error: 'Rate limit exceeded' });
        expect(res.headers['Retry-After']).toBe('42');
      });

      it('calls checkRateLimit with (ip, 30, 60000)', async () => {
        mockUserFindMany.mockResolvedValue([]);
        mockParticipantFindMany.mockResolvedValue([]);
        await getPlayers(makeRequest());
        expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 30, 60000);
      });

      it('returns 500 on DB error', async () => {
        mockUserFindMany.mockRejectedValue(new Error('db down'));
        mockParticipantFindMany.mockResolvedValue([]);
        const res: any = await getPlayers(makeRequest());
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to fetch players' });
      });
    });

    describe('GET /api/decks', () => {
      beforeEach(() => {
        mockParticipantFindMany.mockReset();
        mockCheckRateLimit.mockReset();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
      });

      it('returns distinct non-null deckNames sorted', async () => {
        mockParticipantFindMany.mockResolvedValue([
          { deckName: 'Edric' },
          { deckName: 'Atraxa' },
          { deckName: 'Edric' },
        ]);
        const res: any = await getDecks(makeRequest());
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ decks: ['Atraxa', 'Edric'] });
      });

      it('filters null deckNames out', async () => {
        mockParticipantFindMany.mockResolvedValue([{ deckName: null }, { deckName: 'Edric' }]);
        const res: any = await getDecks(makeRequest());
        expect(res.body).toEqual({ decks: ['Edric'] });
      });

      it('returns empty array when no games', async () => {
        mockParticipantFindMany.mockResolvedValue([]);
        const res: any = await getDecks(makeRequest());
        expect(res.body).toEqual({ decks: [] });
      });

      it('returns 429 when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 10 });
        const res: any = await getDecks(makeRequest());
        expect(res.status).toBe(429);
        expect(res.headers['Retry-After']).toBe('10');
      });

      it('calls checkRateLimit with (ip, 30, 60000)', async () => {
        mockParticipantFindMany.mockResolvedValue([]);
        await getDecks(makeRequest());
        expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 30, 60000);
      });

      it('returns 500 on DB error', async () => {
        mockParticipantFindMany.mockRejectedValue(new Error('db down'));
        const res: any = await getDecks(makeRequest());
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to fetch decks' });
      });
    });
    ```

    Run `npx jest tests/autocomplete-api.test.ts` — MUST fail (routes don't exist yet).

    **Step 2 — GREEN: Create `src/app/api/players/route.ts`:**

    ```typescript
    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/prisma';
    import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

    export async function GET(request: Request) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const [participants, users] = await Promise.all([
          prisma.gameParticipant.findMany({
            select: { playerName: true },
            distinct: ['playerName'],
          }),
          prisma.user.findMany({
            select: { name: true },
            distinct: ['name'],
          }),
        ]);
        const players = Array.from(
          new Set([
            ...participants.map((p) => p.playerName),
            ...users.map((u) => u.name),
          ])
        ).sort((a, b) => a.localeCompare(b));
        return NextResponse.json({ players });
      } catch (error) {
        console.error('GET /api/players error:', error);
        return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
      }
    }
    ```

    **Step 3 — GREEN: Create `src/app/api/decks/route.ts`:**

    ```typescript
    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/prisma';
    import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

    export async function GET(request: Request) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const rows = await prisma.gameParticipant.findMany({
          select: { deckName: true },
          distinct: ['deckName'],
          where: { deckName: { not: null } },
        });
        const decks = Array.from(
          new Set(
            rows
              .map((r) => r.deckName)
              .filter((d): d is string => d !== null)
          )
        ).sort((a, b) => a.localeCompare(b));
        return NextResponse.json({ decks });
      } catch (error) {
        console.error('GET /api/decks error:', error);
        return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
      }
    }
    ```

    Run `npx jest tests/autocomplete-api.test.ts` — MUST pass (all 12 tests green).

    Run `npx jest` — full suite MUST remain green.

    **Do NOT:**
    - Do NOT use `prisma.$queryRaw` for the UNION — RESEARCH.md Option B (two findMany calls) is the recommendation
    - Do NOT add pagination, search params, or debounce — D-09 says seed-once client-side filter
    - Do NOT add manual sanitization/trim in the route — gameSchema is upstream; these routes only READ
    - Do NOT write `POST /api/players` or `POST /api/decks` — new names are created implicitly via the game POST route in Plan 06-04
    - Do NOT create an explicit "add player" endpoint — the form's POST /api/games already persists new names
  </action>
  <verify>
    <automated>npx jest tests/autocomplete-api.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/players/route.ts` exists and exports `GET`
    - File `src/app/api/decks/route.ts` exists and exports `GET`
    - Both files contain literal string `import { checkRateLimit, getIpKey } from '@/lib/rateLimit'`
    - Both files contain literal string `checkRateLimit(getIpKey(request), 30, 60000)` (or semantically equivalent with `60_000`)
    - Both files contain literal string `status: 429` and `'Retry-After'`
    - Players route contains `prisma.user.findMany` AND `prisma.gameParticipant.findMany` (two calls, not $queryRaw)
    - Players route does NOT contain `$queryRaw` or `prisma.$queryRaw`
    - Decks route contains `distinct: ['deckName']` and `where: { deckName: { not: null } }`
    - File `tests/autocomplete-api.test.ts` exists with at least 12 `it(` blocks
    - `npx jest tests/autocomplete-api.test.ts` exits 0
    - `npx jest` full suite exits 0
    - `grep -r "POST" src/app/api/players/route.ts src/app/api/decks/route.ts` returns nothing (GET-only)
  </acceptance_criteria>
  <done>
    Both autocomplete routes implemented, rate-limited, and fully tested; full jest suite green.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public internet → /api/players, /api/decks | Untrusted request source; middleware auth + rate limit apply |
| Prisma ORM → Turso | Parameterized queries only — no raw SQL in this plan |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-01 | Spoofing | Unauthenticated access | mitigate (inherited) | Existing `proxy.ts` HMAC cookie middleware covers `/api/players` and `/api/decks` via the blocklist matcher — no new auth code required per RESEARCH.md Pattern 7 |
| T-06-02 | Tampering / SQL Injection | playerName/deckName queries | mitigate | Uses `prisma.findMany` with typed `distinct` + `where` options; no raw SQL, no string concat. Verified by acceptance criterion `grep -v $queryRaw` |
| T-06-04 | Denial of Service | High-volume GET abuse | mitigate | `checkRateLimit(getIpKey(request), 30, 60000)` at handler top, before DB work (D-24). Verified by test `calls checkRateLimit with (ip, 30, 60000)` |
| T-06-05 | Info Disclosure | Response body leaks beyond intended fields | mitigate | Response shape explicitly `{ players: string[] }` / `{ decks: string[] }` — no user IDs, no timestamps, no metadata. `select` clauses list only the needed field |

</threat_model>

<verification>
- `npx jest tests/autocomplete-api.test.ts` passes
- `npx jest` full suite green
- Both routes apply rate limiting identically to game routes (30/60s)
- No raw SQL, no new dependencies
</verification>

<success_criteria>
- `GET /api/players` returns merged deduped sorted string[]
- `GET /api/decks` returns distinct non-null deckName string[] sorted
- Both return 429 with `Retry-After` header when rate limited
- Both return 500 with error message on DB failure
</success_criteria>

<output>
After completion, create `.planning/phases/06-game-tracking-core/06-03-SUMMARY.md` documenting the response shapes, test count, and the contract consumed by Plan 06-06 (game form).
</output>
