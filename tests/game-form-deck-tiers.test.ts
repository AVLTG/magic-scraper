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
