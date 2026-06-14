// Parses Moxfield plaintext exports ("1 Treasure Vault (AFR) 261 *F*").
// Unlike parseDeck.ts (deck checker), this keeps basic lands and printing info.

export interface ParsedMoxfieldCard {
  line: number // 1-based source line, threaded through for error reporting
  quantity: number
  name: string
  set?: string
  collectorNumber?: string
  isFoil: boolean
}

export interface MoxfieldParseError {
  line: number
  raw: string
  reason: string
}

export interface MoxfieldParseResult {
  cards: ParsedMoxfieldCard[]
  errors: MoxfieldParseError[]
}

// qty, lazy name (may contain " / " for MDFCs), optional "(SET) NUM" pair,
// optional finish marker (*F* foil or *E* etched). The lazy name + end-anchored
// optional groups make "(SET) NUM" bind tightly when present.
const LINE_RE = /^(\d+)\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)\s+([^\s*]+))?(\s+\*[FE]\*)?\s*$/

export function parseMoxfieldText(text: string): MoxfieldParseResult {
  const cards: ParsedMoxfieldCard[] = []
  const errors: MoxfieldParseError[] = []

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const trimmed = raw.trim()
    if (!trimmed) return

    const m = trimmed.match(LINE_RE)
    if (!m) {
      errors.push({ line, raw: trimmed, reason: 'Unrecognized line format' })
      return
    }
    const [, qtyStr, name, set, collectorNumber, marker] = m

    // *F* (foil) and *E* (etched) are recognized; any other *X* marker would be
    // silently swallowed into the card name, so reject the line instead. Etched
    // is treated as a regular card below — the scraper stores it that way.
    if (/\*[^*]+\*\s*$/.test(name)) {
      errors.push({ line, raw: trimmed, reason: 'Unsupported marker — only *F* and *E* are recognized' })
      return
    }

    const quantity = parseInt(qtyStr, 10)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      errors.push({ line, raw: trimmed, reason: 'Quantity must be between 1 and 999' })
      return
    }

    cards.push({
      line,
      quantity,
      name: name.trim(),
      set: set?.toUpperCase(),
      collectorNumber,
      // Only *F* is foil; *E* (etched) and unmarked are regular, matching how
      // the collection scraper stores them.
      isFoil: marker?.trim() === '*F*',
    })
  })

  return { cards, errors }
}

// Moxfield exports MDFCs as "A / B"; the collection scrape (Scryfall naming)
// stores "A // B". Normalization bridges the two for matching.
export function normalizeCardName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').replace(/ \/ /g, ' // ').toLowerCase()
}

export type LibraryNameIndex = Map<string, string> // normalized -> canonical stored name

export function buildLibraryNameIndex(names: string[]): LibraryNameIndex {
  const index: LibraryNameIndex = new Map()
  for (const n of names) {
    const key = normalizeCardName(n)
    if (!index.has(key)) index.set(key, n)
  }
  return index
}

export function findLibraryName(index: LibraryNameIndex, importName: string): string | undefined {
  const norm = normalizeCardName(importName)
  const exact = index.get(norm)
  if (exact) return exact
  // First match wins; real MTG front-face names are unique, so collisions can't occur in practice.
  const front = norm.split(' // ')[0]
  for (const [key, canonical] of index) {
    if (key.startsWith(front + ' //')) return canonical
  }
  return undefined
}

// Basic lands are excluded from collection scrapes (the Moxfield scraper skips
// type_line "Basic Land*"), so deck flows treat them as always-available:
// importable without a library lookup, never added to the library.
const BASIC_LAND_NAMES = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'])

export function isBasicLand(name: string): boolean {
  const norm = normalizeCardName(name)
  if (BASIC_LAND_NAMES.has(norm)) return true
  return norm.startsWith('snow-covered ') && BASIC_LAND_NAMES.has(norm.slice('snow-covered '.length))
}
