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
