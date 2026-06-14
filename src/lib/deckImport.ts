// Shared Moxfield-import logic used by the deck-create import and the per-deck
// card import. classifyMoxfieldCards is pure; resolveMissingToLibrary wraps
// Scryfall to turn missing printings into collection-card insert rows.
import {
  buildLibraryNameIndex,
  findLibraryName,
  isBasicLand,
  type ParsedMoxfieldCard,
} from '@/lib/parseMoxfield'
import { resolveCards, scryfallKey } from '@/lib/scryfall'

export interface ClassifiedCards {
  present: Array<{ card: ParsedMoxfieldCard; canonical: string }>
  missing: ParsedMoxfieldCard[]
  basics: ParsedMoxfieldCard[]
}

export function classifyMoxfieldCards(
  cards: ParsedMoxfieldCard[],
  libIndex: ReturnType<typeof buildLibraryNameIndex>
): ClassifiedCards {
  const present: ClassifiedCards['present'] = []
  const missing: ParsedMoxfieldCard[] = []
  const basics: ParsedMoxfieldCard[] = []
  for (const c of cards) {
    // Basic lands never exist in scraped collections — they import freely and
    // never trigger the missing-cards prompt.
    if (isBasicLand(c.name)) {
      basics.push(c)
      continue
    }
    const canonical = findLibraryName(libIndex, c.name)
    if (canonical) present.push({ card: c, canonical })
    else missing.push(c)
  }
  return { present, missing, basics }
}

export type ResolveMissingResult =
  | {
      ok: true
      libraryInserts: Array<Record<string, unknown>>
      resolved: Array<{ card: ParsedMoxfieldCard; name: string }>
    }
  | { ok: false; status: 422 | 502; error: string; cards: string[] }

export async function resolveMissingToLibrary(
  missing: ParsedMoxfieldCard[],
  userId: string
): Promise<ResolveMissingResult> {
  const unresolvable = missing.filter((c) => !c.set || !c.collectorNumber)
  if (unresolvable.length > 0) {
    return {
      ok: false,
      status: 422,
      error: 'Some missing cards lack a set/collector number and cannot be added to your library',
      cards: unresolvable.map((c) => c.name),
    }
  }
  let resolved
  try {
    resolved = await resolveCards(missing.map((c) => ({ set: c.set as string, collectorNumber: c.collectorNumber as string })))
  } catch (error) {
    console.error('Scryfall lookup failed:', error)
    return { ok: false, status: 502, error: 'Scryfall lookup failed — try again', cards: [] }
  }
  const notFound = missing.filter((c) => !resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string)))
  if (notFound.length > 0) {
    return {
      ok: false,
      status: 422,
      error: 'Some cards could not be resolved on Scryfall — fix those lines and retry',
      cards: notFound.map((c) => `${c.name} (${c.set}) ${c.collectorNumber}`),
    }
  }
  const libraryInserts: Array<Record<string, unknown>> = []
  const resolvedList: Array<{ card: ParsedMoxfieldCard; name: string }> = []
  for (const c of missing) {
    const hit = resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string))!
    libraryInserts.push({
      userId,
      cardName: hit.name,
      scryfallId: hit.scryfallId,
      set: hit.set,
      setName: hit.setName,
      quantity: c.quantity,
      condition: 'NearMint',
      isFoil: c.isFoil,
      typeLine: hit.typeLine,
      source: 'manual',
    })
    resolvedList.push({ card: c, name: hit.name })
  }
  return { ok: true, libraryInserts, resolved: resolvedList }
}
