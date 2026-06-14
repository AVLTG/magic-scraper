import { classifyMoxfieldCards } from '@/lib/deckImport'
import { buildLibraryNameIndex } from '@/lib/parseMoxfield'

const card = (name: string, set?: string, collectorNumber?: string) => ({
  line: 1, quantity: 1, name, set, collectorNumber, isFoil: false,
})

describe('classifyMoxfieldCards', () => {
  it('splits into present (canonical), missing, and basics', () => {
    const lib = buildLibraryNameIndex(['Sol Ring'])
    const cards = [card('sol ring'), card('Black Lotus'), card('Plains')]
    const { present, missing, basics } = classifyMoxfieldCards(cards, lib)
    expect(present).toEqual([{ card: cards[0], canonical: 'Sol Ring' }])
    expect(missing).toEqual([cards[1]])
    expect(basics).toEqual([cards[2]])
  })
})
