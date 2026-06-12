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
