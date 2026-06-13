# Per-User Decks & Card Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real per-user Deck entities, a Card Library and Deck List page, a tiered games-tab deck dropdown, and Moxfield plaintext deck import with a missing-cards prompt (issue #7).

**Architecture:** Decks store cards **by value** (`cardName`), never FK to `CollectionCard` (nightly sync wipes those rows). The library = a user's `CollectionCard` rows, with a new `source` column so manually-added cards survive sync. Legacy free-text deckNames get backfilled into Deck rows by a dev-only script. Spec: `docs/superpowers/specs/2026-06-12-user-decks-card-library-design.md`.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + libsql adapter (SQLite/Turso), zod, Jest + ts-jest, Tailwind v4.

**Branch:** `feature/user-decks-library`. HARD RULES: never touch prod Turso / prod env / cron; migrations only against local dev.db; never push/merge to master; full `npx jest` green before declaring any task complete.

**Commit strategy (4 commits total — user preference: fewer, bigger commits):**
- Commit A after Task 5: `feat(decks): schema, Moxfield parser, Scryfall resolver, tier + backfill libs`
- Commit B after Task 11: `feat(api): deck/library/import routes, games deck auto-create, admin deck assignment`
- Commit C after Task 14: `feat(ui): deck list, card library, tiered game dropdown, friends-collection deck badges`
- Commit D after Task 15: `docs(deploy): #7 rollout notes + project tracking`

Tasks that are not at a commit boundary end with `git add -A` (stage only) and a green suite. Run tests with `npx jest <file>` for focus, `npx jest` for the full suite.

**Environment quirks (read first):**
- node_modules binaries were copied from Windows: `tsx` is broken — use `node` directly (Node 24 strips TS types natively).
- Two dev.db files exist: Prisma CLI uses `prisma/dev.db`; a stale root `dev.db` exists for the runtime — do not touch root `dev.db`. For scripts use `DATABASE_URL="file:./prisma/dev.db"` explicitly.
- `npm run build` needs `npm install --no-save lightningcss-linux-x64-gnu@1.30.2 @tailwindcss/oxide-linux-x64-gnu@4.1.18` (do NOT touch package.json/lockfile).

---

### Task 1: Schema (Deck, DeckCard, CollectionCard.source) + sync source filter

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_decks_and_card_library/migration.sql` (generated)
- Modify: `src/lib/updateCollections.ts`
- Test: `tests/update-collections-source.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/update-collections-source.test.ts`)

```ts
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 0 })
const mockCreateMany = jest.fn().mockResolvedValue({ count: 1 })
const mockUserUpdate = jest.fn().mockResolvedValue({})
const mockSyncLogCreate = jest.fn().mockResolvedValue({})
const mockFindUnique = jest.fn()

const tx = {
  collectionCard: { deleteMany: mockDeleteMany, createMany: mockCreateMany },
  user: { update: mockUserUpdate },
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a), findMany: jest.fn() },
    syncLog: { create: (...a: unknown[]) => mockSyncLogCreate(...a) },
    collectionCard: { count: jest.fn().mockResolvedValue(0) },
  },
}))

const mockScrape = jest.fn()
jest.mock('@/lib/scrapeMoxfield/scrapeMoxfield', () => ({
  scrapeMoxfield: (...a: unknown[]) => mockScrape(...a),
}))
jest.mock('server-only', () => ({}), { virtual: true })

import { updateUserCollection } from '@/lib/updateCollections'

describe('collection sync preserves manual library cards', () => {
  beforeEach(() => {
    mockDeleteMany.mockClear()
    mockCreateMany.mockClear()
    mockFindUnique.mockReset()
    mockScrape.mockReset()
  })

  it('only deletes moxfield-sourced rows and stamps new rows as moxfield', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1', name: 'Alice', moxfieldCollectionId: 'mox1' })
    mockScrape.mockResolvedValue([
      { name: 'Sol Ring', scryfall_id: 's1', quantity: 1, condition: 'NearMint', isFoil: false, set: 'c21', set_name: 'Commander 2021', type_line: 'Artifact' },
    ])
    const result = await updateUserCollection('u1')
    expect(result.success).toBe(true)
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', source: 'moxfield' } })
    const created = mockCreateMany.mock.calls[0][0].data
    expect(created[0].source).toBe('moxfield')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (deleteMany called without `source`, created rows lack `source`)

Run: `npx jest tests/update-collections-source.test.ts`
Expected: FAIL on both assertions.

- [ ] **Step 3: Update `prisma/schema.prisma`**

Add to `CollectionCard` (after `typeLine`):

```prisma
  source      String   @default("moxfield")
```

Add to `User` relations (after `invitesTargeting`):

```prisma
  decks                 Deck[]
```

Append two new models at the end of the file:

```prisma
model Deck {
  id          String   @id @default(cuid())
  ownerUserId String?
  name        String
  createdAt   DateTime @default(now())

  owner User?      @relation(fields: [ownerUserId], references: [id], onDelete: SetNull)
  cards DeckCard[]

  @@index([ownerUserId])
  @@map("decks")
}

model DeckCard {
  id              String  @id @default(cuid())
  deckId          String
  cardName        String
  quantity        Int     @default(1)
  set             String?
  collectorNumber String?
  isFoil          Boolean @default(false)

  deck Deck @relation(fields: [deckId], references: [id], onDelete: Cascade)

  @@unique([deckId, cardName])
  @@index([cardName])
  @@map("deck_cards")
}
```

- [ ] **Step 4: Run the migration against LOCAL dev.db ONLY**

Run from repo root:

```bash
npx prisma migrate dev --name add_decks_and_card_library
npx prisma generate
```

Expected: a new migration folder containing `ALTER TABLE "collection_cards" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'moxfield'`, `CREATE TABLE "decks"`, `CREATE TABLE "deck_cards"`, plus the unique/regular indexes. Verify with `sqlite3 prisma/dev.db '.schema decks'`. If Prisma reports drift, STOP and report — do not reset anything.

- [ ] **Step 5: Update `src/lib/updateCollections.ts`**

In BOTH `updateAllCollections` and `updateUserCollection`, change the transaction's delete:

```ts
await tx.collectionCard.deleteMany({
  where: { userId: user.id, source: 'moxfield' }
});
```

and add `source: 'moxfield',` to the `data:` object of BOTH `createMany` card mappings (after `typeLine`).

- [ ] **Step 6: Run the test — expect PASS, then the full suite**

Run: `npx jest tests/update-collections-source.test.ts` then `npx jest`
Expected: all green.

- [ ] **Step 7: Stage** — `git add -A` (commit happens at Task 5).

---

### Task 2: Moxfield plaintext parser (`parseMoxfield.ts`)

**Files:**
- Create: `src/lib/parseMoxfield.ts`
- Test: `tests/parse-moxfield.test.ts`

`src/lib/parseDeck.ts` (checkDeck's parser) is NOT touched.

- [ ] **Step 1: Write the failing tests** (`tests/parse-moxfield.test.ts`)

```ts
import {
  parseMoxfieldText,
  normalizeCardName,
  buildLibraryNameIndex,
  findLibraryName,
} from '@/lib/parseMoxfield'

describe('parseMoxfieldText', () => {
  it('parses the three issue example formats', () => {
    const { cards, errors } = parseMoxfieldText(
      [
        '1 Treasure Vault (AFR) 261 *F*',
        '1 Spikefield Hazard / Spikefield Cave (ZNR) 166 *F*',
        '1 Secluded Starforge (EOE) 257',
      ].join('\n')
    )
    expect(errors).toEqual([])
    expect(cards).toEqual([
      { line: 1, quantity: 1, name: 'Treasure Vault', set: 'AFR', collectorNumber: '261', isFoil: true },
      { line: 2, quantity: 1, name: 'Spikefield Hazard / Spikefield Cave', set: 'ZNR', collectorNumber: '166', isFoil: true },
      { line: 3, quantity: 1, name: 'Secluded Starforge', set: 'EOE', collectorNumber: '257', isFoil: false },
    ])
  })

  it('parses name-only lines and multi-digit quantities', () => {
    const { cards, errors } = parseMoxfieldText('12 Sol Ring')
    expect(errors).toEqual([])
    expect(cards[0]).toEqual({ line: 1, quantity: 12, name: 'Sol Ring', set: undefined, collectorNumber: undefined, isFoil: false })
  })

  it('skips blank lines, keeps correct line numbers', () => {
    const { cards } = parseMoxfieldText('\n1 Sol Ring (C21) 263\n\n2 Arcane Signet (C21) 240\n')
    expect(cards.map((c) => c.line)).toEqual([2, 4])
  })

  it('collects errors for garbage and unknown markers without throwing', () => {
    const { cards, errors } = parseMoxfieldText('SIDEBOARD:\n1 Treasure Vault (AFR) 261 *E*\n1 Sol Ring (C21) 263')
    expect(cards).toHaveLength(1)
    expect(errors).toHaveLength(2)
    expect(errors[0].line).toBe(1)
    expect(errors[1].reason).toMatch(/\*F\*/)
  })

  it('handles odd collector numbers (letters, stars)', () => {
    const { cards, errors } = parseMoxfieldText('1 Fabled Passage (PELD) 244p\n1 Gilded Goose (PELD) 160★')
    expect(errors).toEqual([])
    expect(cards[0].collectorNumber).toBe('244p')
    expect(cards[1].collectorNumber).toBe('160★')
  })
})

describe('normalizeCardName', () => {
  it('lowercases, trims, collapses whitespace and unifies MDFC separators', () => {
    expect(normalizeCardName('  Spikefield Hazard /  Spikefield Cave ')).toBe('spikefield hazard // spikefield cave')
    expect(normalizeCardName('Spikefield Hazard // Spikefield Cave')).toBe('spikefield hazard // spikefield cave')
  })
})

describe('library name index', () => {
  const index = buildLibraryNameIndex(['Spikefield Hazard // Spikefield Cave', 'Sol Ring'])

  it('finds exact matches regardless of separator style and case', () => {
    expect(findLibraryName(index, 'spikefield hazard / spikefield cave')).toBe('Spikefield Hazard // Spikefield Cave')
    expect(findLibraryName(index, 'SOL RING')).toBe('Sol Ring')
  })

  it('falls back to the front face for MDFCs', () => {
    expect(findLibraryName(index, 'Spikefield Hazard')).toBe('Spikefield Hazard // Spikefield Cave')
  })

  it('returns undefined for unknown cards', () => {
    expect(findLibraryName(index, 'Black Lotus')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '@/lib/parseMoxfield'`)

Run: `npx jest tests/parse-moxfield.test.ts`

- [ ] **Step 3: Implement `src/lib/parseMoxfield.ts`**

```ts
// Parses Moxfield plaintext exports ("1 Treasure Vault (AFR) 261 *F*").
// Unlike parseDeck.ts (deck checker), this keeps basic lands and printing info.

export interface ParsedMoxfieldCard {
  line: number // 1-based source line, threaded through for error reporting
  quantity: number
  name: string
  set?: string
  collectorNumber?: string
  isFoil: boolean
}

export interface MoxfieldParseError {
  line: number
  raw: string
  reason: string
}

export interface MoxfieldParseResult {
  cards: ParsedMoxfieldCard[]
  errors: MoxfieldParseError[]
}

// qty, lazy name (may contain " / " for MDFCs), optional "(SET) NUM" pair, optional *F*.
// The lazy name + end-anchored optional groups make "(SET) NUM" bind tightly when present.
const LINE_RE = /^(\d+)\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s+([^\s*]+))?(\s+\*F\*)?\s*$/

export function parseMoxfieldText(text: string): MoxfieldParseResult {
  const cards: ParsedMoxfieldCard[] = []
  const errors: MoxfieldParseError[] = []

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const trimmed = raw.trim()
    if (!trimmed) return

    const m = trimmed.match(LINE_RE)
    if (!m) {
      errors.push({ line, raw: trimmed, reason: 'Unrecognized line format' })
      return
    }
    const [, qtyStr, name, set, collectorNumber, foil] = m

    // Only *F* is a recognized marker; any other *X* would otherwise be silently
    // swallowed into the card name, so reject the line instead.
    if (/\*[^*]+\*\s*$/.test(name)) {
      errors.push({ line, raw: trimmed, reason: 'Unsupported marker — only *F* is recognized' })
      return
    }

    const quantity = parseInt(qtyStr, 10)
    if (quantity < 1) {
      errors.push({ line, raw: trimmed, reason: 'Quantity must be at least 1' })
      return
    }

    cards.push({
      line,
      quantity,
      name: name.trim(),
      set: set?.toUpperCase(),
      collectorNumber,
      isFoil: foil !== undefined,
    })
  })

  return { cards, errors }
}

// Moxfield exports MDFCs as "A / B"; the collection scrape (Scryfall naming)
// stores "A // B". Normalization bridges the two for matching.
export function normalizeCardName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/ \/ /g, ' // ').toLowerCase()
}

export type LibraryNameIndex = Map<string, string> // normalized -> canonical stored name

export function buildLibraryNameIndex(names: string[]): LibraryNameIndex {
  const index: LibraryNameIndex = new Map()
  for (const n of names) {
    const key = normalizeCardName(n)
    if (!index.has(key)) index.set(key, n)
  }
  return index
}

export function findLibraryName(index: LibraryNameIndex, importName: string): string | undefined {
  const norm = normalizeCardName(importName)
  const exact = index.get(norm)
  if (exact) return exact
  const front = norm.split(' // ')[0]
  for (const [key, canonical] of index) {
    if (key.startsWith(front + ' //')) return canonical
  }
  return undefined
}
```

- [ ] **Step 4: Run — expect PASS**, then full suite green.
- [ ] **Step 5: Stage** — `git add -A`.

---

### Task 3: Scryfall batch resolver (`scryfall.ts`)

**Files:**
- Create: `src/lib/scryfall.ts`
- Test: `tests/scryfall.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/scryfall.test.ts`)

```ts
import { resolveCards, scryfallKey } from '@/lib/scryfall'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function scryfallResponse(data: unknown[], notFound: unknown[] = []) {
  return { ok: true, json: async () => ({ data, not_found: notFound }) }
}

describe('resolveCards', () => {
  beforeEach(() => mockFetch.mockReset())

  it('resolves identifiers and splits found / notFound', async () => {
    mockFetch.mockResolvedValue(
      scryfallResponse(
        [{ name: 'Treasure Vault', id: 'sc1', set: 'afr', set_name: 'Adventures in the Forgotten Realms', type_line: 'Artifact Land', collector_number: '261' }],
        [{ set: 'xxx', collector_number: '999' }]
      )
    )
    const { found, notFound } = await resolveCards([
      { set: 'AFR', collectorNumber: '261' },
      { set: 'XXX', collectorNumber: '999' },
    ])
    expect(found.get(scryfallKey('AFR', '261'))).toEqual({
      name: 'Treasure Vault', scryfallId: 'sc1', set: 'afr',
      setName: 'Adventures in the Forgotten Realms', typeLine: 'Artifact Land', collectorNumber: '261',
    })
    expect(notFound).toEqual([{ set: 'xxx', collectorNumber: '999' }])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.identifiers[0]).toEqual({ set: 'afr', collector_number: '261' })
  })

  it('batches requests at 75 identifiers', async () => {
    mockFetch.mockResolvedValue(scryfallResponse([]))
    const ids = Array.from({ length: 76 }, (_, i) => ({ set: 'abc', collectorNumber: String(i) }))
    await resolveCards(ids)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).identifiers).toHaveLength(75)
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).identifiers).toHaveLength(1)
  })

  it('throws on a non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    await expect(resolveCards([{ set: 'afr', collectorNumber: '1' }])).rejects.toThrow('503')
  })

  it('returns empty result for empty input without fetching', async () => {
    const { found, notFound } = await resolveCards([])
    expect(found.size).toBe(0)
    expect(notFound).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module missing). `npx jest tests/scryfall.test.ts`

- [ ] **Step 3: Implement `src/lib/scryfall.ts`**

```ts
// Batch card resolution via Scryfall's POST /cards/collection (max 75 per request,
// keyless, free). Used by library plaintext add and deck import.

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const BATCH_SIZE = 75

export interface ScryfallIdentifier {
  set: string
  collectorNumber: string
}

export interface ResolvedCard {
  name: string
  scryfallId: string
  set: string
  setName: string
  typeLine: string
  collectorNumber: string
}

export function scryfallKey(set: string, collectorNumber: string): string {
  return `${set.toLowerCase()}:${collectorNumber.toLowerCase()}`
}

interface ScryfallCollectionResponse {
  data?: Array<{
    name: string
    id: string
    set: string
    set_name: string
    type_line?: string
    collector_number: string
  }>
  not_found?: Array<{ set?: string; collector_number?: string }>
}

export async function resolveCards(
  identifiers: ScryfallIdentifier[]
): Promise<{ found: Map<string, ResolvedCard>; notFound: ScryfallIdentifier[] }> {
  const found = new Map<string, ResolvedCard>()
  const notFound: ScryfallIdentifier[] = []

  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE)
    const res = await fetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifiers: batch.map((b) => ({ set: b.set.toLowerCase(), collector_number: b.collectorNumber })),
      }),
    })
    if (!res.ok) throw new Error(`Scryfall returned ${res.status}`)
    const data = (await res.json()) as ScryfallCollectionResponse

    for (const c of data.data ?? []) {
      found.set(scryfallKey(c.set, c.collector_number), {
        name: c.name,
        scryfallId: c.id,
        set: c.set,
        setName: c.set_name,
        typeLine: c.type_line ?? '',
        collectorNumber: c.collector_number,
      })
    }
    for (const nf of data.not_found ?? []) {
      if (nf.set && nf.collector_number) notFound.push({ set: nf.set, collectorNumber: nf.collector_number })
    }
  }

  return { found, notFound }
}
```

- [ ] **Step 4: Run — expect PASS**, then full suite green.
- [ ] **Step 5: Stage** — `git add -A`.

---

### Task 4: Tiered deck dropdown logic (`deckTiers.ts`)

**Files:**
- Create: `src/lib/deckTiers.ts`
- Test: `tests/tiered-decks.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/tiered-decks.test.ts`)

```ts
import { tieredDeckItems } from '@/lib/deckTiers'

const userDecks = ['Krenko Goblins', 'Esper Control']
const otherDecks = ['Esper', 'Slivers', 'Krenko Goblins'] // 'Krenko Goblins' also owned by another user

describe('tieredDeckItems', () => {
  it('shows ONLY the User decks tier when the search matches user decks', () => {
    expect(tieredDeckItems(userDecks, otherDecks, 'kren')).toEqual([
      { label: 'User decks', items: ['Krenko Goblins', 'Esper Control'] },
    ])
  })

  it('shows user decks on empty input when the user has decks', () => {
    expect(tieredDeckItems(userDecks, otherDecks, '')[0].label).toBe('User decks')
  })

  it('falls back to Borrowed decks only when no user deck matches', () => {
    expect(tieredDeckItems(userDecks, otherDecks, 'sliv')).toEqual([
      { label: 'Borrowed decks', items: ['Esper', 'Slivers'] },
    ])
  })

  it('shows Borrowed for a user with no decks at all', () => {
    expect(tieredDeckItems([], otherDecks, '')[0].label).toBe('Borrowed decks')
  })

  it('dedupes borrowed names the user already owns', () => {
    const tiers = tieredDeckItems(userDecks, otherDecks, 'zzz-no-match')
    expect(tiers[0].items).not.toContain('Krenko Goblins')
  })

  it('dedupes repeated names within a tier', () => {
    const tiers = tieredDeckItems([], ['Slivers', 'Slivers'], '')
    expect(tiers[0].items).toEqual(['Slivers'])
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** `npx jest tests/tiered-decks.test.ts`

- [ ] **Step 3: Implement `src/lib/deckTiers.ts`**

```ts
// Tier logic for the games-tab deck dropdown (issue #7):
//   1. User decks — always first when any of them match the search
//   2. Borrowed decks — ONLY when the search matches zero user decks
//   3. "+ Add new" — rendered by the Combobox itself, always last
// Tiers are relative to the logged-in user. Items are returned UNFILTERED —
// the Combobox re-filters per keystroke; this function only decides which
// tier is visible (a decision that depends on the current input).

export interface DeckTierGroup {
  label: 'User decks' | 'Borrowed decks'
  items: string[]
}

export function tieredDeckItems(
  userDecks: string[],
  otherDecks: string[],
  input: string
): DeckTierGroup[] {
  const q = input.trim().toLowerCase()
  const user = Array.from(new Set(userDecks))
  const userMatches = user.filter((d) => d.toLowerCase().includes(q))
  if (userMatches.length > 0) {
    return [{ label: 'User decks', items: user }]
  }
  const owned = new Set(user.map((d) => d.toLowerCase()))
  const borrowed = Array.from(new Set(otherDecks)).filter((d) => !owned.has(d.toLowerCase()))
  return [{ label: 'Borrowed decks', items: borrowed }]
}
```

- [ ] **Step 4: Run — expect PASS**, full suite green.
- [ ] **Step 5: Stage** — `git add -A`.

---

### Task 5: Legacy deck backfill (lib + script) — COMMIT A

**Files:**
- Create: `src/lib/deckBackfill.ts`
- Create: `src/scripts/backfillDecks.ts` (excluded from tsconfig type-check like seed.ts — that's expected)
- Test: `tests/backfill-decks.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/backfill-decks.test.ts`)

```ts
import { planDeckBackfill } from '@/lib/deckBackfill'

const users = [
  { id: 'u-alice', name: 'Alice' },
  { id: 'u-bob', name: 'Bob' },
]

function row(deckName: string, playerName: string, iso: string) {
  return { deckName, playerName, gameDate: new Date(iso) }
}

describe('planDeckBackfill', () => {
  it('assigns each distinct deck to the most frequent player who is a user', () => {
    const plan = planDeckBackfill(
      [
        row('Krenko', 'Alice', '2026-01-01'),
        row('Krenko', 'Alice', '2026-01-02'),
        row('Krenko', 'Bob', '2026-01-03'), // Bob borrowed it once
      ],
      users,
      []
    )
    expect(plan).toEqual([{ deckName: 'Krenko', ownerUserId: 'u-alice', ownerName: 'Alice' }])
  })

  it('breaks ties by the most recent game', () => {
    const plan = planDeckBackfill(
      [row('Esper', 'Alice', '2026-01-01'), row('Esper', 'Bob', '2026-02-01')],
      users,
      []
    )
    expect(plan[0].ownerUserId).toBe('u-bob')
  })

  it('creates ownerless entries when the top player matches no user (no fallback to #2)', () => {
    const plan = planDeckBackfill(
      [
        row('Slivers', 'Stranger', '2026-01-01'),
        row('Slivers', 'Stranger', '2026-01-02'),
        row('Slivers', 'Alice', '2026-01-03'),
      ],
      users,
      []
    )
    expect(plan).toEqual([{ deckName: 'Slivers', ownerUserId: null, ownerName: null }])
  })

  it('matches player and deck names case-insensitively and skips existing decks (idempotent)', () => {
    const plan = planDeckBackfill(
      [row('  krenko ', 'ALICE', '2026-01-01')],
      users,
      [{ name: 'Krenko', ownerUserId: 'u-alice' }]
    )
    expect(plan).toEqual([])
  })

  it('keeps a deck whose owner differs from an existing same-name deck', () => {
    const plan = planDeckBackfill(
      [row('Krenko', 'Bob', '2026-01-01')],
      users,
      [{ name: 'Krenko', ownerUserId: 'u-alice' }]
    )
    expect(plan).toEqual([{ deckName: 'Krenko', ownerUserId: 'u-bob', ownerName: 'Bob' }])
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** `npx jest tests/backfill-decks.test.ts`

- [ ] **Step 3: Implement `src/lib/deckBackfill.ts`**

```ts
// Pure planning logic for the one-time legacy deck backfill (issue #7).
// Heuristic: each distinct legacy deckName is owned by the USER matching the
// player who used it most often (ties -> the player with the most recent game).
// If that player matches no user, the deck is created ownerless — no fallback
// to the second-most-frequent player. Admin can reassign owners afterwards.

export interface LegacyDeckRow {
  deckName: string
  playerName: string
  gameDate: Date
}

export interface BackfillUser {
  id: string
  name: string
}

export interface ExistingDeck {
  name: string
  ownerUserId: string | null
}

export interface BackfillEntry {
  deckName: string
  ownerUserId: string | null
  ownerName: string | null
}

const norm = (s: string) => s.trim().toLowerCase()

export function planDeckBackfill(
  rows: LegacyDeckRow[],
  users: BackfillUser[],
  existingDecks: ExistingDeck[]
): BackfillEntry[] {
  const usersByName = new Map(users.map((u) => [norm(u.name), u]))

  interface Tally { count: number; latest: Date; raw: string }
  const groups = new Map<string, { canonical: string; tally: Map<string, Tally> }>()

  for (const row of rows) {
    const dKey = norm(row.deckName)
    if (!dKey) continue
    let g = groups.get(dKey)
    if (!g) {
      g = { canonical: row.deckName.trim(), tally: new Map() }
      groups.set(dKey, g)
    }
    const pKey = norm(row.playerName)
    const t = g.tally.get(pKey)
    if (!t) g.tally.set(pKey, { count: 1, latest: row.gameDate, raw: row.playerName.trim() })
    else {
      t.count += 1
      if (row.gameDate > t.latest) t.latest = row.gameDate
    }
  }

  const existing = new Set(existingDecks.map((d) => `${d.ownerUserId ?? ''}:${norm(d.name)}`))
  const entries: BackfillEntry[] = []

  for (const [dKey, g] of groups) {
    let best: Tally | null = null
    for (const t of g.tally.values()) {
      if (!best || t.count > best.count || (t.count === best.count && t.latest > best.latest)) {
        best = t
      }
    }
    const owner = best ? usersByName.get(norm(best.raw)) : undefined
    const ownerUserId = owner?.id ?? null
    if (existing.has(`${ownerUserId ?? ''}:${dKey}`)) continue
    entries.push({ deckName: g.canonical, ownerUserId, ownerName: owner?.name ?? null })
  }

  return entries.sort((a, b) => a.deckName.localeCompare(b.deckName))
}
```

- [ ] **Step 4: Implement `src/scripts/backfillDecks.ts`**

Note the explicit `.ts` import extensions — the script runs under Node 24's native
type stripping (`tsx` is broken in this repo), and src/scripts is excluded from
tsconfig so the extensions don't affect the build.

```ts
// One-time legacy deck backfill (issue #7). Idempotent — re-running is a no-op.
// Run (local):  DATABASE_URL="file:./prisma/dev.db" node src/scripts/backfillDecks.ts
// Run (Turso dev, only with explicit human approval):
//   DATABASE_URL="libsql://tabletally-dev-....turso.io" DATABASE_AUTH_TOKEN="..." node src/scripts/backfillDecks.ts
// NEVER run against production.
import { prisma } from '../lib/prisma.ts'
import { planDeckBackfill } from '../lib/deckBackfill.ts'

async function main() {
  const participants = await prisma.gameParticipant.findMany({
    where: { deckName: { not: null }, isRandom: false },
    include: { game: { select: { date: true } } },
  })
  const rows = participants
    .filter((p) => p.deckName && p.deckName.trim())
    .map((p) => ({ deckName: p.deckName as string, playerName: p.playerName, gameDate: p.game.date }))

  const users = await prisma.user.findMany({ select: { id: true, name: true } })
  const existing = await prisma.deck.findMany({ select: { name: true, ownerUserId: true } })

  const plan = planDeckBackfill(rows, users, existing)
  if (plan.length === 0) {
    console.log('Nothing to backfill — all legacy decks already exist.')
    return
  }

  console.log(`Creating ${plan.length} decks:\n`)
  for (const entry of plan) {
    await prisma.deck.create({ data: { name: entry.deckName, ownerUserId: entry.ownerUserId } })
    console.log(`  ${entry.deckName.padEnd(42)} -> ${entry.ownerName ?? 'OWNERLESS'}`)
  }
  console.log(`\nDone. ${plan.length} decks created.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
```

- [ ] **Step 5: Run tests — expect PASS**, full suite green. Do NOT run the script yet (that's Task 15).

- [ ] **Step 6: COMMIT A**

```bash
git add -A
git commit -m "feat(decks): schema, Moxfield parser, Scryfall resolver, tier + backfill libs (#7)

- Deck/DeckCard models (cards stored by value — nightly sync recreates
  CollectionCard rows, so no FK), CollectionCard.source for manual adds
- sync now only replaces source='moxfield' rows
- parseMoxfield: qty/name/(SET) NUM/*F* incl. MDFC 'A / B' names
- Scryfall /cards/collection batch resolver (75/request)
- tieredDeckItems ordering logic + idempotent legacy backfill planner"
```

---

## API test conventions (Tasks 6–11)

All route tests follow the established pattern from `tests/auth-login.test.ts`:

```ts
// Shared scaffolding — adapt mocked prisma models per test file
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
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
const ADMIN = { userId: 'ua', role: 'ADMIN', isLegacyAdmin: false }
const LEGACY = { userId: '__legacy_admin__', role: 'ADMIN', isLegacyAdmin: true }
```

Dynamic-segment handlers are called as `GET(makeRequest(), { params: Promise.resolve({ id: 'd1' }) })`. Results are asserted via `(result as any).status` / `.body`.

---

### Task 6: `GET` + `POST /api/decks` (tiered list + create)

**Files:**
- Modify: `src/app/api/decks/route.ts` (full rewrite)
- Test: `tests/decks-api.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/decks-api.test.ts`, using the conventions above)

```ts
const mockDeckFindMany = jest.fn()
const mockDeckCreate = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      create: (...a: unknown[]) => mockDeckCreate(...a),
    },
  },
}))
// ...next/server + session mocks + makeRequest from conventions...

import { GET, POST } from '../src/app/api/decks/route'

const DB_DECKS = [
  { id: 'd1', name: 'Krenko', ownerUserId: 'u1', createdAt: new Date(), owner: { name: 'Alice' }, _count: { cards: 3 } },
  { id: 'd2', name: 'Esper', ownerUserId: 'u2', createdAt: new Date(), owner: { name: 'Bob' }, _count: { cards: 0 } },
  { id: 'd3', name: 'Slivers', ownerUserId: null, createdAt: new Date(), owner: null, _count: { cards: 0 } },
]

describe('GET /api/decks', () => {
  beforeEach(() => { mockDeckFindMany.mockReset(); mockGetSession.mockReset() })

  it('splits decks into userDecks and otherDecks relative to the session user', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue(DB_DECKS)
    const res: any = await GET(makeRequest())
    expect(res.body.userDecks).toEqual([{ id: 'd1', name: 'Krenko', cardCount: 3 }])
    expect(res.body.otherDecks).toEqual([
      { id: 'd2', name: 'Esper', cardCount: 0, ownerName: 'Bob' },
      { id: 'd3', name: 'Slivers', cardCount: 0, ownerName: null },
    ])
    expect(res.body.isLegacyAdmin).toBe(false)
  })

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null)
    expect(((await GET(makeRequest())) as any).status).toBe(401)
  })
})

describe('POST /api/decks', () => {
  beforeEach(() => { mockDeckFindMany.mockReset(); mockDeckCreate.mockReset(); mockGetSession.mockReset() })

  it('creates a deck owned by the session user', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue([])
    mockDeckCreate.mockResolvedValue({ id: 'new', name: 'Mono Red' })
    const res: any = await POST(makeRequest({ name: '  Mono Red ' }))
    expect(res.status).toBe(201)
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'Mono Red', ownerUserId: 'u1' } })
  })

  it('409s on a case-insensitive duplicate within the user own decks', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue([{ name: 'mono red' }])
    expect(((await POST(makeRequest({ name: 'Mono Red' }))) as any).status).toBe(409)
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('403s the legacy bootstrap admin', async () => {
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await POST(makeRequest({ name: 'X' }))) as any).status).toBe(403)
  })

  it('400s invalid names', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    expect(((await POST(makeRequest({ name: '' }))) as any).status).toBe(400)
    expect(((await POST(makeRequest({ name: 'x'.repeat(101) }))) as any).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (route exports/behavior don't exist yet). `npx jest tests/decks-api.test.ts`

- [ ] **Step 3: Rewrite `src/app/api/decks/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

const deckCreateSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name too long'),
});

export async function GET(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decks = await prisma.deck.findMany({
      include: { owner: { select: { name: true } }, _count: { select: { cards: true } } },
      orderBy: { name: 'asc' },
    });
    const userDecks = decks
      .filter((d) => d.ownerUserId === session.userId)
      .map((d) => ({ id: d.id, name: d.name, cardCount: d._count.cards }));
    const otherDecks = decks
      .filter((d) => d.ownerUserId !== session.userId)
      .map((d) => ({ id: d.id, name: d.name, cardCount: d._count.cards, ownerName: d.owner?.name ?? null }));
    return NextResponse.json({ userDecks, otherDecks, isLegacyAdmin: session.isLegacyAdmin });
  } catch (error) {
    console.error('GET /api/decks error:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    if (session.isLegacyAdmin) {
      return NextResponse.json(
        { error: 'Create your account via an invite to own decks' },
        { status: 403 }
      );
    }

    const { name } = deckCreateSchema.parse(await request.json());

    const mine = await prisma.deck.findMany({
      where: { ownerUserId: session.userId },
      select: { name: true },
    });
    if (mine.some((d) => d.name.trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
    }

    const deck = await prisma.deck.create({ data: { name, ownerUserId: session.userId } });
    return NextResponse.json({ deck: { id: deck.id, name: deck.name } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks error:', error);
    return NextResponse.json({ error: 'Failed to create deck' }, { status: 500 });
  }
}
```

NOTE: this changes the GET response shape; `game-form.tsx` (the only consumer) is updated in Task 12 — the UI is transiently broken between commits B and C, which is fine on a feature branch.

- [ ] **Step 4: Run — expect PASS**, full suite green.
- [ ] **Step 5: Stage** — `git add -A`.

---

### Task 7: Deck detail, delete, and card membership (`/api/decks/[id]` + `/cards`)

**Files:**
- Create: `src/app/api/decks/[id]/route.ts`
- Create: `src/app/api/decks/[id]/cards/route.ts`
- Test: `tests/deck-detail-api.test.ts`
- Test: `tests/deck-cards-api.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/deck-detail-api.test.ts`)

```ts
const mockDeckFindUnique = jest.fn()
const mockDeckDelete = jest.fn()
const mockCollectionFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      delete: (...a: unknown[]) => mockDeckDelete(...a),
    },
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
  },
}))
// ...next/server + session mocks + makeRequest...

import { GET, DELETE } from '../src/app/api/decks/[id]/route'

const params = { params: Promise.resolve({ id: 'd1' }) }
const DECK = {
  id: 'd1', name: 'Krenko', ownerUserId: 'u1', owner: { name: 'Alice' },
  cards: [
    { cardName: 'Sol Ring', quantity: 1, set: 'C21', collectorNumber: '263', isFoil: false },
    { cardName: 'Black Lotus', quantity: 1, set: null, collectorNumber: null, isFoil: false },
  ],
}

describe('GET /api/decks/[id]', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockCollectionFindMany.mockReset() })

  it('returns deck with inLibrary computed against the OWNER library and isOwner flag', async () => {
    mockGetSession.mockResolvedValue(MEMBER) // u1 — the owner
    mockDeckFindUnique.mockResolvedValue(DECK)
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await GET(makeRequest(), params)
    expect(res.body.deck.isOwner).toBe(true)
    expect(res.body.deck.cards).toEqual([
      expect.objectContaining({ cardName: 'Sol Ring', inLibrary: true }),
      expect.objectContaining({ cardName: 'Black Lotus', inLibrary: false }),
    ])
    expect(mockCollectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } })
    )
  })

  it('marks isOwner=false for another user (read allowed)', async () => {
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    mockDeckFindUnique.mockResolvedValue(DECK)
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await GET(makeRequest(), params)
    expect(res.status).toBe(200)
    expect(res.body.deck.isOwner).toBe(false)
  })

  it('404s unknown decks', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await GET(makeRequest(), params)) as any).status).toBe(404)
  })
})

describe('DELETE /api/decks/[id]', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockDeckFindUnique.mockReset(); mockDeckDelete.mockReset() })

  it('lets the owner delete', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(DECK)
    mockDeckDelete.mockResolvedValue(DECK)
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(200)
    expect(mockDeckDelete).toHaveBeenCalledWith({ where: { id: 'd1' } })
  })

  it('403s a non-owner, even ADMIN, on an owned deck', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue(DECK)
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(403)
  })

  it('lets ADMIN delete an OWNERLESS deck (cleanup)', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ ...DECK, ownerUserId: null, owner: null })
    mockDeckDelete.mockResolvedValue({})
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(200)
  })

  it('403s a MEMBER on an ownerless deck', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue({ ...DECK, ownerUserId: null, owner: null })
    expect(((await DELETE(makeRequest(), params)) as any).status).toBe(403)
  })
})
```

- [ ] **Step 2: Write the failing tests** (`tests/deck-cards-api.test.ts`)

```ts
const mockDeckFindUnique = jest.fn()
const mockCollectionFindMany = jest.fn()
const mockDeckCardFindMany = jest.fn()
const mockUpsert = jest.fn()
const mockDeleteMany = jest.fn()
const mockUpdateMany = jest.fn()

const tx = {
  deckCard: {
    findMany: (...a: unknown[]) => mockDeckCardFindMany(...a),
    upsert: (...a: unknown[]) => mockUpsert(...a),
    deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
    updateMany: (...a: unknown[]) => mockUpdateMany(...a),
  },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findUnique: (...a: unknown[]) => mockDeckFindUnique(...a) },
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deckCard: { findMany: (...a: unknown[]) => mockDeckCardFindMany(...a) },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))
// ...next/server + session mocks + makeRequest...

import { PUT } from '../src/app/api/decks/[id]/cards/route'

const params = { params: Promise.resolve({ id: 'd1' }) }
const OWNED = { id: 'd1', name: 'Krenko', ownerUserId: 'u1' }

describe('PUT /api/decks/[id]/cards', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindUnique.mockReset()
    mockCollectionFindMany.mockReset(); mockDeckCardFindMany.mockReset()
    mockUpsert.mockReset(); mockDeleteMany.mockReset(); mockUpdateMany.mockReset()
    mockDeckCardFindMany.mockResolvedValue([])
  })

  it('adds library cards using the canonical library name (case/separator-insensitive)', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Spikefield Hazard // Spikefield Cave' }])
    const res: any = await PUT(
      makeRequest({ add: [{ cardName: 'spikefield hazard / spikefield cave', quantity: 2 }] }),
      params
    )
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId_cardName: { deckId: 'd1', cardName: 'Spikefield Hazard // Spikefield Cave' } },
        update: { quantity: { increment: 2 } },
      })
    )
  })

  it('400s adds that are not in the owner library, listing them', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await PUT(makeRequest({ add: [{ cardName: 'Black Lotus' }] }), params)
    expect(res.status).toBe(400)
    expect(res.body.cards).toEqual(['Black Lotus'])
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('removes by case-insensitive name match against stored deck cards', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockDeckCardFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    await PUT(makeRequest({ remove: ['sol ring'] }), params)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { deckId: 'd1', cardName: { in: ['Sol Ring'] } },
    })
  })

  it('setQuantity 0 deletes; >0 updates', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockDeckCardFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }, { cardName: 'Arcane Signet' }])
    await PUT(
      makeRequest({ setQuantity: [{ cardName: 'Sol Ring', quantity: 0 }, { cardName: 'Arcane Signet', quantity: 4 }] }),
      params
    )
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { deckId: 'd1', cardName: { in: ['Sol Ring'] } } })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { deckId: 'd1', cardName: 'Arcane Signet' },
      data: { quantity: 4 },
    })
  })

  it('403s non-owners and the legacy admin; ownerless decks are not editable', async () => {
    mockDeckFindUnique.mockResolvedValue(OWNED)
    mockGetSession.mockResolvedValue({ userId: 'u2', role: 'MEMBER', isLegacyAdmin: false })
    expect(((await PUT(makeRequest({ add: [] }), params)) as any).status).toBe(403)
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await PUT(makeRequest({ add: [] }), params)) as any).status).toBe(403)
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ ...OWNED, ownerUserId: null })
    expect(((await PUT(makeRequest({ add: [] }), params)) as any).status).toBe(403)
  })
})
```

- [ ] **Step 3: Run both — expect FAIL** (modules missing).

- [ ] **Step 4: Implement `src/app/api/decks/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { buildLibraryNameIndex, findLibraryName } from '@/lib/parseMoxfield';

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
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: { owner: { select: { name: true } }, cards: { orderBy: { cardName: 'asc' } } },
    });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // inLibrary reflects the OWNER's library (ownerless decks have no library)
    let libIndex = buildLibraryNameIndex([]);
    if (deck.ownerUserId) {
      const lib = await prisma.collectionCard.findMany({
        where: { userId: deck.ownerUserId },
        select: { cardName: true },
      });
      libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
    }

    return NextResponse.json({
      deck: {
        id: deck.id,
        name: deck.name,
        ownerUserId: deck.ownerUserId,
        ownerName: deck.owner?.name ?? null,
        isOwner: deck.ownerUserId !== null && deck.ownerUserId === session.userId,
        cards: deck.cards.map((c) => ({
          cardName: c.cardName,
          quantity: c.quantity,
          set: c.set,
          collectorNumber: c.collectorNumber,
          isFoil: c.isFoil,
          inLibrary: findLibraryName(libIndex, c.cardName) !== undefined,
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch deck' }, { status: 500 });
  }
}

export async function DELETE(
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

    const isOwner = deck.ownerUserId !== null && deck.ownerUserId === session.userId;
    const adminOnOwnerless = deck.ownerUserId === null && session.role === 'ADMIN';
    if (!isOwner && !adminOnOwnerless) {
      return NextResponse.json({ error: 'Only the deck owner can delete it' }, { status: 403 });
    }

    await prisma.deck.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete deck' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implement `src/app/api/decks/[id]/cards/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { buildLibraryNameIndex, findLibraryName, normalizeCardName } from '@/lib/parseMoxfield';

const addSchema = z.object({
  cardName: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(999).default(1),
  set: z.string().trim().max(6).optional(),
  collectorNumber: z.string().trim().max(20).optional(),
  isFoil: z.boolean().default(false),
});

const bodySchema = z.object({
  add: z.array(addSchema).max(500).optional(),
  remove: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
  setQuantity: z
    .array(z.object({ cardName: z.string().trim().min(1).max(200), quantity: z.number().int().min(0).max(999) }))
    .max(500)
    .optional(),
});

export async function PUT(
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
    // Ownerless decks aren't editable by anyone — admin assigns an owner first.
    if (deck.ownerUserId === null || deck.ownerUserId !== session.userId) {
      return NextResponse.json({ error: 'Only the deck owner can edit its cards' }, { status: 403 });
    }

    const body = bodySchema.parse(await request.json());

    // Adds must come from the owner's library; store the canonical library name.
    let canonicalAdds: Array<z.infer<typeof addSchema> & { canonicalName: string }> = [];
    if (body.add && body.add.length > 0) {
      const lib = await prisma.collectionCard.findMany({
        where: { userId: deck.ownerUserId },
        select: { cardName: true },
      });
      const libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
      const unknown: string[] = [];
      canonicalAdds = body.add.map((a) => {
        const canonicalName = findLibraryName(libIndex, a.cardName);
        if (!canonicalName) unknown.push(a.cardName);
        return { ...a, canonicalName: canonicalName ?? a.cardName };
      });
      if (unknown.length > 0) {
        return NextResponse.json({ error: 'Cards not in your library', cards: unknown }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Map normalized -> stored deck card name for remove/setQuantity matching
      const stored = await tx.deckCard.findMany({ where: { deckId: id }, select: { cardName: true } });
      const storedByNorm = new Map(stored.map((c) => [normalizeCardName(c.cardName), c.cardName]));

      for (const a of canonicalAdds) {
        await tx.deckCard.upsert({
          where: { deckId_cardName: { deckId: id, cardName: a.canonicalName } },
          update: { quantity: { increment: a.quantity } },
          create: {
            deckId: id,
            cardName: a.canonicalName,
            quantity: a.quantity,
            set: a.set,
            collectorNumber: a.collectorNumber,
            isFoil: a.isFoil,
          },
        });
      }

      if (body.remove && body.remove.length > 0) {
        const names = body.remove
          .map((n) => storedByNorm.get(normalizeCardName(n)))
          .filter((n): n is string => n !== undefined);
        if (names.length > 0) {
          await tx.deckCard.deleteMany({ where: { deckId: id, cardName: { in: names } } });
        }
      }

      if (body.setQuantity && body.setQuantity.length > 0) {
        const toDelete: string[] = [];
        for (const sq of body.setQuantity) {
          const name = storedByNorm.get(normalizeCardName(sq.cardName));
          if (!name) continue;
          if (sq.quantity <= 0) toDelete.push(name);
          else await tx.deckCard.updateMany({ where: { deckId: id, cardName: name }, data: { quantity: sq.quantity } });
        }
        if (toDelete.length > 0) {
          await tx.deckCard.deleteMany({ where: { deckId: id, cardName: { in: toDelete } } });
        }
      }
    });

    const cards = await prisma.deckCard.findMany({
      where: { deckId: id },
      orderBy: { cardName: 'asc' },
    });
    return NextResponse.json({
      cards: cards.map((c) => ({
        cardName: c.cardName,
        quantity: c.quantity,
        set: c.set,
        collectorNumber: c.collectorNumber,
        isFoil: c.isFoil,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PUT /api/decks/[id]/cards error:', error);
    return NextResponse.json({ error: 'Failed to update deck cards' }, { status: 500 });
  }
}
```

(The test's final-fetch uses the non-tx `prisma.deckCard.findMany` mock — it returns `[]`, which serializes fine.)

- [ ] **Step 6: Run both test files — expect PASS**, full suite green.
- [ ] **Step 7: Stage** — `git add -A`.

---

### Task 8: Card Library APIs (`GET /api/library`, `POST /api/library/cards`)

**Files:**
- Create: `src/app/api/library/route.ts`
- Create: `src/app/api/library/cards/route.ts`
- Test: `tests/library-api.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/library-api.test.ts`)

```ts
const mockCollectionFindMany = jest.fn()
const mockCollectionCreateMany = jest.fn()
const mockDeckFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: {
      findMany: (...a: unknown[]) => mockCollectionFindMany(...a),
      createMany: (...a: unknown[]) => mockCollectionCreateMany(...a),
    },
    deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a) },
  },
}))
const mockResolveCards = jest.fn()
jest.mock('@/lib/scryfall', () => {
  const actual = jest.requireActual('@/lib/scryfall')
  return { ...actual, resolveCards: (...a: unknown[]) => mockResolveCards(...a) }
})
// ...next/server + session mocks + makeRequest...

import { GET } from '../src/app/api/library/route'
import { POST } from '../src/app/api/library/cards/route'
import { scryfallKey } from '@/lib/scryfall'

describe('GET /api/library', () => {
  beforeEach(() => { mockGetSession.mockReset(); mockCollectionFindMany.mockReset(); mockDeckFindMany.mockReset() })

  it('returns the session user cards with deck associations by normalized name', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockCollectionFindMany.mockResolvedValue([
      { id: 'c1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', quantity: 1, condition: 'NearMint', isFoil: false, typeLine: 'Artifact', source: 'moxfield' },
    ])
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', cards: [{ cardName: 'SOL RING' }] },
      { id: 'd2', name: 'Esper', cards: [{ cardName: 'Counterspell' }] },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.cards[0].decks).toEqual([{ id: 'd1', name: 'Krenko' }])
    expect(mockCollectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } })
    )
    expect(mockDeckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: 'u1' } })
    )
  })

  it('returns empty cards + flag for the legacy admin', async () => {
    mockGetSession.mockResolvedValue(LEGACY)
    const res: any = await GET(makeRequest())
    expect(res.body).toEqual({ cards: [], isLegacyAdmin: true })
  })
})

describe('POST /api/library/cards', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockCollectionCreateMany.mockReset(); mockResolveCards.mockReset()
  })

  it('parses, resolves via Scryfall and inserts manual rows with canonical names', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('AFR', '261'), { name: 'Treasure Vault', scryfallId: 's1', set: 'afr', setName: 'Adventures in the Forgotten Realms', typeLine: 'Artifact Land', collectorNumber: '261' }],
      ]),
      notFound: [],
    })
    const res: any = await POST(makeRequest({ text: '2 Treasure Vault (AFR) 261 *F*' }))
    expect(res.status).toBe(200)
    expect(res.body.added).toEqual([{ cardName: 'Treasure Vault', quantity: 2 }])
    expect(res.body.errors).toEqual([])
    const data = mockCollectionCreateMany.mock.calls[0][0].data
    expect(data[0]).toEqual(
      expect.objectContaining({ userId: 'u1', cardName: 'Treasure Vault', source: 'manual', condition: 'NearMint', isFoil: true, quantity: 2 })
    )
  })

  it('reports per-line errors (parse failure, missing set/number, Scryfall miss) but inserts valid rows', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('C21', '263'), { name: 'Sol Ring', scryfallId: 's2', set: 'c21', setName: 'Commander 2021', typeLine: 'Artifact', collectorNumber: '263' }],
      ]),
      notFound: [{ set: 'xxx', collectorNumber: '1' }],
    })
    const res: any = await POST(
      makeRequest({ text: 'garbage line\n1 Sol Ring\n1 Fake Card (XXX) 1\n1 Sol Ring (C21) 263' })
    )
    expect(res.body.added).toEqual([{ cardName: 'Sol Ring', quantity: 1 }])
    expect(res.body.errors).toHaveLength(3)
    expect(res.body.errors.map((e: { line: number }) => e.line)).toEqual([1, 2, 3])
  })

  it('502s when Scryfall is down, inserting nothing', async () => {
    mockGetSession.mockResolvedValue(MEMBER)
    mockResolveCards.mockRejectedValue(new Error('Scryfall returned 503'))
    const res: any = await POST(makeRequest({ text: '1 Sol Ring (C21) 263' }))
    expect(res.status).toBe(502)
    expect(mockCollectionCreateMany).not.toHaveBeenCalled()
  })

  it('403s the legacy admin', async () => {
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await POST(makeRequest({ text: '1 X (Y) 1' }))) as any).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (modules missing).

- [ ] **Step 3: Implement `src/app/api/library/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { normalizeCardName } from '@/lib/parseMoxfield';

export async function GET(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.isLegacyAdmin) {
      return NextResponse.json({ cards: [], isLegacyAdmin: true });
    }

    const cards = await prisma.collectionCard.findMany({
      where: { userId: session.userId },
      orderBy: { cardName: 'asc' },
    });
    const decks = await prisma.deck.findMany({
      where: { ownerUserId: session.userId },
      include: { cards: { select: { cardName: true } } },
    });

    const decksByCard = new Map<string, { id: string; name: string }[]>();
    for (const d of decks) {
      for (const dc of d.cards) {
        const key = normalizeCardName(dc.cardName);
        const list = decksByCard.get(key) ?? [];
        list.push({ id: d.id, name: d.name });
        decksByCard.set(key, list);
      }
    }

    return NextResponse.json({
      cards: cards.map((c) => ({
        id: c.id,
        cardName: c.cardName,
        set: c.set,
        setName: c.setName,
        quantity: c.quantity,
        condition: c.condition,
        isFoil: c.isFoil,
        typeLine: c.typeLine,
        source: c.source,
        decks: decksByCard.get(normalizeCardName(c.cardName)) ?? [],
      })),
      isLegacyAdmin: false,
    });
  } catch (error) {
    console.error('GET /api/library error:', error);
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement `src/app/api/library/cards/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { parseMoxfieldText, type ParsedMoxfieldCard } from '@/lib/parseMoxfield';
import { resolveCards, scryfallKey } from '@/lib/scryfall';

const bodySchema = z.object({ text: z.string().min(1).max(50_000) });

export async function POST(request: Request) {
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
    if (session.isLegacyAdmin) {
      return NextResponse.json(
        { error: 'Create your account via an invite to use the library' },
        { status: 403 }
      );
    }

    const { text } = bodySchema.parse(await request.json());
    const parsed = parseMoxfieldText(text);
    const errors: Array<{ line: number; raw: string; reason: string }> = [...parsed.errors];

    const resolvable: ParsedMoxfieldCard[] = [];
    for (const c of parsed.cards) {
      if (!c.set || !c.collectorNumber) {
        errors.push({
          line: c.line,
          raw: `${c.quantity} ${c.name}`,
          reason: 'Set and collector number are required to add to library',
        });
      } else {
        resolvable.push(c);
      }
    }

    let added: Array<{ cardName: string; quantity: number }> = [];
    if (resolvable.length > 0) {
      let resolved;
      try {
        resolved = await resolveCards(
          resolvable.map((c) => ({ set: c.set as string, collectorNumber: c.collectorNumber as string }))
        );
      } catch (error) {
        console.error('Scryfall lookup failed:', error);
        return NextResponse.json({ error: 'Scryfall lookup failed — try again' }, { status: 502 });
      }

      const data: Array<Record<string, unknown>> = [];
      for (const c of resolvable) {
        const hit = resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string));
        if (!hit) {
          errors.push({ line: c.line, raw: `${c.quantity} ${c.name} (${c.set}) ${c.collectorNumber}`, reason: 'Card not found on Scryfall' });
          continue;
        }
        data.push({
          userId: session.userId,
          cardName: hit.name,
          scryfallId: hit.scryfallId,
          set: hit.set,
          setName: hit.setName,
          quantity: c.quantity,
          condition: 'NearMint',
          isFoil: c.isFoil,
          typeLine: hit.typeLine,
          source: 'manual',
        });
        added.push({ cardName: hit.name, quantity: c.quantity });
      }
      if (data.length > 0) {
        await prisma.collectionCard.createMany({ data: data as never });
      }
    }

    errors.sort((a, b) => a.line - b.line);
    return NextResponse.json({ added, errors });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/library/cards error:', error);
    return NextResponse.json({ error: 'Failed to add cards' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run — expect PASS**, full suite green.
- [ ] **Step 6: Stage** — `git add -A`.

---

### Task 9: Moxfield deck import (`POST /api/decks/import`)

**Files:**
- Create: `src/app/api/decks/import/route.ts`
- Test: `tests/deck-import-api.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/deck-import-api.test.ts`)

```ts
const mockCollectionFindMany = jest.fn()
const mockCollectionCreateMany = jest.fn()
const mockDeckFindMany = jest.fn()
const mockDeckCreate = jest.fn()
const tx = {
  collectionCard: { createMany: (...a: unknown[]) => mockCollectionCreateMany(...a) },
  deck: { create: (...a: unknown[]) => mockDeckCreate(...a) },
}
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a) },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}))
const mockResolveCards = jest.fn()
jest.mock('@/lib/scryfall', () => {
  const actual = jest.requireActual('@/lib/scryfall')
  return { ...actual, resolveCards: (...a: unknown[]) => mockResolveCards(...a) }
})
// ...next/server + session mocks + makeRequest...

import { POST } from '../src/app/api/decks/import/route'
import { scryfallKey } from '@/lib/scryfall'

const TEXT = '1 Sol Ring (C21) 263\n2 Treasure Vault (AFR) 261 *F*'

describe('POST /api/decks/import', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockCollectionFindMany.mockReset(); mockCollectionCreateMany.mockReset()
    mockDeckFindMany.mockReset(); mockDeckCreate.mockReset(); mockResolveCards.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    mockDeckFindMany.mockResolvedValue([])
    mockDeckCreate.mockResolvedValue({ id: 'new-deck', name: 'Imported' })
  })

  it('dryRun diffs against the library and lists missing cards without writing', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(makeRequest({ name: 'Imported', text: TEXT, dryRun: true }))
    expect(res.status).toBe(200)
    expect(res.body.missing).toEqual([
      { line: 2, cardName: 'Treasure Vault', set: 'AFR', collectorNumber: '261' },
    ])
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('commit with addMissingToLibrary=false imports only library cards and reports the excluded', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: TEXT, dryRun: false, addMissingToLibrary: false })
    )
    expect(res.status).toBe(201)
    expect(res.body.excluded).toEqual(['Treasure Vault'])
    const createArg = mockDeckCreate.mock.calls[0][0].data
    expect(createArg.cards.create).toEqual([
      expect.objectContaining({ cardName: 'Sol Ring', quantity: 1 }),
    ])
    expect(mockCollectionCreateMany).not.toHaveBeenCalled()
  })

  it('commit with addMissingToLibrary=true resolves missing, adds them to library, imports all', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    mockResolveCards.mockResolvedValue({
      found: new Map([
        [scryfallKey('AFR', '261'), { name: 'Treasure Vault', scryfallId: 's1', set: 'afr', setName: 'AFR', typeLine: 'Artifact Land', collectorNumber: '261' }],
      ]),
      notFound: [],
    })
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: TEXT, dryRun: false, addMissingToLibrary: true })
    )
    expect(res.status).toBe(201)
    expect(res.body.addedToLibrary).toBe(1)
    expect(mockCollectionCreateMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({ cardName: 'Treasure Vault', source: 'manual', quantity: 2, isFoil: true })
    )
    const deckCards = mockDeckCreate.mock.calls[0][0].data.cards.create
    expect(deckCards).toHaveLength(2)
  })

  it('422s addMissing commits when a missing card cannot be resolved (nothing written)', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    mockResolveCards.mockResolvedValue({ found: new Map(), notFound: [{ set: 'c21', collectorNumber: '263' }] })
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: '1 Sol Ring (C21) 263', dryRun: false, addMissingToLibrary: true })
    )
    expect(res.status).toBe(422)
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('422s addMissing commits when a missing card has no set/collector number', async () => {
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await POST(
      makeRequest({ name: 'Imported', text: '1 Sol Ring', dryRun: false, addMissingToLibrary: true })
    )
    expect(res.status).toBe(422)
  })

  it('merges duplicate names (two printings) into one deck card with summed quantity', async () => {
    mockCollectionFindMany.mockResolvedValue([{ cardName: 'Sol Ring' }])
    const res: any = await POST(
      makeRequest({
        name: 'Imported',
        text: '1 Sol Ring (C21) 263\n2 Sol Ring (CM2) 184',
        dryRun: false,
        addMissingToLibrary: false,
      })
    )
    expect(res.status).toBe(201)
    const deckCards = mockDeckCreate.mock.calls[0][0].data.cards.create
    expect(deckCards).toEqual([expect.objectContaining({ cardName: 'Sol Ring', quantity: 3, set: 'C21' })])
  })

  it('409s duplicate deck names and 403s the legacy admin', async () => {
    mockDeckFindMany.mockResolvedValue([{ name: 'imported' }])
    mockCollectionFindMany.mockResolvedValue([])
    const res: any = await POST(makeRequest({ name: 'Imported', text: '1 Sol Ring', dryRun: false, addMissingToLibrary: false }))
    expect(res.status).toBe(409)
    mockGetSession.mockResolvedValue(LEGACY)
    expect(((await POST(makeRequest({ name: 'X', text: 'y', dryRun: true }))) as any).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** `npx jest tests/deck-import-api.test.ts`

- [ ] **Step 3: Implement `src/app/api/decks/import/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import {
  parseMoxfieldText,
  buildLibraryNameIndex,
  findLibraryName,
  normalizeCardName,
  type ParsedMoxfieldCard,
} from '@/lib/parseMoxfield';
import { resolveCards, scryfallKey } from '@/lib/scryfall';

const importSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name too long'),
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

export async function POST(request: Request) {
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
    if (session.isLegacyAdmin) {
      return NextResponse.json(
        { error: 'Create your account via an invite to import decks' },
        { status: 403 }
      );
    }

    const { name, text, dryRun, addMissingToLibrary } = importSchema.parse(await request.json());

    const { cards, errors } = parseMoxfieldText(text);
    const lib = await prisma.collectionCard.findMany({
      where: { userId: session.userId },
      select: { cardName: true },
    });
    const libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));

    const present: Array<{ card: ParsedMoxfieldCard; canonical: string }> = [];
    const missing: ParsedMoxfieldCard[] = [];
    for (const c of cards) {
      const canonical = findLibraryName(libIndex, c.name);
      if (canonical) present.push({ card: c, canonical });
      else missing.push(c);
    }

    if (dryRun) {
      return NextResponse.json({
        cards: cards.map((c) => ({ line: c.line, quantity: c.quantity, name: c.name, set: c.set ?? null, collectorNumber: c.collectorNumber ?? null, isFoil: c.isFoil })),
        missing: missing.map((c) => ({ line: c.line, cardName: c.name, set: c.set ?? null, collectorNumber: c.collectorNumber ?? null })),
        errors,
      });
    }

    // ---- commit ----
    if (missing.length > 0 && typeof addMissingToLibrary !== 'boolean') {
      return NextResponse.json(
        { error: 'addMissingToLibrary is required when cards are missing from your library' },
        { status: 400 }
      );
    }

    const mine = await prisma.deck.findMany({
      where: { ownerUserId: session.userId },
      select: { name: true },
    });
    if (mine.some((d) => d.name.trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
    }

    // Merge duplicate names (different printings) — quantities sum, first printing wins.
    const deckCardMap = new Map<string, DeckCardDraft>();
    const addDraft = (cardName: string, c: ParsedMoxfieldCard) => {
      const key = normalizeCardName(cardName);
      const existing = deckCardMap.get(key);
      if (existing) existing.quantity += c.quantity;
      else deckCardMap.set(key, { cardName, quantity: c.quantity, set: c.set, collectorNumber: c.collectorNumber, isFoil: c.isFoil });
    };
    for (const { card, canonical } of present) addDraft(canonical, card);

    const libraryInserts: Array<Record<string, unknown>> = [];
    let excluded: string[] = [];

    if (missing.length > 0 && addMissingToLibrary) {
      const unresolvable = missing.filter((c) => !c.set || !c.collectorNumber);
      if (unresolvable.length > 0) {
        return NextResponse.json(
          { error: 'Some missing cards lack a set/collector number and cannot be added to your library', cards: unresolvable.map((c) => c.name) },
          { status: 422 }
        );
      }
      let resolved;
      try {
        resolved = await resolveCards(missing.map((c) => ({ set: c.set as string, collectorNumber: c.collectorNumber as string })));
      } catch (error) {
        console.error('Scryfall lookup failed:', error);
        return NextResponse.json({ error: 'Scryfall lookup failed — try again' }, { status: 502 });
      }
      const notFound = missing.filter((c) => !resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string)));
      if (notFound.length > 0) {
        return NextResponse.json(
          { error: 'Some cards could not be resolved on Scryfall — fix those lines and retry', cards: notFound.map((c) => `${c.name} (${c.set}) ${c.collectorNumber}`) },
          { status: 422 }
        );
      }
      for (const c of missing) {
        const hit = resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string))!;
        libraryInserts.push({
          userId: session.userId,
          cardName: hit.name,
          scryfallId: hit.scryfallId,
          set: hit.set,
          setName: hit.setName,
          quantity: c.quantity,
          condition: 'NearMint',
          isFoil: c.isFoil,
          typeLine: hit.typeLine,
          source: 'manual',
        });
        addDraft(hit.name, c);
      }
    } else if (missing.length > 0) {
      excluded = missing.map((c) => c.name);
    }

    const deck = await prisma.$transaction(async (tx) => {
      if (libraryInserts.length > 0) {
        await tx.collectionCard.createMany({ data: libraryInserts as never });
      }
      return tx.deck.create({
        data: {
          name,
          ownerUserId: session.userId,
          cards: { create: Array.from(deckCardMap.values()) },
        },
      });
    });

    return NextResponse.json(
      {
        deck: { id: deck.id, name: deck.name, cardCount: deckCardMap.size },
        addedToLibrary: libraryInserts.length,
        excluded,
        errors,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks/import error:', error);
    return NextResponse.json({ error: 'Failed to import deck' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run — expect PASS**, full suite green.
- [ ] **Step 5: Stage** — `git add -A`.

---

### Task 10: Games-tab deck auto-creation

**Files:**
- Create: `src/lib/deckAutoCreate.ts`
- Modify: `src/app/api/games/route.ts` (POST — after the game transaction, before the response)
- Modify: `src/app/api/games/[id]/route.ts` (PATCH — after the successful update, before the response)
- Test: `tests/deck-autocreate.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/deck-autocreate.test.ts`)

```ts
const mockDeckFindMany = jest.fn()
const mockDeckCreate = jest.fn()
const mockUserFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findMany: (...a: unknown[]) => mockDeckFindMany(...a), create: (...a: unknown[]) => mockDeckCreate(...a) },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) },
  },
}))

import { ensureDecksForParticipants } from '@/lib/deckAutoCreate'

describe('ensureDecksForParticipants', () => {
  beforeEach(() => {
    mockDeckFindMany.mockReset(); mockDeckCreate.mockReset(); mockUserFindMany.mockReset()
    mockDeckFindMany.mockResolvedValue([])
    mockUserFindMany.mockResolvedValue([{ id: 'u-bob', name: 'Bob' }])
    mockDeckCreate.mockResolvedValue({})
  })

  it('creates a name-only deck owned by the user matching the playerName', async () => {
    await ensureDecksForParticipants([
      { playerName: 'bob', deckName: 'New Brew', isRandom: false },
    ])
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'New Brew', ownerUserId: 'u-bob' } })
  })

  it('creates ownerless decks for unknown players', async () => {
    await ensureDecksForParticipants([
      { playerName: 'Stranger', deckName: 'Mystery', isRandom: false },
    ])
    expect(mockDeckCreate).toHaveBeenCalledWith({ data: { name: 'Mystery', ownerUserId: null } })
  })

  it('skips random participants entirely', async () => {
    await ensureDecksForParticipants([
      { playerName: 'Bob', deckName: 'Arena Netdeck', isRandom: true },
    ])
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('skips existing deck names (case-insensitive, any owner) and empty deckNames', async () => {
    mockDeckFindMany.mockResolvedValue([{ name: 'Krenko' }])
    await ensureDecksForParticipants([
      { playerName: 'Bob', deckName: 'KRENKO', isRandom: false },
      { playerName: 'Bob', deckName: '  ', isRandom: false },
      { playerName: 'Bob', deckName: undefined, isRandom: false },
    ])
    expect(mockDeckCreate).not.toHaveBeenCalled()
  })

  it('dedupes within one call (two rows, same new deck)', async () => {
    await ensureDecksForParticipants([
      { playerName: 'Bob', deckName: 'Shared Precon', isRandom: false },
      { playerName: 'Stranger', deckName: 'shared precon', isRandom: false },
    ])
    expect(mockDeckCreate).toHaveBeenCalledTimes(1)
  })

  it('never throws — a deck failure must not fail the game save', async () => {
    mockDeckFindMany.mockRejectedValue(new Error('db down'))
    await expect(
      ensureDecksForParticipants([{ playerName: 'Bob', deckName: 'X', isRandom: false }])
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** `npx jest tests/deck-autocreate.test.ts`

- [ ] **Step 3: Implement `src/lib/deckAutoCreate.ts`**

```ts
// Games-tab deck auto-creation (issue #7): a new deckName typed into the game
// form becomes a real name-only Deck (no card associations). Owner = the User
// whose name matches the participant's playerName; no match -> ownerless.
// Random participants' decks are never saved. Best-effort by design: any
// failure here logs and returns — the game save must never fail because of it.
import { prisma } from './prisma';

export interface ParticipantDeckInfo {
  playerName: string;
  deckName?: string;
  isRandom: boolean;
}

export async function ensureDecksForParticipants(
  participants: ParticipantDeckInfo[]
): Promise<void> {
  try {
    const candidates = participants.filter(
      (p) => !p.isRandom && p.deckName && p.deckName.trim().length > 0
    );
    if (candidates.length === 0) return;

    const [decks, users] = await Promise.all([
      prisma.deck.findMany({ select: { name: true } }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    const existing = new Set(decks.map((d) => d.name.trim().toLowerCase()));
    const usersByName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]));

    for (const p of candidates) {
      const deckName = (p.deckName as string).trim();
      const key = deckName.toLowerCase();
      if (existing.has(key)) continue;
      const ownerUserId = usersByName.get(p.playerName.trim().toLowerCase()) ?? null;
      await prisma.deck.create({ data: { name: deckName, ownerUserId } });
      existing.add(key);
    }
  } catch (error) {
    console.error('Deck auto-creation failed (game save unaffected):', error);
  }
}
```

- [ ] **Step 4: Wire into the games routes**

In `src/app/api/games/route.ts` POST, after the `prisma.$transaction(...)` resolves and before `return NextResponse.json({ game }, { status: 201 })`:

```ts
    await ensureDecksForParticipants(participants);
```

with import `import { ensureDecksForParticipants } from '@/lib/deckAutoCreate';`.

In `src/app/api/games/[id]/route.ts` PATCH, after the update transaction succeeds and before the success response, call the same with the parsed participants array (`invariantResult` flow — use the participants that were persisted). Read the existing PATCH handler carefully to find the persisted-participants variable; pass `{ playerName, deckName, isRandom }` for each.

- [ ] **Step 5: Run — expect PASS**, full suite green (existing games tests must still pass — `ensureDecksForParticipants` swallows its own errors, and tests that don't mock `prisma.deck` will hit the catch path harmlessly. If an existing games-route test asserts strict mock calls, extend its prisma mock with `deck.findMany`/`user.findMany` returning `[]`).
- [ ] **Step 6: Stage** — `git add -A`.

---

### Task 11: Admin deck assignment (`/api/admin/decks`) — COMMIT B

**Files:**
- Create: `src/app/api/admin/decks/route.ts` (GET — list all decks for admin UI)
- Create: `src/app/api/admin/decks/[id]/route.ts` (PATCH — assign/clear owner)
- Test: `tests/admin-decks.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/admin-decks.test.ts`)

```ts
const mockDeckFindMany = jest.fn()
const mockDeckFindUnique = jest.fn()
const mockDeckUpdate = jest.fn()
const mockUserFindUnique = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    deck: {
      findMany: (...a: unknown[]) => mockDeckFindMany(...a),
      findUnique: (...a: unknown[]) => mockDeckFindUnique(...a),
      update: (...a: unknown[]) => mockDeckUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}))
// ...next/server + session mocks + makeRequest...

import { GET } from '../src/app/api/admin/decks/route'
import { PATCH } from '../src/app/api/admin/decks/[id]/route'

const params = { params: Promise.resolve({ id: 'd1' }) }

describe('admin decks', () => {
  beforeEach(() => {
    mockGetSession.mockReset(); mockDeckFindMany.mockReset(); mockDeckFindUnique.mockReset()
    mockDeckUpdate.mockReset(); mockUserFindUnique.mockReset()
  })

  it('GET lists decks with owner + card count, ADMIN only', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindMany.mockResolvedValue([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', owner: { name: 'Alice' }, _count: { cards: 5 } },
      { id: 'd2', name: 'Slivers', ownerUserId: null, owner: null, _count: { cards: 0 } },
    ])
    const res: any = await GET(makeRequest())
    expect(res.body.decks).toEqual([
      { id: 'd1', name: 'Krenko', ownerUserId: 'u1', ownerName: 'Alice', cardCount: 5 },
      { id: 'd2', name: 'Slivers', ownerUserId: null, ownerName: null, cardCount: 0 },
    ])
    mockGetSession.mockResolvedValue(MEMBER)
    expect(((await GET(makeRequest())) as any).status).toBe(403)
  })

  it('PATCH assigns an owner after verifying the user exists', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', ownerUserId: null })
    mockUserFindUnique.mockResolvedValue({ id: 'u1' })
    mockDeckUpdate.mockResolvedValue({ id: 'd1', ownerUserId: 'u1' })
    const res: any = await PATCH(makeRequest({ ownerUserId: 'u1' }), params)
    expect(res.status).toBe(200)
    expect(mockDeckUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { ownerUserId: 'u1' } })
  })

  it('PATCH null clears the owner; unknown target user 400s; unknown deck 404s; MEMBER 403s', async () => {
    mockGetSession.mockResolvedValue(ADMIN)
    mockDeckFindUnique.mockResolvedValue({ id: 'd1', ownerUserId: 'u1' })
    mockDeckUpdate.mockResolvedValue({})
    expect(((await PATCH(makeRequest({ ownerUserId: null }), params)) as any).status).toBe(200)

    mockUserFindUnique.mockResolvedValue(null)
    expect(((await PATCH(makeRequest({ ownerUserId: 'ghost' }), params)) as any).status).toBe(400)

    mockDeckFindUnique.mockResolvedValue(null)
    expect(((await PATCH(makeRequest({ ownerUserId: null }), params)) as any).status).toBe(404)

    mockGetSession.mockResolvedValue(MEMBER)
    expect(((await PATCH(makeRequest({ ownerUserId: null }), params)) as any).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/app/api/admin/decks/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
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
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const decks = await prisma.deck.findMany({
      include: { owner: { select: { name: true } }, _count: { select: { cards: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({
      decks: decks.map((d) => ({
        id: d.id,
        name: d.name,
        ownerUserId: d.ownerUserId,
        ownerName: d.owner?.name ?? null,
        cardCount: d._count.cards,
      })),
    });
  } catch (error) {
    console.error('GET /api/admin/decks error:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implement `src/app/api/admin/decks/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

const assignSchema = z.object({ ownerUserId: z.string().min(1).nullable() });

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
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const { ownerUserId } = assignSchema.parse(await request.json());

    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ownerUserId !== null) {
      const user = await prisma.user.findUnique({ where: { id: ownerUserId } });
      if (!user) return NextResponse.json({ error: 'Target user not found' }, { status: 400 });
    }

    const updated = await prisma.deck.update({ where: { id }, data: { ownerUserId } });
    return NextResponse.json({ deck: { id: updated.id, ownerUserId: updated.ownerUserId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PATCH /api/admin/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update deck owner' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run — expect PASS**, full suite green.

- [ ] **Step 6: COMMIT B**

```bash
git add -A
git commit -m "feat(api): deck/library/import routes, games deck auto-create, admin deck assignment (#7)

- GET /api/decks rewritten: tiered {userDecks, otherDecks} from the Deck table
- deck CRUD with owner-only writes; legacy bootstrap admin gets 403
- GET /api/library with deck associations; plaintext add via Scryfall batch
- POST /api/decks/import: stateless two-phase (dryRun diff -> yes/no commit)
- game saves auto-create name-only decks (player-name owner match, random
  rows skipped, best-effort so game saves never fail)
- PATCH /api/admin/decks/[id]: assign/reassign/clear deck owner"
```

---

### Task 12: Combobox grouped mode + tiered game-form dropdown

**Files:**
- Modify: `src/app/components/combobox.tsx`
- Modify: `src/app/games/game-form.tsx`
- Test: `tests/combobox-groups.test.ts`

- [ ] **Step 1: Write the failing tests** (`tests/combobox-groups.test.ts`)

```ts
import { groupSections, filterItems, shouldShowAddNew } from '@/app/components/combobox'

const groups = [
  { label: 'User decks', items: ['Krenko Goblins', 'Esper Control'] },
  { label: 'Borrowed decks', items: ['Slivers'] },
]

describe('groupSections', () => {
  it('filters each group, drops empty ones, and starts offsets at 0', () => {
    expect(groupSections(groups, 'sliv', undefined)).toEqual([
      { label: 'Borrowed decks', items: ['Slivers'], start: 0 },
    ])
    // flattened section items always equal the flat-filtered union
    expect(groupSections(groups, 'e', undefined).flatMap((s) => s.items)).toEqual(
      filterItems(groups.flatMap((g) => g.items), 'e')
    )
  })

  it('drops empty groups and keeps offsets contiguous', () => {
    const sections = groupSections(groups, '', undefined)
    expect(sections).toEqual([
      { label: 'User decks', items: ['Krenko Goblins', 'Esper Control'], start: 0 },
      { label: 'Borrowed decks', items: ['Slivers'], start: 2 },
    ])
  })

  it('add-new check runs against ALL group items so borrowed names are never offered as new', () => {
    const all = groups.flatMap((g) => g.items)
    expect(shouldShowAddNew(all, 'Slivers')).toBe(false) // exact borrowed match
    expect(shouldShowAddNew(all, 'Brand New Deck')).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`groupSections` not exported). `npx jest tests/combobox-groups.test.ts`

- [ ] **Step 3: Modify `src/app/components/combobox.tsx`**

Add after `shouldShowExcludedNotice`:

```ts
export interface ComboboxGroup {
  label: string;
  items: string[];
}

export interface ComboboxSection {
  label: string;
  items: string[];
  start: number; // global option index of this section's first item (headers are not options)
}

// Pure helper for grouped mode: filter each group, drop empty ones, and assign
// contiguous global option offsets so keyboard navigation indexes stay flat.
export function groupSections(
  groups: ComboboxGroup[],
  inputValue: string,
  excludeItems?: string[]
): ComboboxSection[] {
  const sections: ComboboxSection[] = [];
  let offset = 0;
  for (const g of groups) {
    const items = filterItems(g.items, inputValue, excludeItems);
    if (items.length === 0) continue;
    sections.push({ label: g.label, items, start: offset });
    offset += items.length;
  }
  return sections;
}
```

Update `ComboboxProps`: make `items` optional and add `groups`:

```ts
export interface ComboboxProps {
  items?: string[];
  groups?: ComboboxGroup[];      // grouped mode (issue #7 deck tiers) — overrides items
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addLabel?: string;
  id?: string;
  excludeItems?: string[];
  excludeLabel?: string;
}
```

In the component body, change the destructuring default (`items = []`) and replace the `filtered`/`showAddNew` derivation:

```ts
  const sections = groups ? groupSections(groups, inputValue, excludeItems) : null;
  const allItems = groups ? groups.flatMap((g) => g.items) : items;
  const filtered = sections ? sections.flatMap((s) => s.items) : filterItems(items, inputValue, excludeItems);
  const showExcluded = shouldShowExcludedNotice(excludeItems, inputValue);
  const showAddNew = !showExcluded && shouldShowAddNew(allItems, inputValue);
```

(`totalRows`, `addNewIndex`, keyboard handling all keep working off `filtered`.)

Replace the flat `{filtered.map(...)}` render block with a sectioned render (same `<li>` markup as today for items — only the wrapper changes). Import `Fragment` from react:

```tsx
          {(sections ?? [{ label: '', items: filtered, start: 0 }]).map((section) => (
            <Fragment key={section.label || '__flat__'}>
              {section.label && (
                <li
                  role="presentation"
                  className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted bg-surface-hover/50 border-t first:border-t-0 border-border select-none"
                >
                  {section.label}
                </li>
              )}
              {section.items.map((item, j) => {
                const i = section.start + j;
                return (
                  <li
                    key={`${section.label}-${item}`}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={highlightedIndex === i}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(item);
                    }}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`px-3 py-2 cursor-pointer ${
                      highlightedIndex === i ? 'bg-accent-muted text-accent' : 'text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    {item}
                  </li>
                );
              })}
            </Fragment>
          ))}
```

Group headers use `role="presentation"` so they are invisible to the listbox option indexing and keyboard navigation.

- [ ] **Step 4: Modify `src/app/games/game-form.tsx`**

Replace the `deckItems` state with two tiers and adapt the fetch (new `/api/decks` shape):

```ts
  const [userDeckNames, setUserDeckNames] = useState<string[]>([]);
  const [otherDeckNames, setOtherDeckNames] = useState<string[]>([]);
```

In the seeding `useEffect`, replace the decks branch:

```ts
        if (dRes.ok) {
          const data = await dRes.json();
          setUserDeckNames(
            Array.isArray(data.userDecks) ? data.userDecks.map((d: { name: string }) => d.name) : []
          );
          setOtherDeckNames(
            Array.isArray(data.otherDecks) ? data.otherDecks.map((d: { name: string }) => d.name) : []
          );
        }
```

Replace the deck `Combobox` in the participants render (import `tieredDeckItems` from `@/lib/deckTiers`):

```tsx
            <Combobox
              groups={tieredDeckItems(userDeckNames, otherDeckNames, r.deckName)}
              value={r.deckName}
              onChange={(v) => updateRow(i, { deckName: v })}
              placeholder="Deck (optional)"
              addLabel="deck"
            />
```

(`r.deckName` tracks every keystroke — the Combobox's optimistic `onChange` keeps it in sync — so the tier decision re-evaluates per keystroke, which is exactly the "Borrowed only when search yields no user decks" rule.)

- [ ] **Step 5: Run — expect PASS** (`npx jest tests/combobox-groups.test.ts`), then full suite (existing combobox/game-form tests must stay green).
- [ ] **Step 6: Stage** — `git add -A`.

---

### Task 13: Deck List, Deck Detail, and Card Library pages + nav

**Files:**
- Create: `src/app/decks/page.tsx`
- Create: `src/app/decks/[id]/page.tsx`
- Create: `src/app/library/page.tsx`
- Modify: `src/app/components/header.tsx` (navLinks)

No new unit tests (client components; the API logic they call is already covered). Verify by `npx tsc --noEmit` + the dev-server smoke test in Task 15.

- [ ] **Step 1: Add nav links in `src/app/components/header.tsx`**

```ts
  const navLinks = [
    { href: "/checkDeck", label: "Friend Collections" },
    { href: "/decks", label: "My Decks" },
    { href: "/library", label: "Library" },
    { href: "/games", label: "Games" },
    { href: "/stats", label: "Stats" },
    { href: "/SearchLGS", label: "LGS Search" },
  ]
```

- [ ] **Step 2: Create `src/app/decks/page.tsx`**

```tsx
"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

interface DeckSummary { id: string; name: string; cardCount: number }
interface MissingCard { line: number; cardName: string; set: string | null; collectorNumber: string | null }
interface ImportError { line: number; raw: string; reason: string }

export default function DecksPage() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [isLegacyAdmin, setIsLegacyAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // create form
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");

  // import flow: idle -> editing -> prompt (missing list) -> done
  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [missing, setMissing] = useState<MissingCard[] | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const loadDecks = async () => {
    try {
      const res = await fetch("/api/decks");
      if (!res.ok) throw new Error("Failed to load decks");
      const data = await res.json();
      setDecks(Array.isArray(data.userDecks) ? data.userDecks : []);
      setIsLegacyAdmin(Boolean(data.isLegacyAdmin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadDecks(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError("");
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateError(typeof data.error === "string" ? data.error : "Failed to create deck");
      return;
    }
    setNewName("");
    await loadDecks();
  };

  const runImport = async (body: Record<string, unknown>) => {
    setIsImporting(true);
    setImportStatus("");
    try {
      const res = await fetch("/api/decks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: importName, text: importText, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(data.cards) ? `: ${data.cards.join(", ")}` : "";
        setImportStatus(`${typeof data.error === "string" ? data.error : "Import failed"}${detail}`);
        return;
      }
      if (body.dryRun) {
        setImportErrors(Array.isArray(data.errors) ? data.errors : []);
        if (Array.isArray(data.missing) && data.missing.length > 0) {
          setMissing(data.missing); // show the yes/no prompt
        } else {
          // nothing missing — commit immediately
          await runImport({ dryRun: false, addMissingToLibrary: false });
        }
        return;
      }
      // committed
      setShowImport(false);
      setImportName("");
      setImportText("");
      setMissing(null);
      setImportErrors([]);
      await loadDecks();
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) return <div className="py-8 text-muted">Loading…</div>;

  return (
    <div className="py-8">
      <h1 className="text-3xl mb-2">My Decks</h1>
      <p className="text-muted mb-6">Create decks and fill them with cards from your library.</p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isLegacyAdmin ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          The bootstrap admin has no library or decks — create your account via an invite first.
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <form onSubmit={handleCreate} className="flex gap-2 flex-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New deck name"
                maxLength={100}
                className="flex-1 px-3 py-2 rounded-md border border-border bg-surface text-foreground"
              />
              <button
                type="submit"
                disabled={newName.trim().length === 0}
                className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
              >
                Create
              </button>
            </form>
            <button
              onClick={() => setShowImport((v) => !v)}
              className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              {showImport ? "Cancel import" : "Import from Moxfield"}
            </button>
          </div>
          {createError && <p className="text-sm text-red-400 -mt-6 mb-6">{createError}</p>}

          {showImport && (
            <div className="rounded-lg border border-border bg-surface p-4 mb-8 space-y-3">
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Deck name"
                maxLength={100}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"1 Treasure Vault (AFR) 261 *F*\n1 Spikefield Hazard / Spikefield Cave (ZNR) 166 *F*\n1 Secluded Starforge (EOE) 257"}
                className="w-full h-48 p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm"
              />
              {missing === null ? (
                <button
                  onClick={() => runImport({ dryRun: true })}
                  disabled={isImporting || importName.trim().length === 0 || importText.trim().length === 0}
                  className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? "Checking…" : "Import"}
                </button>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-amber-400 font-medium">
                    {missing.length} card{missing.length !== 1 ? "s are" : " is"} not in your library:
                  </p>
                  <pre className="text-xs text-foreground/80 max-h-40 overflow-auto whitespace-pre-wrap">
                    {missing.map((m) => m.cardName).join("\n")}
                  </pre>
                  <p className="text-sm text-muted">Add them to your library?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => runImport({ dryRun: false, addMissingToLibrary: true })}
                      disabled={isImporting}
                      className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                    >
                      Yes — add to library
                    </button>
                    <button
                      onClick={() => runImport({ dryRun: false, addMissingToLibrary: false })}
                      disabled={isImporting}
                      className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
                    >
                      No — import without them
                    </button>
                  </div>
                </div>
              )}
              {importStatus && <p className="text-sm text-red-400">{importStatus}</p>}
              {importErrors.length > 0 && (
                <div className="text-xs text-amber-400">
                  {importErrors.map((e) => (
                    <p key={e.line}>Line {e.line}: {e.reason} — “{e.raw}”</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {decks.length === 0 ? (
            <p className="text-muted text-sm">No decks yet — create one above or add one while logging a game.</p>
          ) : (
            <div className="space-y-2">
              {decks.map((deck) => (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:border-accent/40 hover:bg-surface transition-colors"
                >
                  <span className="font-semibold">{deck.name}</span>
                  <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">
                    {deck.cardCount} card{deck.cardCount !== 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/decks/[id]/page.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

interface DeckCardRow {
  cardName: string;
  quantity: number;
  set: string | null;
  collectorNumber: string | null;
  isFoil: boolean;
  inLibrary: boolean;
}
interface DeckDetail {
  id: string;
  name: string;
  ownerName: string | null;
  isOwner: boolean;
  cards: DeckCardRow[];
}
interface LibraryCard { id: string; cardName: string; set: string; isFoil: boolean }

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [library, setLibrary] = useState<LibraryCard[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadDeck = useCallback(async () => {
    const res = await fetch(`/api/decks/${id}`);
    if (!res.ok) {
      setError(res.status === 404 ? "Deck not found" : "Failed to load deck");
      return;
    }
    const data = await res.json();
    setDeck(data.deck);
  }, [id]);

  useEffect(() => { loadDeck(); }, [loadDeck]);

  useEffect(() => {
    if (!deck?.isOwner) return;
    (async () => {
      const res = await fetch("/api/library");
      if (res.ok) {
        const data = await res.json();
        setLibrary(Array.isArray(data.cards) ? data.cards : []);
      }
    })();
  }, [deck?.isOwner]);

  const mutateCards = async (body: Record<string, unknown>) => {
    setError("");
    const res = await fetch(`/api/decks/${id}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await loadDeck();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete deck "${deck?.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/decks");
    else setError("Failed to delete deck");
  };

  if (error && !deck) return <div className="py-8 text-red-400">{error}</div>;
  if (!deck) return <div className="py-8 text-muted">Loading…</div>;

  const inDeck = new Set(deck.cards.map((c) => c.cardName.toLowerCase()));
  const addable = library.filter(
    (c) =>
      !inDeck.has(c.cardName.toLowerCase()) &&
      (search.trim() === "" || c.cardName.toLowerCase().includes(search.trim().toLowerCase()))
  );
  // dedupe printings by name for the picker
  const seen = new Set<string>();
  const addableUnique = addable.filter((c) => {
    const k = c.cardName.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl">{deck.name}</h1>
        {deck.isOwner && (
          <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300 cursor-pointer">
            Delete deck
          </button>
        )}
      </div>
      <p className="text-muted mb-6">
        {deck.isOwner ? "Your deck" : deck.ownerName ? `Owned by ${deck.ownerName}` : "Ownerless deck"} ·{" "}
        {deck.cards.reduce((n, c) => n + c.quantity, 0)} cards
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {deck.cards.length === 0 ? (
        <p className="text-muted text-sm mb-8">No cards yet{deck.isOwner ? " — add some from your library below." : "."}</p>
      ) : (
        <div className="space-y-1 mb-8">
          {deck.cards.map((c) => (
            <div key={c.cardName} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{c.cardName}</span>
                {c.set && <span className="text-xs text-muted">({c.set.toUpperCase()})</span>}
                {c.isFoil && (
                  <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">Foil</span>
                )}
                {!c.inLibrary && (
                  <span className="text-xs bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded" title="Not in the owner's library">
                    not in library
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {deck.isOwner ? (
                  <>
                    <button
                      onClick={() => mutateCards({ setQuantity: [{ cardName: c.cardName, quantity: c.quantity - 1 }] })}
                      className="w-6 h-6 rounded border border-border text-muted hover:text-foreground cursor-pointer"
                      aria-label={`Decrease ${c.cardName}`}
                    >
                      −
                    </button>
                    <span className="font-mono text-xs w-6 text-center">x{c.quantity}</span>
                    <button
                      onClick={() => mutateCards({ setQuantity: [{ cardName: c.cardName, quantity: c.quantity + 1 }] })}
                      className="w-6 h-6 rounded border border-border text-muted hover:text-foreground cursor-pointer"
                      aria-label={`Increase ${c.cardName}`}
                    >
                      +
                    </button>
                    <button
                      onClick={() => mutateCards({ remove: [c.cardName] })}
                      className="ml-2 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="font-mono text-xs">x{c.quantity}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deck.isOwner && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-lg mb-3">Add from your library</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library…"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground mb-3"
          />
          <div className="max-h-72 overflow-auto space-y-1">
            {addableUnique.slice(0, 50).map((c) => (
              <button
                key={c.id}
                onClick={() => mutateCards({ add: [{ cardName: c.cardName, quantity: 1, set: c.set, isFoil: c.isFoil }] })}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-surface-hover transition-colors cursor-pointer"
              >
                + {c.cardName}
              </button>
            ))}
            {addableUnique.length === 0 && <p className="text-sm text-muted px-3 py-2">No matching library cards.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/library/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LibraryCard {
  id: string;
  cardName: string;
  set: string;
  setName: string;
  quantity: number;
  condition: string;
  isFoil: boolean;
  typeLine: string;
  source: string;
  decks: { id: string; name: string }[];
}
interface AddError { line: number; raw: string; reason: string }

const TYPE_FILTERS = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];

export default function LibraryPage() {
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [isLegacyAdmin, setIsLegacyAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [foilFilter, setFoilFilter] = useState("");      // "" | "foil" | "nonfoil"
  const [sourceFilter, setSourceFilter] = useState("");  // "" | "moxfield" | "manual"
  const [typeFilter, setTypeFilter] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState("");
  const [addErrors, setAddErrors] = useState<AddError[]>([]);
  const [addStatus, setAddStatus] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const loadCards = async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("Failed to load library");
      const data = await res.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
      setIsLegacyAdmin(Boolean(data.isLegacyAdmin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadCards(); }, []);

  const handleAdd = async () => {
    setIsAdding(true);
    setAddStatus("");
    setAddErrors([]);
    try {
      const res = await fetch("/api/library/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: addText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddStatus(typeof data.error === "string" ? data.error : "Failed to add cards");
        return;
      }
      setAddErrors(Array.isArray(data.errors) ? data.errors : []);
      setAddStatus(`Added ${data.added.length} card${data.added.length !== 1 ? "s" : ""}.`);
      if (data.added.length > 0) {
        setAddText("");
        await loadCards();
      }
    } finally {
      setIsAdding(false);
    }
  };

  const sets = Array.from(new Set(cards.map((c) => c.setName))).sort();
  const q = search.trim().toLowerCase();
  const filtered = cards.filter((c) => {
    if (q && !c.cardName.toLowerCase().includes(q)) return false;
    if (setFilter && c.setName !== setFilter) return false;
    if (foilFilter === "foil" && !c.isFoil) return false;
    if (foilFilter === "nonfoil" && c.isFoil) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (typeFilter && !c.typeLine.includes(typeFilter)) return false;
    return true;
  });

  if (isLoading) return <div className="py-8 text-muted">Loading…</div>;

  if (isLegacyAdmin) {
    return (
      <div className="py-8">
        <h1 className="text-3xl mb-4">Card Library</h1>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          The bootstrap admin has no library — create your account via an invite first.
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl">Card Library</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-surface transition-colors cursor-pointer"
        >
          {showAdd ? "Close" : "Add cards"}
        </button>
      </div>
      <p className="text-muted mb-6">{cards.length} cards · {filtered.length} shown</p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-6 space-y-3">
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder={"Moxfield format, one card per line:\n1 Treasure Vault (AFR) 261 *F*"}
            className="w-full h-36 p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={isAdding || addText.trim().length === 0}
            className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
          >
            {isAdding ? "Adding…" : "Add to library"}
          </button>
          {addStatus && <p className="text-sm text-foreground/80">{addStatus}</p>}
          {addErrors.length > 0 && (
            <div className="text-xs text-amber-400">
              {addErrors.map((e) => (
                <p key={`${e.line}-${e.raw}`}>Line {e.line}: {e.reason} — “{e.raw}”</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
          className="flex-1 min-w-48 px-3 py-2 rounded-md border border-border bg-surface text-foreground"
        />
        <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by set">
          <option value="">All sets</option>
          {sets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by type">
          <option value="">All types</option>
          {TYPE_FILTERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={foilFilter} onChange={(e) => setFoilFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by foil">
          <option value="">Foil + non-foil</option>
          <option value="foil">Foil only</option>
          <option value="nonfoil">Non-foil only</option>
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by source">
          <option value="">All sources</option>
          <option value="moxfield">Moxfield</option>
          <option value="manual">Manually added</option>
        </select>
      </div>

      <div className="space-y-1">
        {filtered.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{c.cardName}</span>
              <span className="text-xs text-muted">({c.set.toUpperCase()})</span>
              <span className="bg-surface text-muted px-1.5 py-0.5 rounded text-xs font-mono">x{c.quantity}</span>
              {c.isFoil && (
                <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">Foil</span>
              )}
              {c.source === "manual" && (
                <span className="text-xs bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded font-medium">Manual</span>
              )}
            </div>
            {c.decks.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.decks.map((d) => (
                  <Link
                    key={d.id}
                    href={`/decks/${d.id}`}
                    className="text-xs bg-accent-muted text-accent px-1.5 py-0.5 rounded hover:underline"
                  >
                    {d.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted text-sm">No cards match the current filters.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean, full `npx jest` green.
- [ ] **Step 6: Stage** — `git add -A`.

---

### Task 14: Friends Collection deck badges + admin decks section — COMMIT C

**Files:**
- Modify: `src/app/api/checkDeck/route.ts`
- Modify: `src/app/checkDeck/page.tsx`
- Create: `src/app/admin/decks-section.tsx`
- Modify: `src/app/admin/page.tsx` (render the new section)
- Test: `tests/checkdeck-associations.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/checkdeck-associations.test.ts`)

```ts
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
}))
const mockCollectionFindMany = jest.fn()
const mockDeckCardFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: { findMany: (...a: unknown[]) => mockCollectionFindMany(...a) },
    deckCard: { findMany: (...a: unknown[]) => mockDeckCardFindMany(...a) },
  },
}))

import { POST } from '../src/app/api/checkDeck/route'

let ipCounter = 0
function makeRequest(body: Record<string, unknown>): Request {
  ipCounter += 1
  return {
    json: async () => body,
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.1.0.${ipCounter}` : null) },
  } as unknown as Request
}

describe('POST /api/checkDeck deck associations', () => {
  beforeEach(() => { mockCollectionFindMany.mockReset(); mockDeckCardFindMany.mockReset() })

  it('attaches each OWNER own deck names to their owner rows', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
      { userId: 'u2', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 2, condition: 'NearMint', isFoil: false, user: { name: 'Bob' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([
      { cardName: 'SOL RING', deck: { name: 'Krenko', ownerUserId: 'u1' } },
    ])
    const res: any = await POST(makeRequest({ decklist: 'Sol Ring' }))
    const owners = res.body.results[0].printings[0].owners
    expect(owners.find((o: { name: string }) => o.name === 'Alice').decks).toEqual(['Krenko'])
    expect(owners.find((o: { name: string }) => o.name === 'Bob').decks).toEqual([])
  })

  it('returns empty decks arrays when no deck contains the cards', async () => {
    mockCollectionFindMany.mockResolvedValue([
      { userId: 'u1', cardName: 'Sol Ring', set: 'c21', setName: 'Commander 2021', scryfallId: 's1', quantity: 1, condition: 'NearMint', isFoil: false, user: { name: 'Alice' } },
    ])
    mockDeckCardFindMany.mockResolvedValue([])
    const res: any = await POST(makeRequest({ decklist: 'Sol Ring' }))
    expect(res.body.results[0].printings[0].owners[0].decks).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (owners have no `decks` field).

- [ ] **Step 3: Modify `src/app/api/checkDeck/route.ts`**

Add the import `import { normalizeCardName } from '@/lib/parseMoxfield';`. After the `matches` query and before the grouping loop, add:

```ts
    // Deck associations (issue #7): which of each OWNER's decks contain the card
    const ownerIds = Array.from(new Set(matches.map((m) => m.userId)));
    const deckCards = ownerIds.length
      ? await prisma.deckCard.findMany({
          where: { deck: { ownerUserId: { in: ownerIds } } },
          include: { deck: { select: { name: true, ownerUserId: true } } },
        })
      : [];
    const decksByOwnerCard = new Map<string, string[]>();
    for (const dc of deckCards) {
      if (!dc.deck.ownerUserId) continue;
      const key = `${dc.deck.ownerUserId}:${normalizeCardName(dc.cardName)}`;
      const list = decksByOwnerCard.get(key) ?? [];
      if (!list.includes(dc.deck.name)) list.push(dc.deck.name);
      decksByOwnerCard.set(key, list);
    }
```

and extend the `owners.push(...)`:

```ts
      grouped[match.cardName][printingKey].owners.push({
        name: match.user.name,
        quantity: match.quantity,
        condition: match.condition,
        isFoil: match.isFoil,
        decks: decksByOwnerCard.get(`${match.userId}:${normalizeCardName(match.cardName)}`) ?? [],
      });
```

- [ ] **Step 4: Modify `src/app/checkDeck/page.tsx`**

Extend the `Owner` interface with `decks: string[];` and render badges after the foil badge inside the owner row's flex container:

```tsx
                                  {owner.decks.length > 0 && (
                                    <span
                                      className="text-xs bg-accent-muted text-accent px-1.5 py-0.5 rounded font-medium"
                                      title={`In deck${owner.decks.length !== 1 ? "s" : ""}: ${owner.decks.join(", ")}`}
                                    >
                                      {owner.decks.length === 1 ? owner.decks[0] : `${owner.decks.length} decks`}
                                    </span>
                                  )}
```

- [ ] **Step 5: Create `src/app/admin/decks-section.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";

interface AdminDeck {
  id: string;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  cardCount: number;
}
interface AdminUser { id: string; name: string }

export default function DecksSection() {
  const [decks, setDecks] = useState<AdminDeck[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [dRes, uRes] = await Promise.all([fetch("/api/admin/decks"), fetch("/api/admin/users")]);
        if (dRes.ok) {
          const data = await dRes.json();
          setDecks(Array.isArray(data.decks) ? data.decks : []);
        }
        if (uRes.ok) {
          const data = await uRes.json();
          setUsers(Array.isArray(data.users) ? data.users : []);
        }
      } catch {
        setStatus("Failed to load decks");
      }
    })();
  }, []);

  const assign = async (deckId: string, ownerUserId: string | null) => {
    setStatus("");
    const res = await fetch(`/api/admin/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerUserId }),
    });
    if (!res.ok) {
      setStatus("Failed to update deck owner");
      return;
    }
    setDecks((ds) =>
      ds.map((d) =>
        d.id === deckId
          ? { ...d, ownerUserId, ownerName: users.find((u) => u.id === ownerUserId)?.name ?? null }
          : d
      )
    );
  };

  return (
    <section className="mt-10">
      <h2 className="text-xl mb-1">Decks</h2>
      <p className="text-sm text-muted mb-4">
        Assign owners to ownerless legacy decks, or fix a wrong assignment.
      </p>
      {status && <p className="text-sm text-red-400 mb-2">{status}</p>}
      {decks.length === 0 ? (
        <p className="text-sm text-muted">No decks yet.</p>
      ) : (
        <div className="space-y-1">
          {decks.map((deck) => (
            <div key={deck.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{deck.name}</span>
                <span className="text-xs text-muted ml-2">{deck.cardCount} cards</span>
              </div>
              <select
                value={deck.ownerUserId ?? ""}
                onChange={(e) => assign(deck.id, e.target.value === "" ? null : e.target.value)}
                className="px-2 py-1 rounded-md border border-border bg-surface text-foreground text-sm"
                aria-label={`Owner of ${deck.name}`}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

Render it in `src/app/admin/page.tsx` directly below the invites section (`<InvitesSection />` → add `<DecksSection />` after it, with `import DecksSection from './decks-section'`). Match how `invites-section.tsx` is imported/rendered.

- [ ] **Step 6: Run — expect PASS**, full suite green, `npx tsc --noEmit` clean.

- [ ] **Step 7: COMMIT C**

```bash
git add -A
git commit -m "feat(ui): deck list, card library, tiered game dropdown, friends-collection deck badges (#7)

- /decks: create + Moxfield import with missing-cards yes/no prompt
- /decks/[id]: owner editing (add-from-library, quantities, remove)
- /library: search + set/type/foil/source filters, deck badges, plaintext add
- games form: User decks -> Borrowed (only when no user match) -> Add-new
- checkDeck owners show which of their decks contain the card
- admin: deck owner assignment section"
```

---

### Task 15: Docs, local backfill, verification — COMMIT D

**Files:**
- Modify: `DEPLOYMENT.md`
- Modify: `.planning/PROJECT.md` (NOTE: dir is gitignored, file is tracked — use `git add -f .planning/PROJECT.md`)

- [ ] **Step 1: Add a rollout section to `DEPLOYMENT.md`** (after the issue #6 migration section)

```markdown
## Decks & Card Library Migration (issue #7)

One additive migration (`add_decks_and_card_library`) plus a one-time backfill script.
No new environment variables — Scryfall's API is keyless.

1. **Apply the migration** (same Turso procedure as issue #6 — prisma's CLI rejects
   libsql URLs, so generate SQL and pipe it through the Turso shell):
   ```bash
   npx prisma migrate diff --from-url "file:./prod-snapshot.db" \
     --to-schema-datamodel prisma/schema.prisma --script > /tmp/decks-migration.sql
   # review the SQL, then:
   turso db shell tabletally < /tmp/decks-migration.sql
   ```
   The migration is additive (new `decks`/`deck_cards` tables, new
   `collection_cards.source` column defaulting to `'moxfield'`) — no data loss.

2. **Run the legacy deck backfill** (idempotent; creates a Deck per distinct
   historical deckName, owned by the user who played it most):
   ```bash
   DATABASE_URL="libsql://<db>.turso.io" DATABASE_AUTH_TOKEN="<token>" \
     node src/scripts/backfillDecks.ts
   ```
   Review the printed deck→owner table; fix stragglers in Admin → Decks.

3. Nightly sync now only replaces `source='moxfield'` rows — manually added
   library cards survive automatically.
```

- [ ] **Step 2: Update `.planning/PROJECT.md`**

Add to Active requirements:

```markdown
- [ ] Per-user decks & card library (#7) — Deck/DeckCard models, /decks + /library pages, tiered games dropdown, Moxfield plaintext import (in progress on `feature/user-decks-library`)
```

Add to Key Decisions:

```markdown
| Decks store cards by value, not FK (#7) | Nightly sync deletes+recreates CollectionCard rows; FKs would orphan daily | — in progress |
| CollectionCard.source column for manual adds (#7) | One library source of truth; sync only replaces source='moxfield' | — in progress |
```

- [ ] **Step 3: Run the backfill against LOCAL dev.db and eyeball the output**

```bash
DATABASE_URL="file:./prisma/dev.db" node src/scripts/backfillDecks.ts
```

Expected: a printed table of legacy decks → owners/OWNERLESS (the local DB has seeded users + games). Re-run once to confirm idempotency ("Nothing to backfill").

- [ ] **Step 4: Full verification**

```bash
npx jest                  # entire suite green
npx tsc --noEmit          # clean
npm install --no-save lightningcss-linux-x64-gnu@1.30.2 @tailwindcss/oxide-linux-x64-gnu@4.1.18
npm run build             # must succeed; confirm "ƒ Proxy (Middleware)" still listed
```

Then a dev-server smoke test against `prisma/dev.db` (`DATABASE_URL="file:./prisma/dev.db" npx next dev -p 3007`):
login → /decks create a deck → /library add `1 Treasure Vault (AFR) 261 *F*` (real Scryfall call) → import a 3-line Moxfield list with one missing card → verify yes/no prompt both paths → games form shows User/Borrowed tiers → checkDeck shows a deck badge. Kill the server afterwards (`ss -tlnp` to find strays; run pkill commands separately — exit codes break `&&` chains).

- [ ] **Step 5: COMMIT D**

```bash
git add -A
git add -f .planning/PROJECT.md
git commit -m "docs(deploy): #7 rollout notes + project tracking"
```

- [ ] **Step 6: STOP.** Turso `tabletally-dev` application and anything beyond is the controller's/human's call — report back instead of proceeding.

---

## Plan self-review notes

- Spec coverage: schema/source column (T1), parser incl. MDFC+foil (T2), Scryfall (T3), tier rules (T4, T12), backfill + admin assignment (T5, T11, T14), deck CRUD + membership (T6–T7), library page+add (T8, T13), import yes/no (T9, T13), games auto-create + random skip (T10), checkDeck associations (T14), rollout docs (T15). All issue #7 acceptance criteria map to tasks.
- The GET /api/decks response-shape change lands in commit B while game-form updates land in commit C — transiently inconsistent between commits on the feature branch, called out in Task 6.
- Subagents MUST follow the environment quirks at the top (no tsx, prisma/dev.db, never prod).



