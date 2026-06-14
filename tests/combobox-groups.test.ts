import { groupSections, filterItems, shouldShowAddNew } from '@/app/components/combobox'

const groups = [
  { label: 'Owned decks', items: ['Krenko Goblins', 'Esper Control'] },
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
      { label: 'Owned decks', items: ['Krenko Goblins', 'Esper Control'], start: 0 },
      { label: 'Borrowed decks', items: ['Slivers'], start: 2 },
    ])
  })

  it('add-new check runs against ALL group items so borrowed names are never offered as new', () => {
    const all = groups.flatMap((g) => g.items)
    expect(shouldShowAddNew(all, 'Slivers')).toBe(false) // exact borrowed match
    expect(shouldShowAddNew(all, 'Brand New Deck')).toBe(true)
  })
})
