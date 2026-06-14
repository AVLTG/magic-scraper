# Admin Deck/Player Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a zero-migration tool to bridge string-based game history with the normalized `Deck`/`User` tables — surfacing unmatched deck/player names and letting the admin link them (rename history) or create rows.

**Architecture:** Pure logic in `src/lib/reconcile.ts` computes the unmatched lists from plain rows (no DB). Three admin API routes (`GET /api/admin/reconcile`, `POST /api/admin/reconcile/decks`, `POST /api/admin/reconcile/players`) handle reads and the `link`/`create`/`createAll` actions. Two client components under `src/app/admin/` render the panels. Linking is a one-directional rename of `GameParticipant.deckName`/`playerName`; stats (already name-keyed) re-attribute automatically. **No Prisma schema change.**

**Tech Stack:** Next.js 16 App Router, Prisma 6 + libsql (Turso/SQLite), Jest, React client components, Tailwind.

**Commit policy (overrides per-task commits):** We are on `master` and the user wants few, bundled commits. Implementer subagents must **NOT commit** per task. After all tasks pass, a single final task commits everything — the new code, the spec, and this plan — as one (or, if the user prefers, code + docs as two) commit(s), confirmed with the user first.

---

## File Structure

- **Create** `src/lib/reconcile.ts` — pure helpers `normalizeName`, `computeUnlinkedDecks`, `computeUnlinkedPlayers`. One responsibility: derive unmatched-name lists from participant/deck/user rows. No DB.
- **Create** `src/app/api/admin/reconcile/route.ts` — `GET`: returns both unlinked lists.
- **Create** `src/app/api/admin/reconcile/decks/route.ts` — `POST`: `link`/`create`/`createAll` for decks.
- **Create** `src/app/api/admin/reconcile/players/route.ts` — `POST`: `link`/`create`/`createAll` for players.
- **Create** `src/app/admin/unlinked-decks-section.tsx` — client panel for unlinked decks.
- **Create** `src/app/admin/unlinked-players-section.tsx` — client panel for unlinked players.
- **Modify** `src/app/admin/page.tsx` — mount the two new sections after `<DecksSection />`.
- **Create** `tests/reconcile.test.ts` — unit tests for the pure logic.
- **Create** `tests/admin-reconcile-api.test.ts` — handler tests for all three routes (mocked Prisma + `requireAdmin`).

Conventions to follow (verified in the codebase):
- Admin routes guard with `const auth = await requireAdmin(); if (!auth.ok) return auth.response;` (see `src/app/api/admin/users/route.ts`).
- Route tests mock `@/lib/session` → `requireAdmin`, mock `next/server` → `NextResponse.json` returning `{ body, status }`, mock `@/lib/prisma` (see `tests/admin-sync.test.ts`, `tests/admin-users.test.ts`).
- UI panels mirror `src/app/admin/decks-section.tsx` (fetch in `useEffect`, `Array.isArray` guards, Tailwind classes, `/api/admin/users` returns a **bare array**, `/api/admin/decks` returns `{ decks: [...] }`).

---

## Task 1: Pure reconciliation logic

**Files:**
- Create: `src/lib/reconcile.ts`
- Test: `tests/reconcile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reconcile.test.ts`:

```ts
import { computeUnlinkedDecks, computeUnlinkedPlayers, normalizeName } from '@/lib/reconcile'

const P = (gameId: string, playerName: string, deckName: string | null, isRandom = false) => ({
  gameId,
  playerName,
  deckName,
  isRandom,
})

describe('computeUnlinkedDecks', () => {
  it('returns distinct deckNames with no case-insensitive match to existing decks', () => {
    const parts = [P('g1', 'Al', 'Anikthea'), P('g2', 'Bo', 'anikthea '), P('g3', 'Cy', 'Sliver Swarm')]
    expect(computeUnlinkedDecks(parts, ['Sliver Swarm'])).toEqual([{ name: 'Anikthea', gameCount: 2 }])
  })

  it('skips null/empty/whitespace deckNames', () => {
    const parts = [P('g1', 'Al', null), P('g2', 'Bo', '   '), P('g3', 'Cy', '')]
    expect(computeUnlinkedDecks(parts, [])).toEqual([])
  })

  it('counts distinct games, not participant rows', () => {
    const parts = [P('g1', 'Al', 'Goblins'), P('g1', 'Bo', 'Goblins'), P('g2', 'Cy', 'Goblins')]
    expect(computeUnlinkedDecks(parts, [])).toEqual([{ name: 'Goblins', gameCount: 2 }])
  })

  it('sorts by name', () => {
    const parts = [P('g1', 'Al', 'Zoo'), P('g2', 'Bo', 'Affinity')]
    expect(computeUnlinkedDecks(parts, []).map((d) => d.name)).toEqual(['Affinity', 'Zoo'])
  })
})

describe('computeUnlinkedPlayers', () => {
  it('returns distinct non-random playerNames with no match to existing users', () => {
    const parts = [P('g1', 'Dave', null), P('g2', 'dave ', null), P('g3', 'Erin', null)]
    expect(computeUnlinkedPlayers(parts, ['Erin'])).toEqual([{ name: 'Dave', gameCount: 2 }])
  })

  it('excludes random players', () => {
    const parts = [P('g1', 'Random', null, true), P('g2', 'Frank', null)]
    expect(computeUnlinkedPlayers(parts, []).map((p) => p.name)).toEqual(['Frank'])
  })
})

describe('normalizeName', () => {
  it('trims and lowercases', () => {
    expect(normalizeName('  Foo Bar ')).toBe('foo bar')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/reconcile.test.ts`
Expected: FAIL — `Cannot find module '@/lib/reconcile'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reconcile.ts`:

```ts
// Pure reconciliation logic for the admin deck/player linking tool.
// Game history references decks/players by string (GameParticipant.deckName /
// .playerName) with no FK. These helpers surface the distinct history names with
// no matching Deck/User row so the admin can link (rename history) or create the
// row. No DB access — callers pass plain rows.

export interface ParticipantRef {
  gameId: string
  playerName: string
  deckName: string | null
  isRandom: boolean
}

export interface UnlinkedEntry {
  name: string
  gameCount: number
}

export const normalizeName = (s: string): string => s.trim().toLowerCase()

function collect(
  refs: Array<{ raw: string | null | undefined; gameId: string }>,
  existingNames: string[]
): UnlinkedEntry[] {
  const existing = new Set(existingNames.map(normalizeName))
  const groups = new Map<string, { name: string; games: Set<string> }>()
  for (const { raw, gameId } of refs) {
    const trimmed = raw?.trim()
    if (!trimmed) continue
    const key = normalizeName(trimmed)
    if (existing.has(key)) continue
    let g = groups.get(key)
    if (!g) {
      g = { name: trimmed, games: new Set() }
      groups.set(key, g)
    }
    g.games.add(gameId)
  }
  return [...groups.values()]
    .map((g) => ({ name: g.name, gameCount: g.games.size }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function computeUnlinkedDecks(
  participants: ParticipantRef[],
  deckNames: string[]
): UnlinkedEntry[] {
  return collect(
    participants.map((p) => ({ raw: p.deckName, gameId: p.gameId })),
    deckNames
  )
}

export function computeUnlinkedPlayers(
  participants: ParticipantRef[],
  userNames: string[]
): UnlinkedEntry[] {
  return collect(
    participants.filter((p) => !p.isRandom).map((p) => ({ raw: p.playerName, gameId: p.gameId })),
    userNames
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/reconcile.test.ts`
Expected: PASS (8 tests).

---

## Task 2: `GET /api/admin/reconcile`

**Files:**
- Create: `src/app/api/admin/reconcile/route.ts`
- Test: `tests/admin-reconcile-api.test.ts` (shared by Tasks 2–4)

- [ ] **Step 1: Write the failing test**

Create `tests/admin-reconcile-api.test.ts`:

```ts
const mockGPFindMany = jest.fn()
const mockGPUpdateMany = jest.fn()
const mockDeckFindMany = jest.fn()
const mockDeckFindUnique = jest.fn()
const mockDeckCreate = jest.fn()
const mockDeckCreateMany = jest.fn()
const mockUserFindMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockUserCreate = jest.fn()
const mockUserCreateMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameParticipant: {
      findMany: (...a: unknown[]) => mockGPFindMany(...a),
      updateMany: (...a: unknown[]) => mockGPUpdateMany(...a),
    },
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      create: (...a: unknown[]) => mockDeckCreate(...a),
      createMany: (...a: unknown[]) => mockDeckCreateMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      create: (...a: unknown[]) => mockUserCreate(...a),
      createMany: (...a: unknown[]) => mockUserCreateMany(...a),
    },
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
  NextRequest: jest.fn(),
}))

const mockRequireAdmin = jest.fn()
jest.mock('@/lib/session', () => ({ requireAdmin: (...a: unknown[]) => mockRequireAdmin(...a) }))

import { GET } from '@/app/api/admin/reconcile/route'

const ADMIN_OK = { ok: true, session: { userId: 'a', role: 'ADMIN', isLegacyAdmin: false } }
function req(body?: Record<string, unknown>): any {
  return { json: async () => body ?? {} }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(ADMIN_OK)
})

describe('GET /api/admin/reconcile', () => {
  it('returns the unlinked deck and player lists', async () => {
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', playerName: 'Dave', deckName: 'Anikthea', isRandom: false },
      { gameId: 'g2', playerName: 'Erin', deckName: 'Sliver Swarm', isRandom: false },
    ])
    mockDeckFindMany.mockResolvedValue([{ name: 'Sliver Swarm' }])
    mockUserFindMany.mockResolvedValue([{ name: 'Erin' }])
    const res: any = await GET()
    expect(res.body.unlinkedDecks).toEqual([{ name: 'Anikthea', gameCount: 1 }])
    expect(res.body.unlinkedPlayers).toEqual([{ name: 'Dave', gameCount: 1 }])
  })

  it('403s a non-admin without querying', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } })
    expect(((await GET()) as any).status).toBe(403)
    expect(mockGPFindMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/admin-reconcile-api.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/admin/reconcile/route'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/admin/reconcile/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { computeUnlinkedDecks, computeUnlinkedPlayers } from '@/lib/reconcile'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const [participants, decks, users] = await Promise.all([
      prisma.gameParticipant.findMany({
        select: { gameId: true, playerName: true, deckName: true, isRandom: true },
      }),
      prisma.deck.findMany({ select: { name: true } }),
      prisma.user.findMany({ select: { name: true } }),
    ])
    return NextResponse.json({
      unlinkedDecks: computeUnlinkedDecks(participants, decks.map((d) => d.name)),
      unlinkedPlayers: computeUnlinkedPlayers(participants, users.map((u) => u.name)),
    })
  } catch (error) {
    console.error('GET /api/admin/reconcile error:', error)
    return NextResponse.json({ error: 'Failed to load reconciliation data' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/admin-reconcile-api.test.ts`
Expected: PASS (2 tests).

---

## Task 3: `POST /api/admin/reconcile/decks`

**Files:**
- Create: `src/app/api/admin/reconcile/decks/route.ts`
- Test: `tests/admin-reconcile-api.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/admin-reconcile-api.test.ts` (add the import beside the existing `GET` import):

```ts
import { POST as decksPOST } from '@/app/api/admin/reconcile/decks/route'

describe('POST /api/admin/reconcile/decks', () => {
  it('link renames exactly the participants whose deckName matches (case-insensitive)', async () => {
    mockDeckFindUnique.mockResolvedValue({ name: 'Anikthea Combo' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', deckName: 'Anikthea' },
      { id: 'p2', deckName: 'anikthea ' },
      { id: 'p3', deckName: 'Goblins' },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    const res: any = await decksPOST(req({ action: 'link', name: 'Anikthea', targetDeckId: 'd1' }))
    expect(mockGPUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      data: { deckName: 'Anikthea Combo' },
    })
    expect(res.body).toEqual({ renamed: 2 })
  })

  it('link 404s when the target deck is missing', async () => {
    mockDeckFindUnique.mockResolvedValue(null)
    const res: any = await decksPOST(req({ action: 'link', name: 'X', targetDeckId: 'ghost' }))
    expect(res.status).toBe(404)
    expect(mockGPUpdateMany).not.toHaveBeenCalled()
  })

  it('create inserts an unassigned name-only deck', async () => {
    mockDeckCreate.mockResolvedValue({ id: 'd9', name: 'New Deck', ownerUserId: null })
    const res: any = await decksPOST(req({ action: 'create', name: '  New Deck ' }))
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'New Deck', ownerUserId: null } })
    expect(res.status).toBe(201)
  })

  it('create with an owner verifies the user (400 if missing, inserts if present)', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)
    expect(((await decksPOST(req({ action: 'create', name: 'X', ownerUserId: 'ghost' }))) as any).status).toBe(400)
    mockUserFindUnique.mockResolvedValueOnce({ id: 'u1' })
    mockDeckCreate.mockResolvedValue({ id: 'd9', name: 'X', ownerUserId: 'u1' })
    const res: any = await decksPOST(req({ action: 'create', name: 'X', ownerUserId: 'u1' }))
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'X', ownerUserId: 'u1' } })
    expect(res.status).toBe(201)
  })

  it('createAll creates only the unmatched deck names (idempotent)', async () => {
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', playerName: 'Al', deckName: 'Anikthea', isRandom: false },
      { gameId: 'g2', playerName: 'Bo', deckName: 'Existing', isRandom: false },
    ])
    mockDeckFindMany.mockResolvedValue([{ name: 'Existing' }])
    mockDeckCreateMany.mockResolvedValue({ count: 1 })
    const res: any = await decksPOST(req({ action: 'createAll' }))
    expect(mockDeckCreateMany).toHaveBeenCalledWith({ data: [{ name: 'Anikthea' }] })
    expect(res.body).toEqual({ created: 1 })
  })

  it('unknown action 400s; non-admin 403s without mutating', async () => {
    expect(((await decksPOST(req({ action: 'bogus' }))) as any).status).toBe(400)
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } })
    expect(((await decksPOST(req({ action: 'createAll' }))) as any).status).toBe(403)
    expect(mockDeckCreateMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/admin-reconcile-api.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/admin/reconcile/decks/route'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/admin/reconcile/decks/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { computeUnlinkedDecks, normalizeName } from '@/lib/reconcile'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const action = body?.action

    if (action === 'link') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const targetDeckId = typeof body.targetDeckId === 'string' ? body.targetDeckId : ''
      if (!name || !targetDeckId) {
        return NextResponse.json({ error: 'name and targetDeckId are required' }, { status: 400 })
      }
      const target = await prisma.deck.findUnique({ where: { id: targetDeckId }, select: { name: true } })
      if (!target) return NextResponse.json({ error: 'Target deck not found' }, { status: 404 })
      const key = normalizeName(name)
      const parts = await prisma.gameParticipant.findMany({
        where: { deckName: { not: null } },
        select: { id: true, deckName: true },
      })
      const ids = parts.filter((p) => p.deckName && normalizeName(p.deckName) === key).map((p) => p.id)
      if (ids.length) {
        await prisma.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { deckName: target.name } })
      }
      return NextResponse.json({ renamed: ids.length })
    }

    if (action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
      const ownerUserId = typeof body.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : null
      if (ownerUserId) {
        const user = await prisma.user.findUnique({ where: { id: ownerUserId } })
        if (!user) return NextResponse.json({ error: 'Owner user not found' }, { status: 400 })
      }
      const deck = await prisma.deck.create({ data: { name, ownerUserId } })
      return NextResponse.json(
        { deck: { id: deck.id, name: deck.name, ownerUserId: deck.ownerUserId } },
        { status: 201 }
      )
    }

    if (action === 'createAll') {
      const [participants, decks] = await Promise.all([
        prisma.gameParticipant.findMany({
          select: { gameId: true, playerName: true, deckName: true, isRandom: true },
        }),
        prisma.deck.findMany({ select: { name: true } }),
      ])
      const unlinked = computeUnlinkedDecks(participants, decks.map((d) => d.name))
      if (unlinked.length) {
        await prisma.deck.createMany({ data: unlinked.map((u) => ({ name: u.name })) })
      }
      return NextResponse.json({ created: unlinked.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    console.error('POST /api/admin/reconcile/decks error:', error)
    return NextResponse.json({ error: 'Failed to reconcile deck' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/admin-reconcile-api.test.ts`
Expected: PASS (Task 2 + Task 3 tests).

---

## Task 4: `POST /api/admin/reconcile/players`

**Files:**
- Create: `src/app/api/admin/reconcile/players/route.ts`
- Test: `tests/admin-reconcile-api.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/admin-reconcile-api.test.ts` (add the import beside the others):

```ts
import { POST as playersPOST } from '@/app/api/admin/reconcile/players/route'

describe('POST /api/admin/reconcile/players', () => {
  it('link renames matching non-random participants to the target user name', async () => {
    mockUserFindUnique.mockResolvedValue({ name: 'Dave' })
    mockGPFindMany.mockResolvedValue([
      { id: 'p1', playerName: 'Dave S', isRandom: false },
      { id: 'p2', playerName: 'dave s ', isRandom: false },
      { id: 'p3', playerName: 'Dave S', isRandom: true },
    ])
    mockGPUpdateMany.mockResolvedValue({ count: 2 })
    const res: any = await playersPOST(req({ action: 'link', name: 'Dave S', targetUserId: 'u1' }))
    expect(mockGPUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      data: { playerName: 'Dave' },
    })
    expect(res.body).toEqual({ renamed: 2 })
  })

  it('link 404s when the target user is missing', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res: any = await playersPOST(req({ action: 'link', name: 'X', targetUserId: 'ghost' }))
    expect(res.status).toBe(404)
    expect(mockGPUpdateMany).not.toHaveBeenCalled()
  })

  it('create inserts a placeholder user', async () => {
    mockUserFindMany.mockResolvedValue([{ name: 'Existing' }])
    mockUserCreate.mockResolvedValue({ id: 'u9', name: 'Dave' })
    const res: any = await playersPOST(req({ action: 'create', name: '  Dave ' }))
    expect(mockUserCreate).toHaveBeenCalledWith({ data: { name: 'Dave' } })
    expect(res.status).toBe(201)
  })

  it('create 409s on a duplicate name (case-insensitive) without inserting', async () => {
    mockUserFindMany.mockResolvedValue([{ name: 'Dave' }])
    const res: any = await playersPOST(req({ action: 'create', name: 'dave' }))
    expect(res.status).toBe(409)
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('createAll creates only unmatched, non-random player names (idempotent)', async () => {
    mockGPFindMany.mockResolvedValue([
      { gameId: 'g1', playerName: 'Dave', deckName: null, isRandom: false },
      { gameId: 'g2', playerName: 'Random', deckName: null, isRandom: true },
      { gameId: 'g3', playerName: 'Erin', deckName: null, isRandom: false },
    ])
    mockUserFindMany.mockResolvedValue([{ name: 'Erin' }])
    mockUserCreateMany.mockResolvedValue({ count: 1 })
    const res: any = await playersPOST(req({ action: 'createAll' }))
    expect(mockUserCreateMany).toHaveBeenCalledWith({ data: [{ name: 'Dave' }] })
    expect(res.body).toEqual({ created: 1 })
  })

  it('non-admin 403s without mutating', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } })
    expect(((await playersPOST(req({ action: 'createAll' }))) as any).status).toBe(403)
    expect(mockUserCreateMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/admin-reconcile-api.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/admin/reconcile/players/route'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/admin/reconcile/players/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { computeUnlinkedPlayers, normalizeName } from '@/lib/reconcile'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const action = body?.action

    if (action === 'link') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
      if (!name || !targetUserId) {
        return NextResponse.json({ error: 'name and targetUserId are required' }, { status: 400 })
      }
      const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } })
      if (!target) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
      const key = normalizeName(name)
      const parts = await prisma.gameParticipant.findMany({
        select: { id: true, playerName: true, isRandom: true },
      })
      const ids = parts.filter((p) => !p.isRandom && normalizeName(p.playerName) === key).map((p) => p.id)
      if (ids.length) {
        await prisma.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { playerName: target.name } })
      }
      return NextResponse.json({ renamed: ids.length })
    }

    if (action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
      const key = normalizeName(name)
      const users = await prisma.user.findMany({ select: { name: true } })
      if (users.some((u) => normalizeName(u.name) === key)) {
        return NextResponse.json({ error: 'A user with this name already exists' }, { status: 409 })
      }
      const user = await prisma.user.create({ data: { name } })
      return NextResponse.json({ user: { id: user.id, name: user.name } }, { status: 201 })
    }

    if (action === 'createAll') {
      const [participants, users] = await Promise.all([
        prisma.gameParticipant.findMany({
          select: { gameId: true, playerName: true, deckName: true, isRandom: true },
        }),
        prisma.user.findMany({ select: { name: true } }),
      ])
      const unlinked = computeUnlinkedPlayers(participants, users.map((u) => u.name))
      if (unlinked.length) {
        await prisma.user.createMany({ data: unlinked.map((u) => ({ name: u.name })) })
      }
      return NextResponse.json({ created: unlinked.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    console.error('POST /api/admin/reconcile/players error:', error)
    return NextResponse.json({ error: 'Failed to reconcile player' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/admin-reconcile-api.test.ts`
Expected: PASS (Tasks 2–4 tests, ~14 cases).

---

## Task 5: Unlinked decks UI panel

**Files:**
- Create: `src/app/admin/unlinked-decks-section.tsx`
- Modify: `src/app/admin/page.tsx` (mount after `<DecksSection />`)

No jest test — admin section components are manually verified (consistent with `decks-section.tsx`, which has none). Verification is a clean production build.

- [ ] **Step 1: Create the component**

Create `src/app/admin/unlinked-decks-section.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface UnlinkedEntry { name: string; gameCount: number }
interface AdminDeck { id: string; name: string; ownerName: string | null }

export default function UnlinkedDecksSection() {
  const [items, setItems] = useState<UnlinkedEntry[]>([]);
  const [decks, setDecks] = useState<AdminDeck[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadReconcile = useCallback(async () => {
    const res = await fetch("/api/admin/reconcile");
    if (res.ok) {
      const data = await res.json();
      setItems(Array.isArray(data.unlinkedDecks) ? data.unlinkedDecks : []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const dRes = await fetch("/api/admin/decks");
        if (dRes.ok) {
          const d = await dRes.json();
          setDecks(Array.isArray(d.decks) ? d.decks : []);
        }
        await loadReconcile();
      } catch {
        setStatus("Failed to load reconciliation data");
      }
    })();
  }, [loadReconcile]);

  const post = async (body: object) => {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/reconcile/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setStatus(e.error || "Action failed");
        return;
      }
      await loadReconcile();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">Unlinked game decks</h2>
        <button
          onClick={() => post({ action: "createAll" })}
          disabled={busy || items.length === 0}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Add all as decks
        </button>
      </div>
      <p className="text-sm text-muted mb-4">
        Deck names from game history with no matching deck. Linking renames history to the deck&apos;s name; creating
        makes an unassigned deck you can assign an owner to below.
      </p>
      {status && <p className="text-sm text-red-400 mb-2">{status}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing to reconcile.</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div
              key={it.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{it.name}</span>
                <span className="text-xs text-muted ml-2">
                  {it.gameCount} game{it.gameCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) post({ action: "link", name: it.name, targetDeckId: e.target.value });
                  }}
                  className="px-2 py-1 rounded-md border border-border bg-surface text-foreground text-sm"
                  aria-label={`Link ${it.name} to a deck`}
                >
                  <option value="">Link to deck…</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.ownerName ?? "Unassigned"}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => post({ action: "create", name: it.name })}
                  disabled={busy}
                  className="px-3 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Mount it in the admin page**

In `src/app/admin/page.tsx`, add the import near the existing section imports (top of file):

```tsx
import UnlinkedDecksSection from "./unlinked-decks-section";
```

And render it right after `<DecksSection />`:

```tsx
      {/* Decks section */}
      <DecksSection />

      {/* Unlinked game decks */}
      <UnlinkedDecksSection />
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds; the new route `/api/admin/reconcile` and `/api/admin/reconcile/decks` appear in the route list with no TypeScript/JSX errors.

---

## Task 6: Unlinked players UI panel

**Files:**
- Create: `src/app/admin/unlinked-players-section.tsx`
- Modify: `src/app/admin/page.tsx` (mount after `<UnlinkedDecksSection />`)

No jest test (manual / build verification), as with Task 5.

- [ ] **Step 1: Create the component**

Create `src/app/admin/unlinked-players-section.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface UnlinkedEntry { name: string; gameCount: number }
interface AdminUser { id: string; name: string }

export default function UnlinkedPlayersSection() {
  const [items, setItems] = useState<UnlinkedEntry[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadReconcile = useCallback(async () => {
    const res = await fetch("/api/admin/reconcile");
    if (res.ok) {
      const data = await res.json();
      setItems(Array.isArray(data.unlinkedPlayers) ? data.unlinkedPlayers : []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const uRes = await fetch("/api/admin/users");
        if (uRes.ok) {
          // GET /api/admin/users returns a bare array
          const u = await uRes.json();
          setUsers(Array.isArray(u) ? u : []);
        }
        await loadReconcile();
      } catch {
        setStatus("Failed to load reconciliation data");
      }
    })();
  }, [loadReconcile]);

  const post = async (body: object) => {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/reconcile/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setStatus(e.error || "Action failed");
        return;
      }
      await loadReconcile();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">Unregistered players</h2>
        <button
          onClick={() => post({ action: "createAll" })}
          disabled={busy || items.length === 0}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Add all as users
        </button>
      </div>
      <p className="text-sm text-muted mb-4">
        Non-random player names from game history with no matching user. Linking renames history to the user&apos;s
        name; creating makes a placeholder user (no login or collection).
      </p>
      {status && <p className="text-sm text-red-400 mb-2">{status}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing to reconcile.</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div
              key={it.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{it.name}</span>
                <span className="text-xs text-muted ml-2">
                  {it.gameCount} game{it.gameCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) post({ action: "link", name: it.name, targetUserId: e.target.value });
                  }}
                  className="px-2 py-1 rounded-md border border-border bg-surface text-foreground text-sm"
                  aria-label={`Link ${it.name} to a user`}
                >
                  <option value="">Link to user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => post({ action: "create", name: it.name })}
                  disabled={busy}
                  className="px-3 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Mount it in the admin page**

In `src/app/admin/page.tsx`, add the import:

```tsx
import UnlinkedPlayersSection from "./unlinked-players-section";
```

And render it right after `<UnlinkedDecksSection />`:

```tsx
      {/* Unlinked game decks */}
      <UnlinkedDecksSection />

      {/* Unregistered players */}
      <UnlinkedPlayersSection />
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds; `/api/admin/reconcile/players` appears in the route list; no TS/JSX errors.

---

## Task 7: Full verification + single bundled commit

**Files:** none (verification + commit only)

- [ ] **Step 1: Run the full suite**

Run: `npx jest`
Expected: all suites pass, including the new `reconcile` and `admin-reconcile-api` suites; no regressions.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success, all three new routes registered.

- [ ] **Step 3: Confirm commit scope with the user, then commit once**

Per the commit policy, present the file list and proposed message, get confirmation, then commit everything together (code + spec + plan). Do **not** push (the user pushes). Suggested message:

```
feat(admin): reconcile game-history decks & players with Deck/User rows

Add a zero-migration admin tool to bridge string-based game history with
the normalized tables. Surfaces deck/player names from game history that
have no matching Deck/User, and lets the admin link them (renaming the
history strings to the canonical name) or create the row — individually or
in bulk. Stats are unchanged: they already group by name, so linking
re-attributes automatically. No schema change.
```

---

## Self-Review

**1. Spec coverage:**
- Zero schema change → no migration task. ✓
- `reconcile.ts` pure logic (`computeUnlinkedDecks`/`computeUnlinkedPlayers`, normalized, gameCount = distinct games, random excluded) → Task 1. ✓
- `GET /api/admin/reconcile` → Task 2. ✓
- `POST .../decks` link/create/createAll (404 missing deck, 400 bad owner, idempotent createAll) → Task 3. ✓
- `POST .../players` link/create/createAll (404 missing user, 409 dup, random excluded, idempotent) → Task 4. ✓
- Two UI panels + mount, reusing `/api/admin/decks` and `/api/admin/users` for dropdowns → Tasks 5–6. ✓
- `requireAdmin` guard on all routes; 401/403 tested → Tasks 2–4. ✓
- Tests: `reconcile.test.ts` + `admin-reconcile-api.test.ts` → Tasks 1–4. ✓
- Rollout = deploy (no migration); commit bundled → Task 7. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**3. Type consistency:** `ParticipantRef`/`UnlinkedEntry` defined in Task 1 and used consistently. Route handlers select exactly the `ParticipantRef` fields (`gameId, playerName, deckName, isRandom`). `normalizeName` is the single shared normalization used in logic and both link/dup-guard handlers. UI `UnlinkedEntry` matches the API shape; deck dropdown reads `{ decks: [...] }`, user dropdown reads a bare array — matching the real endpoints. ✓
