// Tier logic for the games-tab deck dropdown (issue #7):
//   1. Owned decks — always first when any of them match the search
//   2. Borrowed decks — ONLY when the search matches zero owned decks
//   3. "+ Add new" — rendered by the Combobox itself, always last
// Tiers are relative to the SELECTED player (the participant row's player),
// not the logged-in user. Items are returned UNFILTERED — the Combobox
// re-filters per keystroke; this function only decides which tier is visible
// (a decision that depends on the current input).

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
