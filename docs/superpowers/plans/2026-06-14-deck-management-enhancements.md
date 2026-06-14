# Deck Management Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four zero-migration deck-management features — admin delete-any-deck (+detach from games), user deck rename (propagating to game history), Moxfield card import into an existing deck (with printings), and a game-form deck dropdown whose "owned" tier follows the selected player.

**Architecture:** Two shared helpers — `matchDeckParticipants` (pure, in `src/lib/reconcile.ts`) backs rename + admin-delete; `src/lib/deckImport.ts` (`classifyMoxfieldCards` pure + `resolveMissingToLibrary` async) is shared by the create-import and the new per-deck import. New/extended API routes are thin and admin/owner-guarded. UI changes extend existing client components. No Prisma schema change.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + libsql (Turso/SQLite), Jest, React client components, Tailwind, Zod.

**Commit policy (overrides per-task commits):** On `master`; the user wants one bundled commit. Implementers must **NOT** commit per task. Task 9 does a single bundled commit (code + spec + plan) after confirmation.

**Spec:** `docs/superpowers/specs/2026-06-14-deck-management-enhancements-design.md`

---

## File Structure

- **Modify** `src/lib/reconcile.ts` — add pure `matchDeckParticipants`.
- **Create** `src/lib/deckImport.ts` — `classifyMoxfieldCards`, `resolveMissingToLibrary`.
- **Modify** `src/app/api/decks/import/route.ts` — refactor to use `deckImport.ts` (behavior unchanged).
- **Modify** `src/app/api/admin/decks/route.ts` — add `gameCount` per deck to GET.
- **Modify** `src/app/api/admin/decks/[id]/route.ts` — add `DELETE` (detach + delete).
- **Modify** `src/app/admin/decks-section.tsx` — delete button + game-count warning.
- **Modify** `src/app/api/decks/[id]/route.ts` — add `PATCH` (rename + propagate).
- **Create** `src/app/api/decks/[id]/import/route.ts` — per-deck Moxfield import.
- **Modify** `src/app/decks/[id]/page.tsx` — inline rename + "Moxfield Import" panel.
- **Modify** `src/app/api/decks/route.ts` — add `decksByOwner`.
- **Modify** `src/lib/deckTiers.ts` — `playerDecks` param + `'Owned decks'` label.
- **Modify** `src/app/games/game-form.tsx` — tier each row by its selected player.
- Tests: extend `tests/reconcile.test.ts`, `tests/deck-import-api.test.ts`, `tests/admin-decks.test.ts`, `tests/tiered-decks.test.ts`; create `tests/deck-import-lib.test.ts`, `tests/deck-rename-api.test.ts`, `tests/deck-card-import-api.test.ts`, `tests/decks-by-owner.test.ts`, `tests/game-form-deck-tiers.test.ts`.

Test conventions (verified): mock `@/lib/prisma`, `@/lib/session` (`getSession`), `next/server` (`NextResponse.json` → `{ body, status }`); `$transaction: (fn) => fn(tx)`; scryfall via `jest.mock('@/lib/scryfall', () => ({ ...jest.requireActual(...), resolveCards }))`; `makeRequest` returns `{ json, headers.get('x-forwarded-for') }`.

---

## Task 1: `matchDeckParticipants` pure helper

**Files:**
- Modify: `src/lib/reconcile.ts`
- Test: `tests/reconcile.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `tests/reconcile.test.ts`:

```ts
import { matchDeckParticipants } from '@/lib/reconcile'

describe('matchDeckParticipants', () => {
  const P = (id: string, gameId: string, deckName: string | null) => ({ id, gameId, deckName })

  it('returns ids whose deckName matches (case/space-insensitive) and the distinct game count', () => {
    const parts = [P('a', 'g1', 'Anikthea'), P('b', 'g1', 'anikthea '), P('c', 'g2', 'ANIKTHEA'), P('d', 'g3', 'Goblins')]
    expect(matchDeckParticipants(parts, 'anikthea')).toEqual({ ids: ['a', 'b', 'c'], gameCount: 2 })
  })

  it('skips null deckNames and returns empty when nothing matches', () => {
    const parts = [P('a', 'g1', null), P('b', 'g2', 'Goblins')]
    expect(matchDeckParticipants(parts, 'Slivers')).toEqual({ ids: [], gameCount: 0 })
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx jest tests/reconcile.test.ts` → FAIL (`matchDeckParticipants` is not a function).

- [ ] **Step 3: Implement** — append to `src/lib/reconcile.ts`:

```ts
// Match game participants whose deckName equals `name` (normalized). Used by the
// deck rename + admin-delete flows to rewrite or detach the deckName string in
// game history. Pure — the caller fetches participants and runs the updateMany.
export function matchDeckParticipants(
  participants: Array<{ id: string; gameId: string; deckName: string | null }>,
  name: string
): { ids: string[]; gameCount: number } {
  const key = normalizeName(name)
  const matched = participants.filter((p) => p.deckName != null && normalizeName(p.deckName) === key)
  return { ids: matched.map((p) => p.id), gameCount: new Set(matched.map((p) => p.gameId)).size }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx jest tests/reconcile.test.ts` → PASS.

---

## Task 2: `deckImport.ts` shared helpers + refactor create-import

**Files:**
- Create: `src/lib/deckImport.ts`
- Modify: `src/app/api/decks/import/route.ts`
- Test: `tests/deck-import-lib.test.ts` (new); `tests/deck-import-api.test.ts` (must stay green)

- [ ] **Step 1: Write the failing unit test** — create `tests/deck-import-lib.test.ts`:

```ts
import { classifyMoxfieldCards } from '@/lib/deckImport'
import { buildLibraryNameIndex } from '@/lib/parseMoxfield'

const card = (name: string, set?: string, collectorNumber?: string) => ({
  line: 1, quantity: 1, name, set, collectorNumber, isFoil: false,
})

describe('classifyMoxfieldCards', () => {
  it('splits into present (canonical), missing, and basics', () => {
    const lib = buildLibraryNameIndex(['Sol Ring'])
    const cards = [card('sol ring'), card('Black Lotus'), card('Plains')]
    const { present, missing, basics } = classifyMoxfieldCards(cards, lib)
    expect(present).toEqual([{ card: cards[0], canonical: 'Sol Ring' }])
    expect(missing).toEqual([cards[1]])
    expect(basics).toEqual([cards[2]])
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx jest tests/deck-import-lib.test.ts` → FAIL (`Cannot find module '@/lib/deckImport'`).

- [ ] **Step 3: Implement `src/lib/deckImport.ts`:**

```ts
// Shared Moxfield-import logic used by the deck-create import and the per-deck
// card import. classifyMoxfieldCards is pure; resolveMissingToLibrary wraps
// Scryfall to turn missing printings into collection-card insert rows.
import {
  buildLibraryNameIndex,
  findLibraryName,
  isBasicLand,
  type ParsedMoxfieldCard,
} from '@/lib/parseMoxfield'
import { resolveCards, scryfallKey } from '@/lib/scryfall'

export interface ClassifiedCards {
  present: Array<{ card: ParsedMoxfieldCard; canonical: string }>
  missing: ParsedMoxfieldCard[]
  basics: ParsedMoxfieldCard[]
}

export function classifyMoxfieldCards(
  cards: ParsedMoxfieldCard[],
  libIndex: ReturnType<typeof buildLibraryNameIndex>
): ClassifiedCards {
  const present: ClassifiedCards['present'] = []
  const missing: ParsedMoxfieldCard[] = []
  const basics: ParsedMoxfieldCard[] = []
  for (const c of cards) {
    // Basic lands never exist in scraped collections — they import freely and
    // never trigger the missing-cards prompt.
    if (isBasicLand(c.name)) {
      basics.push(c)
      continue
    }
    const canonical = findLibraryName(libIndex, c.name)
    if (canonical) present.push({ card: c, canonical })
    else missing.push(c)
  }
  return { present, missing, basics }
}

export type ResolveMissingResult =
  | {
      ok: true
      libraryInserts: Array<Record<string, unknown>>
      resolved: Array<{ card: ParsedMoxfieldCard; name: string }>
    }
  | { ok: false; status: 422 | 502; error: string; cards: string[] }

export async function resolveMissingToLibrary(
  missing: ParsedMoxfieldCard[],
  userId: string
): Promise<ResolveMissingResult> {
  const unresolvable = missing.filter((c) => !c.set || !c.collectorNumber)
  if (unresolvable.length > 0) {
    return {
      ok: false,
      status: 422,
      error: 'Some missing cards lack a set/collector number and cannot be added to your library',
      cards: unresolvable.map((c) => c.name),
    }
  }
  let resolved
  try {
    resolved = await resolveCards(missing.map((c) => ({ set: c.set as string, collectorNumber: c.collectorNumber as string })))
  } catch (error) {
    console.error('Scryfall lookup failed:', error)
    return { ok: false, status: 502, error: 'Scryfall lookup failed — try again', cards: [] }
  }
  const notFound = missing.filter((c) => !resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string)))
  if (notFound.length > 0) {
    return {
      ok: false,
      status: 422,
      error: 'Some cards could not be resolved on Scryfall — fix those lines and retry',
      cards: notFound.map((c) => `${c.name} (${c.set}) ${c.collectorNumber}`),
    }
  }
  const libraryInserts: Array<Record<string, unknown>> = []
  const resolvedList: Array<{ card: ParsedMoxfieldCard; name: string }> = []
  for (const c of missing) {
    const hit = resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string))!
    libraryInserts.push({
      userId,
      cardName: hit.name,
      scryfallId: hit.scryfallId,
      set: hit.set,
      setName: hit.setName,
      quantity: c.quantity,
      condition: 'NearMint',
      isFoil: c.isFoil,
      typeLine: hit.typeLine,
      source: 'manual',
    })
    resolvedList.push({ card: c, name: hit.name })
  }
  return { ok: true, libraryInserts, resolved: resolvedList }
}
```

- [ ] **Step 4: Run unit test** — `npx jest tests/deck-import-lib.test.ts` → PASS.

- [ ] **Step 5: Refactor `src/app/api/decks/import/route.ts` to use the helpers.** Replace the inline classify block (the `present`/`missing`/`basics` loop) with:

```ts
    const { cards, errors } = parseMoxfieldText(text);
    const lib = await prisma.collectionCard.findMany({
      where: { userId: session.userId },
      select: { cardName: true },
    });
    const libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
    const { present, missing, basics } = classifyMoxfieldCards(cards, libIndex);
```

Replace the inline missing-resolution block (the `if (missing.length > 0 && addMissingToLibrary) { ... } else if ...`) with:

```ts
    const libraryInserts: Array<Record<string, unknown>> = [];
    let excluded: string[] = [];

    if (missing.length > 0 && addMissingToLibrary) {
      const r = await resolveMissingToLibrary(missing, session.userId);
      if (!r.ok) {
        return NextResponse.json(
          r.cards.length ? { error: r.error, cards: r.cards } : { error: r.error },
          { status: r.status }
        );
      }
      libraryInserts.push(...r.libraryInserts);
      for (const { card, name } of r.resolved) addDraft(name, card);
    } else if (missing.length > 0) {
      excluded = missing.map((c) => c.name);
    }
```

Update imports at the top: remove now-unused `findLibraryName`, `isBasicLand`, `resolveCards`, `scryfallKey` if no longer referenced (keep `parseMoxfieldText`, `buildLibraryNameIndex`, `normalizeCardName`, `type ParsedMoxfieldCard`), and add:

```ts
import { classifyMoxfieldCards, resolveMissingToLibrary } from '@/lib/deckImport';
```

Leave the dryRun block, the dup-name check, the `deckCardMap`/`addDraft` merge, and the `$transaction` create exactly as they are.

- [ ] **Step 6: Run the existing import API tests** — `npx jest tests/deck-import-api.test.ts` → all PASS (behavior unchanged). Then `npx jest tests/deck-import-lib.test.ts` → PASS.

---

## Task 3: Feature 1 — admin delete any deck (+ detach)

**Files:**
- Modify: `src/app/api/admin/decks/route.ts` (GET gameCount)
- Modify: `src/app/api/admin/decks/[id]/route.ts` (add DELETE)
- Modify: `src/app/admin/decks-section.tsx` (delete button)
- Test: `tests/admin-decks.test.ts` (extend)

- [ ] **Step 1: Write failing tests** — in `tests/admin-decks.test.ts`, extend the `jest.mock('@/lib/prisma')` to add the methods + `$transaction`, then add tests. Replace the prisma mock block with:

```ts
const mockDeckFindMany = jest.fn()
const mockDeckFindUnique = jest.fn()
const mockDeckUpdate = jest.fn()
const mockDeckDelete = jest.fn()
const mockUserFindUnique = jest.fn()
const mockGPFindMany = jest.fn()
const mockGPUpdateMany = jest.fn()
const tx = {
  gameParticipant: { updateMany: (...a: unknown[]) => mockGPUpdateMany(...a) },
  deck: { delete: (...a: unknown[]) => mockDeckDelete(...a) },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      update: (...a: unknown[]) => mockDeckUpdate(...a),
      delete: (...a: unknown[]) => mockDeckDelete(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    gameParticipant: {
      findMany: (...a: unknown[]) => mockGPFindMany(...a),
      updateMany: (...a: unknown[]) => mockGPUpdateMany(...a),
    },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))
```

Add `DELETE` to the route import line:

```ts
import { PATCH, DELETE } from '../src/app/api/admin/decks/[id]/route'
```

Update the GET test to expect `gameCount` and add a participant mock. In the existing `'GET lists decks...'` test, before calling GET add:

```ts
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', deckName: 'Krenko' },
      { gameId: 'g2', deckName: 'krenko' },
      { gameId: 'g3', deckName: 'Other' },
    ])
```

and change the expected body to include `gameCount` (2 for Krenko, 0 for Slivers):

```ts
    expect(res.body.decks).toEqual([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', ownerName: 'Alice', cardCount: 5, gameCount: 2 },
      { id: 'd2', name: 'Slivers', ownerUserId: null, ownerName: null, cardCount: 0, gameCount: 0 },
    ])
```

Add a new describe block:

```ts
describe('DELETE /api/admin/decks/[id]', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockDeckDelete.mockReset()
    mockGPFindMany.mockReset(); mockGPUpdateMany.mockReset()
  })

  it('detaches matching games (nulls deckName) then deletes the deck', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Krenko' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', gameId: 'g1', deckName: 'Krenko' },
      { id: 'p2', gameId: 'g2', deckName: 'krenko' },
      { id: 'p3', gameId: 'g3', deckName: 'Other' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    mockDeckDelete.mockResolvedValue({})
    const res: any = await DELETE(makeRequest(), params)
    expect(mockGPUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] } }, data: { deckName: null } })
    expect(mockDeckDelete).toHaveBeenCalledWith({ where: { id: 'd1' } })
    expect(res.body).toEqual({ success: true, detachedGames: 2 })
  })

  it('404s a missing deck; 403s a non-admin without deleting', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(404)
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Krenko' })
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(403)
    expect(mockDeckDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx jest tests/admin-decks.test.ts` → FAIL (`DELETE` not exported; `gameCount` missing).

- [ ] **Step 3a: Add `gameCount` to GET** in `src/app/api/admin/decks/route.ts`. After the `decks` query, before the response, build the participant→games map and include `gameCount`:

```ts
    const participants = await prisma.gameParticipant.findMany({
      where: { deckName: { not: null } },
      select: { gameId: true, deckName: true },
    });
    const gamesByDeck = new Map<string, Set<string>>();
    for (const p of participants) {
      if (!p.deckName) continue;
      const key = p.deckName.trim().toLowerCase();
      if (!gamesByDeck.has(key)) gamesByDeck.set(key, new Set());
      gamesByDeck.get(key)!.add(p.gameId);
    }
    return NextResponse.json({
      decks: decks.map((d) => ({
        id: d.id,
        name: d.name,
        ownerUserId: d.ownerUserId,
        ownerName: d.owner?.name ?? null,
        cardCount: d.cards.reduce((n, c) => n + c.quantity, 0),
        gameCount: gamesByDeck.get(d.name.trim().toLowerCase())?.size ?? 0,
      })),
    });
```

- [ ] **Step 3b: Add `DELETE`** to `src/app/api/admin/decks/[id]/route.ts`. Add the import and the handler (matching the file's existing inline-auth + rate-limit style):

```ts
import { matchDeckParticipants } from '@/lib/reconcile';
```

```ts
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const parts = await prisma.gameParticipant.findMany({
      where: { deckName: { not: null } },
      select: { id: true, gameId: true, deckName: true },
    });
    const { ids, gameCount } = matchDeckParticipants(parts, deck.name);

    await prisma.$transaction(async (tx) => {
      if (ids.length > 0) {
        await tx.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { deckName: null } });
      }
      await tx.deck.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, detachedGames: gameCount });
  } catch (error) {
    console.error('DELETE /api/admin/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete deck' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx jest tests/admin-decks.test.ts` → PASS.

- [ ] **Step 5: DecksSection UI.** In `src/app/admin/decks-section.tsx`: add `gameCount` to the `AdminDeck` interface; add a delete handler; render a Delete button per row. Add to the interface:

```tsx
interface AdminDeck {
  id: string;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  cardCount: number;
  gameCount: number;
}
```

Add the handler inside the component (after `assign`):

```tsx
  const remove = async (deck: AdminDeck) => {
    const msg =
      deck.gameCount > 0
        ? `Delete "${deck.name}"? It is used in ${deck.gameCount} game${deck.gameCount === 1 ? "" : "s"} — deleting removes it from them (player names unchanged).`
        : `Delete "${deck.name}"?`;
    if (!confirm(msg)) return;
    setStatus("");
    const res = await fetch(`/api/admin/decks/${deck.id}`, { method: "DELETE" });
    if (!res.ok) {
      setStatus("Failed to delete deck");
      return;
    }
    setDecks((ds) => ds.filter((d) => d.id !== deck.id));
  };
```

In each deck row, after the owner `<select>`, add a delete button (so the row's right side holds the select + button — wrap them in a `flex items-center gap-2` if needed):

```tsx
                <button
                  onClick={() => remove(deck)}
                  className="px-2 py-1 rounded-md text-xs text-red-400 hover:bg-destructive/10 cursor-pointer"
                  aria-label={`Delete ${deck.name}`}
                >
                  Delete
                </button>
```

- [ ] **Step 6: Build check** — `npm run build` → succeeds.

---

## Task 4: Feature 2 — user rename own deck (+ propagate)

**Files:**
- Modify: `src/app/api/decks/[id]/route.ts` (add PATCH)
- Modify: `src/app/decks/[id]/page.tsx` (inline rename)
- Test: `tests/deck-rename-api.test.ts` (new)

- [ ] **Step 1: Write failing tests** — create `tests/deck-rename-api.test.ts`:

```ts
const mockDeckFindUnique = jest.fn()
const mockDeckFindFirst = jest.fn()
const mockDeckUpdate = jest.fn()
const mockGPFindMany = jest.fn()
const mockGPUpdateMany = jest.fn()
const tx = {
  deck: { update: (...a: unknown[]) => mockDeckUpdate(...a) },
  gameParticipant: {
    findMany: (...a: unknown[]) => mockGPFindMany(...a),
    updateMany: (...a: unknown[]) => mockGPUpdateMany(...a),
  },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      findFirst: (...a: unknown[]) => mockDeckFindFirst(...a),
    },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
}))

const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))

let ipCounter = 0
function makeRequest(body?: Record<string, unknown>): Request {
  ipCounter += 1
  return {
    json: async () => body ?? {},
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) },
  } as unknown as Request
}

const MEMBER = { userId: 'u1', role: 'MEMBER', isLegacyAdmin: false }
import { PATCH } from '../src/app/api/decks/[id]/route'
const params = { params: Promise.resolve({ id: 'd1' }) }

describe('PATCH /api/decks/[id] (rename)', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockDeckFindFirst.mockReset()
    mockDeckUpdate.mockReset(); mockGPFindMany.mockReset(); mockGPUpdateMany.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Old Name', ownerUserId: 'u1' })
    mockDeckFindFirst.mockResolvedValue(null)
  })

  it('renames the deck and propagates the new name to matching game participants', async () => {
    mockDeckUpdate.mockResolvedValue({ id: 'd1', name: 'New Name' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', gameId: 'g1', deckName: 'Old Name' },
      { id: 'p2', gameId: 'g2', deckName: 'old name' },
      { id: 'p3', gameId: 'g3', deckName: 'Other' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    const res: any = await PATCH(makeRequest({ name: 'New Name' }), params)
    expect(mockDeckUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { name: 'New Name' } })
    expect(mockGPUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] } }, data: { deckName: 'New Name' } })
    expect(res.body).toEqual({ deck: { id: 'd1', name: 'New Name' }, renamedGames: 2 })
  })

  it('403s a non-owner; 404s a missing deck; 400s an empty name', async () => {
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    expect(((await PATCH(makeRequest({ name: 'X' }), params)) as any).status).toBe(403)
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await PATCH(makeRequest({ name: 'X' }), params)) as any).status).toBe(404)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Old Name', ownerUserId: 'u1' })
    expect(((await PATCH(makeRequest({ name: '   ' }), params)) as any).status).toBe(400)
  })

  it('409s when the owner already has another deck with that name', async () => {
    mockDeckFindFirst.mockResolvedValue({ id: 'd2' })
    const res: any = await PATCH(makeRequest({ name: 'Existing' }), params)
    expect(res.status).toBe(409)
    expect(mockDeckUpdate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx jest tests/deck-rename-api.test.ts` → FAIL (`PATCH` not exported).

- [ ] **Step 3: Add `PATCH`** to `src/app/api/decks/[id]/route.ts`. Add imports (`z` and `matchDeckParticipants`; `normalizeName` is exported from reconcile):

```ts
import { z } from 'zod';
import { matchDeckParticipants, normalizeName } from '@/lib/reconcile';
```

```ts
const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (deck.ownerUserId === null || deck.ownerUserId !== session.userId) {
      return NextResponse.json({ error: 'Only the deck owner can rename it' }, { status: 403 });
    }

    const { name } = renameSchema.parse(await request.json());
    const oldName = deck.name;

    // Block renaming onto another of the user's decks (a same-name self-rename,
    // i.e. only case/spacing changed, is allowed and rewrites history spelling).
    const clash = await prisma.deck.findFirst({
      where: { ownerUserId: session.userId, id: { not: id }, name },
    });
    if (clash) {
      return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
    }

    const parts = await prisma.gameParticipant.findMany({
      where: { deckName: { not: null } },
      select: { id: true, gameId: true, deckName: true },
    });
    const { ids, gameCount } = matchDeckParticipants(parts, oldName);

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deck.update({ where: { id }, data: { name } });
      if (ids.length > 0) {
        await tx.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { deckName: name } });
      }
      return d;
    });

    return NextResponse.json({ deck: { id: updated.id, name: updated.name }, renamedGames: gameCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PATCH /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to rename deck' }, { status: 500 });
  }
}
```

Note: the 409 `findFirst` uses an exact `name` match (Prisma SQLite is case-sensitive by default), which is sufficient for blocking an exact duplicate; the `normalizeName` import is used only if needed — if unused after writing, drop it from the import to avoid a lint error.

- [ ] **Step 4: Run to verify it passes** — `npx jest tests/deck-rename-api.test.ts` → PASS.

- [ ] **Step 5: Inline rename UI** in `src/app/decks/[id]/page.tsx`. Add rename state near the other `useState`s:

```tsx
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
```

Add a rename handler (after `mutateCards`):

```tsx
  const renameDeck = async () => {
    const next = nameDraft.trim();
    if (!next || next === deck?.name) { setEditingName(false); return; }
    setError("");
    const res = await fetch(`/api/decks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to rename deck");
      return;
    }
    setEditingName(false);
    await loadDeck();
  };
```

Replace the title `<h1>{deck.name}</h1>` with an owner-editable version:

```tsx
        {deck.isOwner && editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); renameDeck(); }
              if (e.key === "Escape") setEditingName(false);
            }}
            onBlur={renameDeck}
            maxLength={100}
            className="text-3xl bg-background border border-accent rounded px-2 py-0.5 text-foreground"
          />
        ) : (
          <h1
            className={`text-3xl ${deck.isOwner ? "cursor-pointer hover:text-accent" : ""}`}
            onClick={() => { if (deck.isOwner) { setNameDraft(deck.name); setEditingName(true); } }}
            title={deck.isOwner ? "Click to rename" : undefined}
          >
            {deck.name}
          </h1>
        )}
```

- [ ] **Step 6: Build check** — `npm run build` → succeeds.

---

## Task 5: Feature 3 — Moxfield card import into a deck

**Files:**
- Create: `src/app/api/decks/[id]/import/route.ts`
- Modify: `src/app/decks/[id]/page.tsx` (import panel)
- Test: `tests/deck-card-import-api.test.ts` (new)

- [ ] **Step 1: Write failing tests** — create `tests/deck-card-import-api.test.ts`:

```ts
const mockDeckFindUnique = jest.fn()
const mockCollectionFindMany = jest.fn()
const mockDeckCardFindMany = jest.fn()
const mockUpsert = jest.fn()
const mockCollectionCreateMany = jest.fn()
const tx = {
  collectionCard: { createMany: (...a: unknown[]) => mockCollectionCreateMany(...a) },
  deckCard: { upsert: (...a: unknown[]) => mockUpsert(...a) },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findUnique: (...a: unknown[]) => mockDeckFindUnique(...a) },
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deckCard: { findMany: (...a: unknown[]) => mockDeckCardFindMany(...a) },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))
const mockResolveCards = jest.fn()
jest.mock('@/lib/scryfall', () => {
  const actual = jest.requireActual('@/lib/scryfall')
  return { ...actual, resolveCards: (...a: unknown[]) => mockResolveCards(...a) }
})
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
}))
const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))

let ipCounter = 0
function makeRequest(body?: Record<string, unknown>): Request {
  ipCounter += 1
  return {
    json: async () => body ?? {},
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) },
  } as unknown as Request
}
const MEMBER = { userId: 'u1', role: 'MEMBER', isLegacyAdmin: false }
import { POST } from '../src/app/api/decks/[id]/import/route'
import { scryfallKey } from '@/lib/scryfall'
const params = { params: Promise.resolve({ id: 'd1' }) }

describe('POST /api/decks/[id]/import', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockCollectionFindMany.mockReset()
    mockDeckCardFindMany.mockReset(); mockUpsert.mockReset(); mockCollectionCreateMany.mockReset(); mockResolveCards.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', name: 'Krenko', ownerUserId: 'u1' })
    mockDeckCardFindMany.mockResolvedValue([])
  })

  it('dryRun lists missing without writing', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(makeRequest({ text: '1 Sol Ring (C21) 263\n1 Black Lotus (LEA) 232', dryRun: true }), params)
    expect(res.body.missing).toEqual([{ line: 2, cardName: 'Black Lotus', set: 'LEA', collectorNumber: '232' }])
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('commit upserts library cards into the deck with their printing', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(
      makeRequest({ text: '2 Sol Ring (C21) 263', dryRun: false, addMissingToLibrary: false }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_cardName: { deckId: 'd1', cardName: 'Sol Ring' } },
        update: { quantity: { increment: 2 } },
        create: expect.objectContaining({ deckId: 'd1', cardName: 'Sol Ring', quantity: 2, set: 'C21', collectorNumber: '263' }),
      })
    )
  })

  it('400s commit when cards are missing and addMissingToLibrary is omitted', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await POST(makeRequest({ text: '1 Black Lotus (LEA) 232', dryRun: false }), params)
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('addMissingToLibrary=true resolves missing, inserts to library, upserts into deck', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    mockResolveCards.mockResolvedValue({
      found: new Map([[scryfallKey('LEA', '232'), { name: 'Black Lotus', scryfallId: 's1', set: 'lea', setName: 'LEA', typeLine: 'Artifact', collectorNumber: '232' }]]),
      notFound: [],
    })
    const res: any = await POST(makeRequest({ text: '1 Black Lotus (LEA) 232', dryRun: false, addMissingToLibrary: true }), params)
    expect(res.status).toBe(200)
    expect(res.body.addedToLibrary).toBe(1)
    expect(mockCollectionCreateMany).toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ cardName: 'Black Lotus' }) }))
  })

  it('basics import without library membership; 403s non-owners', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    const ok: any = await POST(makeRequest({ text: '5 Plains (FDN) 269', dryRun: false, addMissingToLibrary: false }), params)
    expect(ok.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ cardName: 'Plains', quantity: 5 }) }))
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    expect(((await POST(makeRequest({ text: '1 Plains', dryRun: false }), params)) as any).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx jest tests/deck-card-import-api.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/app/api/decks/[id]/import/route.ts`:**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { parseMoxfieldText, buildLibraryNameIndex, normalizeCardName, type ParsedMoxfieldCard } from '@/lib/parseMoxfield';
import { classifyMoxfieldCards, resolveMissingToLibrary } from '@/lib/deckImport';

const importSchema = z.object({
  text: z.string().min(1).max(100_000),
  dryRun: z.boolean().default(false),
  addMissingToLibrary: z.boolean().optional(),
});

interface DeckCardDraft {
  cardName: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (deck.ownerUserId === null || deck.ownerUserId !== session.userId) {
      return NextResponse.json({ error: 'Only the deck owner can import cards' }, { status: 403 });
    }

    const { text, dryRun, addMissingToLibrary } = importSchema.parse(await request.json());

    const { cards, errors } = parseMoxfieldText(text);
    const lib = await prisma.collectionCard.findMany({
      where: { userId: session.userId },
      select: { cardName: true },
    });
    const libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
    const { present, missing, basics } = classifyMoxfieldCards(cards, libIndex);

    if (dryRun) {
      return NextResponse.json({
        cards: cards.map((c) => ({ line: c.line, quantity: c.quantity, name: c.name, set: c.set ?? null, collectorNumber: c.collectorNumber ?? null, isFoil: c.isFoil })),
        missing: missing.map((c) => ({ line: c.line, cardName: c.name, set: c.set ?? null, collectorNumber: c.collectorNumber ?? null })),
        errors,
      });
    }

    if (missing.length > 0 && typeof addMissingToLibrary !== 'boolean') {
      return NextResponse.json(
        { error: 'addMissingToLibrary is required when cards are missing from your library' },
        { status: 400 }
      );
    }

    // Merge duplicate names (different printings) — quantities sum, first printing wins.
    const drafts = new Map<string, DeckCardDraft>();
    const addDraft = (cardName: string, c: ParsedMoxfieldCard) => {
      const key = normalizeCardName(cardName);
      const existing = drafts.get(key);
      if (existing) existing.quantity += c.quantity;
      else drafts.set(key, { cardName, quantity: c.quantity, set: c.set, collectorNumber: c.collectorNumber, isFoil: c.isFoil });
    };
    for (const { card, canonical } of present) addDraft(canonical, card);
    for (const card of basics) addDraft(card.name, card);

    const libraryInserts: Array<Record<string, unknown>> = [];
    let excluded: string[] = [];
    if (missing.length > 0 && addMissingToLibrary) {
      const r = await resolveMissingToLibrary(missing, session.userId);
      if (!r.ok) {
        return NextResponse.json(
          r.cards.length ? { error: r.error, cards: r.cards } : { error: r.error },
          { status: r.status }
        );
      }
      libraryInserts.push(...r.libraryInserts);
      for (const { card, name } of r.resolved) addDraft(name, card);
    } else if (missing.length > 0) {
      excluded = missing.map((c) => c.name);
    }

    await prisma.$transaction(async (tx) => {
      if (libraryInserts.length > 0) {
        await tx.collectionCard.createMany({ data: libraryInserts as never });
      }
      for (const d of drafts.values()) {
        await tx.deckCard.upsert({
          where: { deckId_cardName: { deckId: id, cardName: d.cardName } },
          update: { quantity: { increment: d.quantity } },
          create: { deckId: id, cardName: d.cardName, quantity: d.quantity, set: d.set, collectorNumber: d.collectorNumber, isFoil: d.isFoil },
        });
      }
    });

    const updated = await prisma.deckCard.findMany({ where: { deckId: id }, orderBy: { cardName: 'asc' } });
    return NextResponse.json({
      cards: updated.map((c) => ({ cardName: c.cardName, quantity: c.quantity, set: c.set, collectorNumber: c.collectorNumber, isFoil: c.isFoil })),
      addedToLibrary: libraryInserts.length,
      excluded,
      errors,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks/[id]/import error:', error);
    return NextResponse.json({ error: 'Failed to import cards' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx jest tests/deck-card-import-api.test.ts` → PASS.

- [ ] **Step 5: Import panel UI** in `src/app/decks/[id]/page.tsx`. Add state:

```tsx
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMissing, setImportMissing] = useState<{ cardName: string }[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
```

Add the import runner (after `renameDeck`):

```tsx
  const runImport = async (body: Record<string, unknown>) => {
    setImportBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/decks/${id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(data.cards) ? `: ${data.cards.join(", ")}` : "";
        setError(`${typeof data.error === "string" ? data.error : "Import failed"}${detail}`);
        return;
      }
      if (body.dryRun) {
        if (Array.isArray(data.missing) && data.missing.length > 0) setImportMissing(data.missing);
        else await runImport({ dryRun: false, addMissingToLibrary: false });
        return;
      }
      setShowImport(false); setImportText(""); setImportMissing(null);
      await loadDeck();
    } finally {
      setImportBusy(false);
    }
  };
```

Add a "Moxfield Import" panel just above the existing `Add from your library` block (owner-only):

```tsx
      {deck.isOwner && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg">Moxfield Import</h2>
            <button onClick={() => setShowImport((v) => !v)} className="text-sm text-accent hover:underline cursor-pointer">
              {showImport ? "Cancel" : "Paste a list"}
            </button>
          </div>
          {showImport && (
            <div className="space-y-3">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"1 Sol Ring (C21) 263\n2 Treasure Vault (AFR) 261 *F*"}
                className="w-full h-40 p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm"
              />
              {importMissing === null ? (
                <button
                  onClick={() => runImport({ dryRun: true })}
                  disabled={importBusy || importText.trim().length === 0}
                  className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                >
                  {importBusy ? "Checking…" : "Import"}
                </button>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-amber-400 font-medium">
                    {importMissing.length} card{importMissing.length !== 1 ? "s are" : " is"} not in your library:
                  </p>
                  <pre className="text-xs text-foreground/80 max-h-40 overflow-auto whitespace-pre-wrap">
                    {importMissing.map((m) => m.cardName).join("\n")}
                  </pre>
                  <div className="flex gap-2">
                    <button onClick={() => runImport({ dryRun: false, addMissingToLibrary: true })} disabled={importBusy} className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer">
                      Yes — add to library
                    </button>
                    <button onClick={() => runImport({ dryRun: false, addMissingToLibrary: false })} disabled={importBusy} className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover disabled:opacity-50 cursor-pointer">
                      No — import without them
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 6: Build check** — `npm run build` → succeeds.

---

## Task 6: Feature 4 — owned-deck tier follows the selected player

**Files:**
- Modify: `src/app/api/decks/route.ts` (add `decksByOwner`)
- Modify: `src/lib/deckTiers.ts` (`playerDecks` param + `'Owned decks'` label)
- Modify: `src/app/games/game-form.tsx` (tier by selected player)
- Test: `tests/decks-by-owner.test.ts` (new), `tests/tiered-decks.test.ts` (update), `tests/game-form-deck-tiers.test.ts` (new)

- [ ] **Step 1: Update `deckTiers` test** — in `tests/tiered-decks.test.ts`, change every expected label `'User decks'` to `'Owned decks'` (the tier logic and call signature are otherwise unchanged — first arg is now the selected player's decks).

- [ ] **Step 2: Update `src/lib/deckTiers.ts`** — rename the first param and the label:

```ts
export interface DeckTierGroup {
  label: 'Owned decks' | 'Borrowed decks'
  items: string[]
}

export function tieredDeckItems(
  playerDecks: string[],
  otherDecks: string[],
  input: string
): DeckTierGroup[] {
  const q = input.trim().toLowerCase()
  const owned = Array.from(new Set(playerDecks))
  const ownedMatches = owned.filter((d) => d.toLowerCase().includes(q))
  if (ownedMatches.length > 0) {
    return [{ label: 'Owned decks', items: owned }]
  }
  const ownedSet = new Set(owned.map((d) => d.toLowerCase()))
  const borrowed = Array.from(new Set(otherDecks)).filter((d) => !ownedSet.has(d.toLowerCase()))
  return [{ label: 'Borrowed decks', items: borrowed }]
}
```

Also update the comment header to say the tiers are relative to the selected player. Run `npx jest tests/tiered-decks.test.ts` → PASS.

- [ ] **Step 3: Write failing `decksByOwner` test** — create `tests/decks-by-owner.test.ts`:

```ts
const mockDeckFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({ prisma: { deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a) } } }))
jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })) },
}))
const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))
let ipCounter = 0
function makeRequest(): Request {
  ipCounter += 1
  return { headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) } } as unknown as Request
}
import { GET } from '../src/app/api/decks/route'

describe('GET /api/decks decksByOwner', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockDeckFindMany.mockReset(); mockGetSession.mockResolvedValue({ userId: 'u1', role: 'MEMBER', isLegacyAdmin: false }) })

  it('groups owned decks by owner name (ownerless excluded)', async () => {
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', owner: { name: 'Me' }, cards: [] },
      { id: 'd2', name: 'Shart', ownerUserId: 'u2', owner: { name: 'Francisco' }, cards: [] },
      { id: 'd3', name: 'Slivers', ownerUserId: 'u2', owner: { name: 'Francisco' }, cards: [] },
      { id: 'd4', name: 'Legacy', ownerUserId: null, owner: null, cards: [] },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.decksByOwner).toEqual([
      { ownerName: 'Me', deckNames: ['Krenko'] },
      { ownerName: 'Francisco', deckNames: ['Shart', 'Slivers'] },
    ])
  })
})
```

- [ ] **Step 4: Run to verify it fails** — `npx jest tests/decks-by-owner.test.ts` → FAIL (`decksByOwner` undefined).

- [ ] **Step 5: Add `decksByOwner`** to `src/app/api/decks/route.ts`. Before the `return`, build the grouping and include it:

```ts
    const byOwner = new Map<string, { ownerName: string; deckNames: string[] }>();
    for (const d of decks) {
      if (!d.ownerUserId) continue;
      const ownerName = d.owner?.name ?? '';
      const entry = byOwner.get(ownerName) ?? { ownerName, deckNames: [] };
      entry.deckNames.push(d.name);
      byOwner.set(ownerName, entry);
    }
    return NextResponse.json({
      userDecks,
      otherDecks,
      decksByOwner: Array.from(byOwner.values()),
      isLegacyAdmin: session.isLegacyAdmin,
    });
```

(The `decks` query is `orderBy: { name: 'asc' }`, so `deckNames` come out name-sorted; ownerName insertion order follows first appearance.) Run `npx jest tests/decks-by-owner.test.ts` → PASS.

- [ ] **Step 6: Write failing game-form tiering test** — create `tests/game-form-deck-tiers.test.ts`. Extract the per-row tiering into a tiny exported pure helper so it is unit-testable. First add to `src/app/games/game-form.tsx` (near `excludeItemsForRow`):

```ts
export function deckGroupsForRow(
  playerName: string,
  decksByOwner: { ownerName: string; deckNames: string[] }[],
  allDeckNames: string[],
  input: string
) {
  const key = playerName.trim().toLowerCase();
  const owned = decksByOwner.find((o) => o.ownerName.trim().toLowerCase() === key)?.deckNames ?? [];
  const ownedSet = new Set(owned.map((d) => d.toLowerCase()));
  const others = allDeckNames.filter((d) => !ownedSet.has(d.toLowerCase()));
  return tieredDeckItems(owned, others, input);
}
```

Then the test:

```ts
import { deckGroupsForRow } from '@/app/games/game-form'

describe('deckGroupsForRow', () => {
  const decksByOwner = [
    { ownerName: 'Francisco', deckNames: ['Shart', 'Slivers'] },
    { ownerName: 'Me', deckNames: ['Krenko'] },
  ]
  const all = ['Shart', 'Slivers', 'Krenko', 'Goblins']

  it('surfaces the selected player\'s decks as the Owned tier', () => {
    const groups = deckGroupsForRow('francisco', decksByOwner, all, 'sh')
    expect(groups).toEqual([{ label: 'Owned decks', items: ['Shart', 'Slivers'] }])
  })

  it('falls back to Borrowed (all decks) when the player owns none / is unknown', () => {
    const groups = deckGroupsForRow('Nobody', decksByOwner, all, '')
    expect(groups[0].label).toBe('Borrowed decks')
    expect(groups[0].items).toEqual(['Shart', 'Slivers', 'Krenko', 'Goblins'])
  })
})
```

- [ ] **Step 7: Run to verify it fails** — `npx jest tests/game-form-deck-tiers.test.ts` → FAIL (`deckGroupsForRow` not exported).

- [ ] **Step 8: Wire the game form.** In `src/app/games/game-form.tsx`:
  - Add `deckGroupsForRow` (Step 6 code) if not yet added.
  - Add state `const [decksByOwner, setDecksByOwner] = useState<{ ownerName: string; deckNames: string[] }[]>([]);` and keep `userDeckNames`/`otherDeckNames`.
  - In the `/api/decks` fetch handler, also `setDecksByOwner(Array.isArray(data.decksByOwner) ? data.decksByOwner : []);`.
  - Compute `const allDeckNames = useMemo(() => [...userDeckNames, ...otherDeckNames], [userDeckNames, otherDeckNames]);` (add `useMemo` to the React import).
  - Replace the deck Combobox `groups` prop:

```tsx
            <Combobox
              groups={deckGroupsForRow(r.playerName, decksByOwner, allDeckNames, r.deckName)}
              value={r.deckName}
              onChange={(v) => updateRow(i, { deckName: v })}
              placeholder="Deck (optional)"
              addLabel="deck"
            />
```

- [ ] **Step 9: Run to verify it passes** — `npx jest tests/game-form-deck-tiers.test.ts` → PASS. Then `npm run build` → succeeds.

---

## Task 7: Full verification + single bundled commit

**Files:** none (verification + commit)

- [ ] **Step 1:** `npx jest` → all suites pass (new + existing, no regressions).
- [ ] **Step 2:** `npm run build` → succeeds; new route `/api/decks/[id]/import` and the admin DELETE register.
- [ ] **Step 3:** Confirm the file list + message with the user, then ONE bundled commit (code + spec + plan). Do not push. Suggested message:

```
feat(decks): admin delete, owner rename, per-deck Moxfield import, player-scoped tiers

- Admin can delete any deck; matching games are detached (deckName nulled,
  player kept) after a game-count warning.
- Owners can rename a deck; the new name propagates to game history.
- Owners can paste a Moxfield list into a deck to add specific printings in
  bulk (two-phase, shares logic with the deck-create import).
- The game-form deck dropdown's "owned" tier now follows the selected player.
No schema change.
```

---

## Self-Review

**1. Spec coverage:**
- `matchDeckParticipants` (shared) → Task 1; used by admin DELETE (Task 3) and rename PATCH (Task 4). ✓
- `deckImport.ts` extraction + create-import refactor → Task 2; reused by per-deck import (Task 5). ✓
- F1 admin delete + gameCount + DecksSection button → Task 3. ✓
- F2 rename PATCH + propagation + inline UI → Task 4. ✓
- F3 per-deck import (dryRun/commit/missing/basics/owner-only) + panel → Task 5. ✓
- F4 `decksByOwner` + `tieredDeckItems` relabel + game-form wiring → Task 6. ✓
- Zero migration; bundled commit → Task 7. ✓

**2. Placeholder scan:** every code step has complete code; no TBD/TODO. UI edits give exact insertion points + code.

**3. Type consistency:** `matchDeckParticipants` returns `{ ids, gameCount }`, consumed identically in Tasks 3 & 4. `classifyMoxfieldCards`/`resolveMissingToLibrary` signatures match both consumers. `decksByOwner` shape `{ ownerName, deckNames }[]` matches the game-form helper and the test. `DeckTierGroup.label` union updated to `'Owned decks' | 'Borrowed decks'` and reflected in the tiered-decks test update. `deckGroupsForRow` exported from `game-form.tsx` for unit testing and used by the deck Combobox.
