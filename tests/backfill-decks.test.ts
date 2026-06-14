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
