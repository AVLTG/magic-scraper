---
phase: 06-game-tracking-core
plan: 04
type: execute
wave: 1
depends_on:
  - 01
files_modified:
  - src/app/api/games/route.ts
  - src/app/api/games/[id]/route.ts
  - tests/games-api.test.ts
autonomous: true
requirements:
  - GAME-01
  - GAME-02
  - GAME-03
  - GAME-06
  - GAME-07
  - GAME-08
  - GAME-09
  - OPT-01
user_setup: []

must_haves:
  truths:
    - "POST /api/games validates body with gameSchema.parse(), inserts Game + GameParticipant rows atomically in a single $transaction (D-16), returns 201 with `{ game }`"
    - "GET /api/games returns `{ games: (Game & { participants: GameParticipant[] })[] }` ordered by `date desc`, no pagination (D-12)"
    - "GET /api/games/[id] returns the single game with participants, 404 if not found; uses `await params` per Next.js 16 async params contract"
    - "PATCH /api/games/[id] is a full replace: deleteMany participants + update game fields + createMany participants inside a single $transaction (D-16)"
    - "DELETE /api/games/[id] calls `prisma.game.delete({ where: { id } })`; GameParticipant rows cascade automatically (no explicit participant delete)"
    - "All 5 methods apply `checkRateLimit(getIpKey(request), 30, 60000)` before DB work and return 429 with Retry-After when exceeded"
    - "Invalid request bodies return 400 with ZodError details"
    - "DB errors return 500 with `{ error: 'Failed to ...' }`"
  artifacts:
    - path: "src/app/api/games/route.ts"
      provides: "POST (create game) + GET (list games)"
      exports: ["POST", "GET"]
    - path: "src/app/api/games/[id]/route.ts"
      provides: "GET (one) + PATCH (replace) + DELETE"
      exports: ["GET", "PATCH", "DELETE"]
    - path: "tests/games-api.test.ts"
      provides: "Integration tests for all 5 endpoints incl. rate limit + zod errors"
      min_lines: 200
  key_links:
    - from: "src/app/api/games/route.ts"
      to: "src/lib/validators.ts"
      via: "import { gameSchema } (GAME-09 sanitization — D-29)"
      pattern: "gameSchema\\.parse"
    - from: "src/app/api/games/route.ts"
      to: "src/lib/rateLimit.ts"
      via: "import { checkRateLimit, getIpKey }"
      pattern: "checkRateLimit\\(getIpKey"
    - from: "src/app/api/games/route.ts"
      to: "prisma.$transaction"
      via: "atomic Game + GameParticipant insert (D-16)"
      pattern: "prisma\\.\\$transaction"
    - from: "src/app/api/games/[id]/route.ts"
      to: "await params"
      via: "Next.js 16 async params (RESEARCH.md Pattern 3)"
      pattern: "await\\s+params"
---

<objective>
Implement all five CRUD endpoints for `/api/games` — POST/GET on the collection and GET/PATCH/DELETE on `[id]` — plus their integration tests. These routes are the complete data layer for the game tracking feature; Plans 06-06 (pages) depend entirely on them. Validation is delegated to `gameSchema.parse()` from Phase 5 (D-29), and rate limiting comes from `checkRateLimit` created in 06-01.

Purpose: Satisfies GAME-01 (create game), GAME-02/03 (autocomplete via gameSchema — validators already trim+length-cap), GAME-06 (multi-screwed multi-select handled by independent boolean flags), GAME-07 (list with participants, newest-first), GAME-08 (edit + delete), GAME-09 (all sanitization via zod at route boundary), and OPT-01 (rate limiting on game routes).

Output: Two route files + comprehensive integration tests with mocked Prisma.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-game-tracking-core/06-CONTEXT.md
@.planning/phases/06-game-tracking-core/06-RESEARCH.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/SCHEMA.md
@src/lib/validators.ts
@src/lib/prisma.ts
@src/app/api/checkDeck/route.ts
@prisma/schema.prisma
@tests/auth-login.test.ts

<prior_plans>
- 06-01 created `src/lib/rateLimit.ts` with `checkRateLimit` and `getIpKey` — imported by all 5 endpoints
- Phase 5 landed `src/lib/validators.ts` with `gameSchema` — imported by POST and PATCH for body validation (no duplicate logic per D-29)
- Phase 5 landed `prisma/schema.prisma` Game + GameParticipant models with `onDelete: Cascade` on participants — DELETE does not need a participant cleanup step
</prior_plans>

<interfaces>
<!-- Request/response contracts consumed by 06-06 -->

From src/lib/validators.ts (already exists):
```typescript
import { z } from 'zod';
export const gameSchema: z.ZodObject<{
  date: z.ZodDate;                   // z.coerce.date() — accepts ISO string
  wonByCombo: z.ZodDefault<z.ZodBoolean>;
  notes: z.ZodOptional<z.ZodString>; // trimmed, max 1000, '' → undefined
  participants: z.ZodArray<...>;     // 1-4 items
}>;
export type GameInput = z.infer<typeof gameSchema>;
// Each participant: { playerName (1-100), isWinner, isScrewed, deckName? (max 100) }
```

From prisma schema:
```
Game:            { id (cuid), date (DateTime), wonByCombo (bool), notes (String?), createdAt (DateTime) }
GameParticipant: { id (cuid), gameId (String FK cascade), playerName (String), isWinner (bool), isScrewed (bool), deckName (String?) }
```

<!-- Endpoint contracts -->

POST /api/games
  Request: gameSchema body
  201: { game: Game }   (the newly-created Game, no participants in the return)
  400: { error: ZodError['errors'] }
  429: { error: 'Rate limit exceeded' } + Retry-After header
  500: { error: 'Failed to create game' }

GET /api/games
  200: { games: (Game & { participants: GameParticipant[] })[] }  // order by date desc
  429 / 500 same shape

GET /api/games/[id]
  200: { game: Game & { participants: GameParticipant[] } }
  404: { error: 'Not found' }
  429 / 500 same shape

PATCH /api/games/[id]
  Request: gameSchema body (full replace)
  200: { game: Game }
  400 / 404 / 429 / 500 same shape

DELETE /api/games/[id]
  200: { ok: true }
  404: { error: 'Not found' }
  429 / 500 same shape
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create /api/games/route.ts (POST + GET) with tests</name>
  <files>
    - src/app/api/games/route.ts
    - tests/games-api.test.ts
  </files>
  <read_first>
    - src/lib/validators.ts (exact `gameSchema` shape — import, do NOT reimplement)
    - src/app/api/checkDeck/route.ts (canonical route pattern: try/catch, NextResponse.json shape)
    - src/lib/prisma.ts (import path `@/lib/prisma`)
    - prisma/schema.prisma (Game + GameParticipant model field names and types)
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md "Pattern 1: Prisma $transaction for POST /api/games" and "Full POST /api/games Route Handler" (reference)
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-16, D-18, D-22, D-24, D-26, D-29
    - tests/auth-login.test.ts (jest mocking pattern to mirror)
  </read_first>
  <behavior>
    - POST with valid 2-player body → 201 + `{ game: { id, date, wonByCombo, notes } }`; creates Game + 2 GameParticipant rows via `prisma.$transaction(async (tx) => { ... })`
    - POST with body missing `participants` → 400 with ZodError in body
    - POST with body with 5 participants → 400 (zod max(4) violation)
    - POST with participant `playerName: ''` → 400 (zod min(1) violation after trim)
    - POST rate-limited → 429 + Retry-After header, prisma NEVER called
    - POST with prisma $transaction throwing → 500 `{ error: 'Failed to create game' }`
    - GET with games present → 200 `{ games: [...] }` with `orderBy: { date: 'desc' }` and `include: { participants: true }`
    - GET rate-limited → 429 + Retry-After header, prisma NEVER called
    - GET with prisma throwing → 500 `{ error: 'Failed to fetch games' }`
    - Both use `checkRateLimit(getIpKey(request), 30, 60000)`
  </behavior>
  <action>
    **Step 1 — RED: Create `tests/games-api.test.ts`** (first version, covering POST + GET only; [id] tests added in Task 2). Use the mock pattern from `tests/auth-login.test.ts`.

    ```typescript
    /**
     * Integration tests for /api/games route handlers
     * Mocks prisma, rateLimit, and next/server; imports route handlers directly.
     */

    const mockGameCreate = jest.fn();
    const mockGameFindMany = jest.fn();
    const mockGameFindUnique = jest.fn();
    const mockGameUpdate = jest.fn();
    const mockGameDelete = jest.fn();
    const mockParticipantCreateMany = jest.fn();
    const mockParticipantDeleteMany = jest.fn();
    const mockTransaction = jest.fn();
    const mockCheckRateLimit = jest.fn();
    const mockGetIpKey = jest.fn(() => 'test-ip');

    jest.mock('@/lib/prisma', () => ({
      prisma: {
        game: {
          create: (...args: unknown[]) => mockGameCreate(...args),
          findMany: (...args: unknown[]) => mockGameFindMany(...args),
          findUnique: (...args: unknown[]) => mockGameFindUnique(...args),
          update: (...args: unknown[]) => mockGameUpdate(...args),
          delete: (...args: unknown[]) => mockGameDelete(...args),
        },
        gameParticipant: {
          createMany: (...args: unknown[]) => mockParticipantCreateMany(...args),
          deleteMany: (...args: unknown[]) => mockParticipantDeleteMany(...args),
        },
        $transaction: (...args: unknown[]) => mockTransaction(...args),
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

    import { POST, GET as getGames } from '../src/app/api/games/route';

    function makeRequest(body?: unknown): Request {
      return {
        headers: { get: (_name: string) => null },
        json: async () => body,
      } as unknown as Request;
    }

    const validGameBody = {
      date: '2026-04-10T00:00:00.000Z',
      wonByCombo: false,
      notes: 'Close game',
      participants: [
        { playerName: 'Alice', isWinner: true, isScrewed: false, deckName: 'Atraxa' },
        { playerName: 'Bob', isWinner: false, isScrewed: true, deckName: 'Edric' },
      ],
    };

    describe('POST /api/games', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
        mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
          const tx = {
            game: {
              create: mockGameCreate,
              update: mockGameUpdate,
            },
            gameParticipant: {
              createMany: mockParticipantCreateMany,
              deleteMany: mockParticipantDeleteMany,
            },
          };
          return fn(tx);
        });
      });

      it('creates game with participants atomically and returns 201', async () => {
        mockGameCreate.mockResolvedValue({
          id: 'g1',
          date: new Date('2026-04-10T00:00:00.000Z'),
          wonByCombo: false,
          notes: 'Close game',
          createdAt: new Date(),
        });
        mockParticipantCreateMany.mockResolvedValue({ count: 2 });

        const res: any = await POST(makeRequest(validGameBody));

        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockGameCreate).toHaveBeenCalled();
        expect(mockParticipantCreateMany).toHaveBeenCalled();
        const createManyArg = mockParticipantCreateMany.mock.calls[0][0];
        expect(createManyArg.data).toHaveLength(2);
        expect(createManyArg.data[0]).toMatchObject({ playerName: 'Alice', isWinner: true });
        expect(res.status).toBe(201);
        expect(res.body.game).toBeDefined();
      });

      it('returns 400 when participants missing', async () => {
        const res: any = await POST(makeRequest({ date: '2026-04-10T00:00:00.000Z' }));
        expect(res.status).toBe(400);
        expect(mockTransaction).not.toHaveBeenCalled();
      });

      it('returns 400 when more than 4 participants', async () => {
        const body = {
          ...validGameBody,
          participants: [
            { playerName: 'A', isWinner: true, isScrewed: false },
            { playerName: 'B', isWinner: false, isScrewed: false },
            { playerName: 'C', isWinner: false, isScrewed: false },
            { playerName: 'D', isWinner: false, isScrewed: false },
            { playerName: 'E', isWinner: false, isScrewed: false },
          ],
        };
        const res: any = await POST(makeRequest(body));
        expect(res.status).toBe(400);
      });

      it('returns 400 when playerName is empty string', async () => {
        const body = {
          ...validGameBody,
          participants: [{ playerName: '', isWinner: true, isScrewed: false }],
        };
        const res: any = await POST(makeRequest(body));
        expect(res.status).toBe(400);
      });

      it('allows a participant to be winner AND screwed (D-02)', async () => {
        mockGameCreate.mockResolvedValue({ id: 'g1', date: new Date(), wonByCombo: false, notes: null, createdAt: new Date() });
        mockParticipantCreateMany.mockResolvedValue({ count: 1 });
        const body = {
          ...validGameBody,
          participants: [{ playerName: 'Alice', isWinner: true, isScrewed: true, deckName: 'Atraxa' }],
        };
        const res: any = await POST(makeRequest(body));
        expect(res.status).toBe(201);
      });

      it('returns 429 with Retry-After when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
        const res: any = await POST(makeRequest(validGameBody));
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ error: 'Rate limit exceeded' });
        expect(res.headers['Retry-After']).toBe('42');
        expect(mockTransaction).not.toHaveBeenCalled();
      });

      it('returns 500 on transaction failure', async () => {
        mockTransaction.mockRejectedValue(new Error('tx failed'));
        const res: any = await POST(makeRequest(validGameBody));
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to create game' });
      });

      it('calls checkRateLimit with (ip, 30, 60000)', async () => {
        mockGameCreate.mockResolvedValue({ id: 'g1', date: new Date(), wonByCombo: false, notes: null, createdAt: new Date() });
        mockParticipantCreateMany.mockResolvedValue({ count: 2 });
        await POST(makeRequest(validGameBody));
        expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 30, 60000);
      });
    });

    describe('GET /api/games', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
      });

      it('returns games ordered by date desc with participants', async () => {
        mockGameFindMany.mockResolvedValue([
          { id: 'g2', date: new Date('2026-04-10'), wonByCombo: false, notes: null, createdAt: new Date(), participants: [] },
          { id: 'g1', date: new Date('2026-04-09'), wonByCombo: false, notes: null, createdAt: new Date(), participants: [] },
        ]);
        const res: any = await getGames(makeRequest());
        expect(res.status).toBe(200);
        expect(res.body.games).toHaveLength(2);
        const call = mockGameFindMany.mock.calls[0][0];
        expect(call.include).toEqual({ participants: true });
        expect(call.orderBy).toEqual({ date: 'desc' });
      });

      it('returns 429 when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 7 });
        const res: any = await getGames(makeRequest());
        expect(res.status).toBe(429);
        expect(res.headers['Retry-After']).toBe('7');
        expect(mockGameFindMany).not.toHaveBeenCalled();
      });

      it('returns 500 on DB error', async () => {
        mockGameFindMany.mockRejectedValue(new Error('db down'));
        const res: any = await getGames(makeRequest());
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to fetch games' });
      });
    });
    ```

    Run `npx jest tests/games-api.test.ts` — MUST fail (routes don't exist yet).

    **Step 2 — GREEN: Create `src/app/api/games/route.ts`:**

    ```typescript
    import { NextResponse } from 'next/server';
    import { z } from 'zod';
    import { prisma } from '@/lib/prisma';
    import { gameSchema } from '@/lib/validators';
    import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

    export async function POST(request: Request) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const body = await request.json();
        const { date, wonByCombo, notes, participants } = gameSchema.parse(body);
        const game = await prisma.$transaction(async (tx) => {
          const created = await tx.game.create({
            data: { date, wonByCombo, notes },
          });
          await tx.gameParticipant.createMany({
            data: participants.map((p) => ({
              gameId: created.id,
              playerName: p.playerName,
              isWinner: p.isWinner,
              isScrewed: p.isScrewed,
              deckName: p.deckName,
            })),
          });
          return created;
        });
        return NextResponse.json({ game }, { status: 201 });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error('POST /api/games error:', error);
        return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
      }
    }

    export async function GET(request: Request) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const games = await prisma.game.findMany({
          include: { participants: true },
          orderBy: { date: 'desc' },
        });
        return NextResponse.json({ games });
      } catch (error) {
        console.error('GET /api/games error:', error);
        return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
      }
    }
    ```

    **NOTE on Zod v4:** `zod@4.3.6` is installed. The error container field is `.issues` in v4 (not `.errors`). Verify the shape by running the "400 when participants missing" test — if it fails, check whether v4 uses `.issues` or `.errors`. Use whichever the installed version exposes; the test checks only `res.status === 400`, not the body shape, so either works for the test. For the response body, use `error.issues` (v4 canonical) — if that causes a TypeScript error, fall back to `error.errors`.

    Run `npx jest tests/games-api.test.ts` — MUST pass all 11 tests in this task.

    Run `npx jest` — full suite MUST remain green.
  </action>
  <verify>
    <automated>npx jest tests/games-api.test.ts -t "POST|GET /api/games"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/games/route.ts` exists and exports `POST` and `GET`
    - Contains literal string `import { gameSchema } from '@/lib/validators'`
    - Contains literal string `import { checkRateLimit, getIpKey } from '@/lib/rateLimit'`
    - Contains literal string `gameSchema.parse(body)`
    - Contains literal string `prisma.$transaction`
    - Contains literal string `include: { participants: true }`
    - Contains literal string `orderBy: { date: 'desc' }`
    - Contains literal string `status: 201`
    - Contains literal string `status: 429`
    - Contains literal string `'Retry-After'`
    - Does NOT contain any manual `.trim()` or `.substring()` on body fields (all sanitization delegated to gameSchema per D-29)
    - `tests/games-api.test.ts` exists with POST + GET describe blocks
    - POST + GET tests all pass
    - Full jest suite green
  </acceptance_criteria>
  <done>
    POST and GET endpoints for `/api/games` are implemented, rate-limited, validated by gameSchema, and tested.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create /api/games/[id]/route.ts (GET, PATCH, DELETE) with tests</name>
  <files>
    - src/app/api/games/[id]/route.ts
    - tests/games-api.test.ts
  </files>
  <read_first>
    - src/app/api/games/route.ts (just created — mirror the rate-limit + try/catch pattern)
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md "Pattern 3: Next.js 16 Dynamic Route Params" and "Pattern 1 ... PATCH delete-old-recreate pattern" and "DELETE cascade"
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-13, D-16, D-29
    - prisma/schema.prisma (confirm `onDelete: Cascade` on `GameParticipant.gameId`)
    - tests/games-api.test.ts (existing file to extend with [id] describe blocks)
  </read_first>
  <behavior>
    - GET /api/games/[id] with valid id → 200 `{ game: { ..., participants: [...] } }` (uses `findUnique` + `include`)
    - GET /api/games/[id] with unknown id → 404 `{ error: 'Not found' }`
    - PATCH /api/games/[id] with valid body → 200 `{ game }`; performs deleteMany participants + update game + createMany participants inside `$transaction`
    - PATCH with invalid body → 400 ZodError
    - PATCH on unknown id → 404 (prisma.game.update throws P2025 Record not found — catch and return 404)
    - DELETE /api/games/[id] → 200 `{ ok: true }`; calls `prisma.game.delete({ where: { id } })`; does NOT explicitly delete participants (cascade handles it)
    - DELETE unknown id → 404 (P2025 → 404)
    - All three apply rate limiting with (30, 60000)
    - All three await params (Next.js 16 async contract)
  </behavior>
  <action>
    **Step 1 — RED: Extend `tests/games-api.test.ts`** with three new describe blocks for GET/PATCH/DELETE on `[id]`. Append to the existing file (don't overwrite the POST/GET tests from Task 1).

    Import the new handlers at the top (add to existing imports):
    ```typescript
    import {
      GET as getGameById,
      PATCH as patchGame,
      DELETE as deleteGame,
    } from '../src/app/api/games/[id]/route';
    ```

    Add a `makeParams` helper:
    ```typescript
    function makeParams(id: string) {
      return { params: Promise.resolve({ id }) };
    }
    ```

    Add these describe blocks:

    ```typescript
    describe('GET /api/games/[id]', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
      });

      it('returns 200 with game + participants when found', async () => {
        mockGameFindUnique.mockResolvedValue({
          id: 'g1',
          date: new Date('2026-04-10'),
          wonByCombo: false,
          notes: null,
          createdAt: new Date(),
          participants: [{ id: 'p1', gameId: 'g1', playerName: 'Alice', isWinner: true, isScrewed: false, deckName: null }],
        });
        const res: any = await getGameById(makeRequest(), makeParams('g1'));
        expect(res.status).toBe(200);
        expect(res.body.game.id).toBe('g1');
        expect(res.body.game.participants).toHaveLength(1);
      });

      it('returns 404 when game not found', async () => {
        mockGameFindUnique.mockResolvedValue(null);
        const res: any = await getGameById(makeRequest(), makeParams('missing'));
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Not found' });
      });

      it('returns 429 when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 5 });
        const res: any = await getGameById(makeRequest(), makeParams('g1'));
        expect(res.status).toBe(429);
        expect(mockGameFindUnique).not.toHaveBeenCalled();
      });
    });

    describe('PATCH /api/games/[id]', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
        mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
          const tx = {
            game: {
              create: mockGameCreate,
              update: mockGameUpdate,
            },
            gameParticipant: {
              createMany: mockParticipantCreateMany,
              deleteMany: mockParticipantDeleteMany,
            },
          };
          return fn(tx);
        });
      });

      it('full-replace: deletes existing participants, updates game, creates new participants', async () => {
        mockParticipantDeleteMany.mockResolvedValue({ count: 2 });
        mockGameUpdate.mockResolvedValue({
          id: 'g1',
          date: new Date('2026-04-10'),
          wonByCombo: true,
          notes: 'updated',
          createdAt: new Date(),
        });
        mockParticipantCreateMany.mockResolvedValue({ count: 3 });

        const body = {
          date: '2026-04-10T00:00:00.000Z',
          wonByCombo: true,
          notes: 'updated',
          participants: [
            { playerName: 'X', isWinner: true, isScrewed: false },
            { playerName: 'Y', isWinner: false, isScrewed: false },
            { playerName: 'Z', isWinner: false, isScrewed: true },
          ],
        };
        const res: any = await patchGame(makeRequest(body), makeParams('g1'));

        expect(res.status).toBe(200);
        expect(mockParticipantDeleteMany).toHaveBeenCalledWith({ where: { gameId: 'g1' } });
        expect(mockGameUpdate).toHaveBeenCalled();
        const cm = mockParticipantCreateMany.mock.calls[0][0];
        expect(cm.data).toHaveLength(3);
      });

      it('returns 400 on ZodError', async () => {
        const res: any = await patchGame(makeRequest({ foo: 'bar' }), makeParams('g1'));
        expect(res.status).toBe(400);
        expect(mockTransaction).not.toHaveBeenCalled();
      });

      it('returns 404 when update targets missing id (P2025)', async () => {
        mockTransaction.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'P2025' }));
        const body = {
          date: '2026-04-10T00:00:00.000Z',
          wonByCombo: false,
          participants: [{ playerName: 'X', isWinner: true, isScrewed: false }],
        };
        const res: any = await patchGame(makeRequest(body), makeParams('missing'));
        expect(res.status).toBe(404);
      });

      it('returns 429 when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 3 });
        const res: any = await patchGame(makeRequest({}), makeParams('g1'));
        expect(res.status).toBe(429);
        expect(mockTransaction).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/games/[id]', () => {
      beforeEach(() => {
        jest.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({ allowed: true });
      });

      it('deletes the game and returns 200', async () => {
        mockGameDelete.mockResolvedValue({ id: 'g1' });
        const res: any = await deleteGame(makeRequest(), makeParams('g1'));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(mockGameDelete).toHaveBeenCalledWith({ where: { id: 'g1' } });
      });

      it('does NOT explicitly delete participants (cascade handles it)', async () => {
        mockGameDelete.mockResolvedValue({ id: 'g1' });
        await deleteGame(makeRequest(), makeParams('g1'));
        expect(mockParticipantDeleteMany).not.toHaveBeenCalled();
      });

      it('returns 404 when game missing (P2025)', async () => {
        mockGameDelete.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'P2025' }));
        const res: any = await deleteGame(makeRequest(), makeParams('missing'));
        expect(res.status).toBe(404);
      });

      it('returns 429 when rate limited', async () => {
        mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 8 });
        const res: any = await deleteGame(makeRequest(), makeParams('g1'));
        expect(res.status).toBe(429);
        expect(mockGameDelete).not.toHaveBeenCalled();
      });
    });
    ```

    Run `npx jest tests/games-api.test.ts` — MUST fail on the new describe blocks.

    **Step 2 — GREEN: Create `src/app/api/games/[id]/route.ts`:**

    ```typescript
    import { NextResponse } from 'next/server';
    import { z } from 'zod';
    import { prisma } from '@/lib/prisma';
    import { gameSchema } from '@/lib/validators';
    import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

    // Prisma "Record not found" error code for update/delete on missing row
    const PRISMA_NOT_FOUND = 'P2025';

    function isPrismaNotFound(err: unknown): boolean {
      return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === PRISMA_NOT_FOUND
      );
    }

    export async function GET(
      request: Request,
      { params }: { params: Promise<{ id: string }> }
    ) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const { id } = await params;
        const game = await prisma.game.findUnique({
          where: { id },
          include: { participants: true },
        });
        if (!game) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json({ game });
      } catch (error) {
        console.error('GET /api/games/[id] error:', error);
        return NextResponse.json({ error: 'Failed to fetch game' }, { status: 500 });
      }
    }

    export async function PATCH(
      request: Request,
      { params }: { params: Promise<{ id: string }> }
    ) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const { id } = await params;
        const body = await request.json();
        const { date, wonByCombo, notes, participants } = gameSchema.parse(body);
        const updated = await prisma.$transaction(async (tx) => {
          await tx.gameParticipant.deleteMany({ where: { gameId: id } });
          const g = await tx.game.update({
            where: { id },
            data: { date, wonByCombo, notes },
          });
          await tx.gameParticipant.createMany({
            data: participants.map((p) => ({
              gameId: g.id,
              playerName: p.playerName,
              isWinner: p.isWinner,
              isScrewed: p.isScrewed,
              deckName: p.deckName,
            })),
          });
          return g;
        });
        return NextResponse.json({ game: updated });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        if (isPrismaNotFound(error)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        console.error('PATCH /api/games/[id] error:', error);
        return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
      }
    }

    export async function DELETE(
      request: Request,
      { params }: { params: Promise<{ id: string }> }
    ) {
      const rl = checkRateLimit(getIpKey(request), 30, 60000);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
        );
      }
      try {
        const { id } = await params;
        // GameParticipant rows cascade automatically (onDelete: Cascade in schema)
        await prisma.game.delete({ where: { id } });
        return NextResponse.json({ ok: true });
      } catch (error) {
        if (isPrismaNotFound(error)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        console.error('DELETE /api/games/[id] error:', error);
        return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
      }
    }
    ```

    Run `npx jest tests/games-api.test.ts` — ALL describe blocks (POST, GET list, GET by id, PATCH, DELETE) MUST pass.

    Run `npx jest` — full suite MUST remain green.

    **Critical constraints:**
    - Do NOT write a DELETE that explicitly removes participants before deleting the game — the schema has `onDelete: Cascade`, so `prisma.game.delete` handles it (verified by test "does NOT explicitly delete participants")
    - Do NOT use the old sync params signature `{ params: { id: string } }` — Next.js 16 requires `Promise<{ id: string }>` + `await params` (RESEARCH.md Pitfall 1)
    - Do NOT use `prisma.$transaction([op1, op2])` array form for PATCH — the callback form `async (tx) => { ... }` is required so deleteMany+update+createMany are all in one libsql transaction (RESEARCH.md Pattern 1)
    - Do NOT try to reconcile per-row diffs in PATCH — full replace is the chosen strategy (D-16)
    - Do NOT add a per-handler auth check — middleware already covers `/api/games/**` (RESEARCH.md Pattern 7)
  </action>
  <verify>
    <automated>npx jest tests/games-api.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/api/games/[id]/route.ts` exists and exports `GET`, `PATCH`, `DELETE`
    - Contains literal string `params: Promise<{ id: string }>`
    - Contains literal string `await params`
    - PATCH contains `tx.gameParticipant.deleteMany` and `tx.gameParticipant.createMany` (both inside `$transaction` callback)
    - DELETE contains literal string `prisma.game.delete({ where: { id } })`
    - DELETE does NOT contain `gameParticipant.deleteMany` (cascade handles it)
    - Contains literal string `'P2025'` (Prisma not-found handling)
    - Contains literal string `gameSchema.parse` (in PATCH)
    - All three handlers contain `checkRateLimit(getIpKey(request), 30, 60000)`
    - `tests/games-api.test.ts` now has POST, GET list, GET by id, PATCH, and DELETE describe blocks (at least 5 describe blocks total)
    - `npx jest tests/games-api.test.ts` exits 0 (at least ~20 tests passing across the file)
    - Full jest suite green
  </acceptance_criteria>
  <done>
    All five `/api/games` endpoints are implemented with rate limiting, zod validation, $transaction atomicity, cascade-aware delete, and full integration test coverage.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public internet → /api/games/** | Untrusted request source; middleware auth (proxy.ts) + rate limit (checkRateLimit) apply |
| Request body → gameSchema.parse | Untrusted JSON; zod enforces trim + length caps + shape before DB insert |
| Prisma transaction boundary | Atomic — partial insert on failure is impossible by contract |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-01 | Spoofing | Unauthenticated access to game routes | mitigate (inherited) | `proxy.ts` HMAC cookie middleware covers `/api/games/**` via blocklist matcher — no per-route auth code |
| T-06-02 | Tampering / SQL Injection | playerName/deckName in INSERT | mitigate | Prisma parameterized queries (`tx.game.create`, `tx.gameParticipant.createMany`); zod gameSchema enforces max lengths (100 for names, 1000 for notes). No `$queryRaw`. |
| T-06-05 | Tampering / Mass Assignment | POST/PATCH body with extra fields | mitigate | `gameSchema.parse(body)` strips unknown fields. Route destructures only `{ date, wonByCombo, notes, participants }` — extra fields never reach Prisma. |
| T-06-06 | Tampering / Race | Game create with partial participant insert | mitigate | `prisma.$transaction(async (tx) => { ... })` wraps game+participants — verified by test "creates game with participants atomically" (mockTransaction called exactly once per POST) |
| T-06-04 | Denial of Service | Bulk game creation abuse | mitigate | `checkRateLimit(ip, 30, 60000)` before body parse (D-24). Verified by test "returns 429 ... prisma NEVER called" |
| T-06-09 | Info Disclosure | Error bodies leak stack traces | mitigate | Catch blocks always return `{ error: '<static string>' }`; stack details logged server-side via `console.error` only. ZodError issues are returned (client needs field-level errors) but contain no DB internals. |

</threat_model>

<verification>
- `npx jest tests/games-api.test.ts` passes (~20 tests)
- `npx jest` full suite green
- All 5 endpoints use `checkRateLimit` + `gameSchema` + no duplicate validation
- PATCH uses `$transaction` callback with deleteMany → update → createMany
- DELETE is single `prisma.game.delete` (no explicit participant delete)
- Both `[id]` routes use `await params`
</verification>

<success_criteria>
- POST creates game+participants atomically, returns 201
- GET list returns games newest-first with participants
- GET by id returns 200 or 404
- PATCH full-replaces participants inside a transaction
- DELETE relies on cascade
- All return 429 with Retry-After when rate limited
- All return 400 on ZodError (POST and PATCH)
</success_criteria>

<output>
After completion, create `.planning/phases/06-game-tracking-core/06-04-SUMMARY.md` documenting: endpoint contracts, transaction patterns, test count, the response shapes Plan 06-06 will consume.
</output>
