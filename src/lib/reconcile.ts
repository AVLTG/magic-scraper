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
