import { parseDeckList } from '@/lib/parseDeck'
import { isBasicLand } from '@/lib/parseMoxfield'

describe('parseDeckList Moxfield-export tolerance (deck checker)', () => {
  it('strips "(SET) NUM" printing suffixes and foil markers', () => {
    expect(parseDeckList('1 Treasure Vault (AFR) 261 *F*')).toEqual([
      { quantity: 1, name: 'Treasure Vault' },
    ])
    expect(parseDeckList('1 Abundance (USG) 229')).toEqual([{ quantity: 1, name: 'Abundance' }])
    expect(parseDeckList('1 Cemetery Tampering (PSNC) 69s')).toEqual([
      { quantity: 1, name: 'Cemetery Tampering' },
    ])
  })

  it('keeps plain names and quantities working as before', () => {
    expect(parseDeckList('Lightning Bolt\n4 Counterspell')).toEqual([
      { quantity: 1, name: 'Lightning Bolt' },
      { quantity: 4, name: 'Counterspell' },
    ])
  })

  it('accepts "4x Counterspell" style quantities', () => {
    expect(parseDeckList('4x Counterspell')).toEqual([{ quantity: 4, name: 'Counterspell' }])
  })

  it('preserves real card names containing parens', () => {
    expect(parseDeckList("1 Erase (Not the Urza's Legacy One)")).toEqual([
      { quantity: 1, name: "Erase (Not the Urza's Legacy One)" },
    ])
  })

  it('still skips basic lands, including suffixed ones', () => {
    expect(parseDeckList('12 Plains (FDN) 269\nIsland\n1 Snow-Covered Forest (KHM) 284')).toEqual([])
  })

  it('skips bare section headers instead of emitting phantom cards', () => {
    expect(parseDeckList('Deck\n4 Lightning Bolt\nSideboard\n2 Duress\nCommander\n1 Atraxa')).toEqual([
      { quantity: 4, name: 'Lightning Bolt' },
      { quantity: 2, name: 'Duress' },
      { quantity: 1, name: 'Atraxa' },
    ])
  })

  it('unwraps MTGO-style "SB:" lines so sideboard cards still match', () => {
    expect(parseDeckList('SB: 2 Duress\nSB:1 Flusterstorm')).toEqual([
      { quantity: 2, name: 'Duress' },
      { quantity: 1, name: 'Flusterstorm' },
    ])
  })

  it('skips a bare SB: line instead of emitting a phantom card', () => {
    expect(parseDeckList('SB:\n4 Lightning Bolt')).toEqual([{ quantity: 4, name: 'Lightning Bolt' }])
  })
})

describe('isBasicLand', () => {
  it('matches the five basics, Wastes, and snow-covered variants, case-insensitively', () => {
    for (const n of ['Plains', 'island', 'SWAMP', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'snow-covered island']) {
      expect(isBasicLand(n)).toBe(true)
    }
  })

  it('does not match nonbasics or basic-adjacent names', () => {
    for (const n of ['Mystic Forest', 'Island of Wak-Wak', 'Plainswalker', 'Sol Ring', '']) {
      expect(isBasicLand(n)).toBe(false)
    }
  })
})
