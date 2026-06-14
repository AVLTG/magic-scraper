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

  it('accepts the *E* etched marker as a regular (non-foil) card', () => {
    // The collection scraper stores etched printings as regular cards, so an
    // etched line must parse (not error) and match the regular library row.
    const { cards, errors } = parseMoxfieldText('1 Treasure Vault (AFR) 261 *E*')
    expect(errors).toEqual([])
    expect(cards[0]).toEqual({ line: 1, quantity: 1, name: 'Treasure Vault', set: 'AFR', collectorNumber: '261', isFoil: false })
  })

  it('collects errors for garbage and genuinely unknown markers without throwing', () => {
    const { cards, errors } = parseMoxfieldText('SIDEBOARD:\n1 Treasure Vault (AFR) 261 *Z*\n1 Sol Ring (C21) 263')
    expect(cards).toHaveLength(1)
    expect(errors).toHaveLength(2)
    expect(errors[0].line).toBe(1)
    expect(errors[1].reason).toMatch(/\*F\*.*\*E\*|\*E\*.*\*F\*/)
  })

  it('handles odd collector numbers (letters, stars)', () => {
    const { cards, errors } = parseMoxfieldText('1 Fabled Passage (PELD) 244p\n1 Gilded Goose (PELD) 160★')
    expect(errors).toEqual([])
    expect(cards[0].collectorNumber).toBe('244p')
    expect(cards[1].collectorNumber).toBe('160★')
  })

  it('rejects quantity 0 and absurd quantities with per-line errors', () => {
    const { cards, errors } = parseMoxfieldText('0 Sol Ring (C21) 263\n99999999999999999999 Sol Ring (C21) 263\n1000 Sol Ring (C21) 263')
    expect(cards).toEqual([])
    expect(errors).toHaveLength(3)
    expect(errors[0].reason).toMatch(/between 1 and 999/)
  })

  it('handles card names containing literal parens', () => {
    const { cards, errors } = parseMoxfieldText("1 Erase (Not the Urza's Legacy One) (PLST) 123")
    expect(errors).toEqual([])
    expect(cards[0]).toEqual(
      expect.objectContaining({ name: "Erase (Not the Urza's Legacy One)", set: 'PLST', collectorNumber: '123' })
    )
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
