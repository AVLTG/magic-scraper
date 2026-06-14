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
