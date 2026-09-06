// Batch card resolution via Scryfall's POST /cards/collection (max 75 per request,
// keyless, free). Used by library plaintext add and deck import.

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection'
const BATCH_SIZE = 75

export interface ScryfallIdentifier {
  set: string
  collectorNumber: string
}

export interface ResolvedCard {
  name: string
  scryfallId: string
  set: string
  setName: string
  typeLine: string
  collectorNumber: string
  manaCost: string
  cmc: number
  /** color_identity joined, e.g. "WUB" ("" for colorless) */
  colors: string
}

export function scryfallKey(set: string, collectorNumber: string): string {
  return `${set.toLowerCase()}:${collectorNumber.toLowerCase()}`
}

interface ScryfallCollectionResponse {
  data?: Array<{
    name: string
    id: string
    set: string
    set_name: string
    type_line?: string
    collector_number: string
    mana_cost?: string
    cmc?: number
    color_identity?: string[]
  }>
  not_found?: Array<{ set?: string; collector_number?: string; name?: string }>
}

export async function resolveCards(
  identifiers: ScryfallIdentifier[]
): Promise<{ found: Map<string, ResolvedCard>; notFound: ScryfallIdentifier[] }> {
  const found = new Map<string, ResolvedCard>()
  const notFound: ScryfallIdentifier[] = []

  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE)
    const res = await fetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      // Scryfall rejects requests lacking User-Agent + Accept with HTTP 400,
      // and Node's fetch sends no User-Agent by default.
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'TableTally/1.0',
      },
      body: JSON.stringify({
        identifiers: batch.map((b) => ({ set: b.set.toLowerCase(), collector_number: b.collectorNumber })),
      }),
    })
    if (!res.ok) throw new Error(`Scryfall returned ${res.status}`)
    const data = (await res.json()) as ScryfallCollectionResponse

    for (const c of data.data ?? []) {
      found.set(scryfallKey(c.set, c.collector_number), toResolvedCard(c))
    }
    for (const nf of data.not_found ?? []) {
      if (nf.set && nf.collector_number) notFound.push({ set: nf.set, collectorNumber: nf.collector_number })
    }
  }

  return { found, notFound }
}

function toResolvedCard(c: NonNullable<ScryfallCollectionResponse['data']>[number]): ResolvedCard {
  return {
    name: c.name,
    scryfallId: c.id,
    set: c.set,
    setName: c.set_name,
    typeLine: c.type_line ?? '',
    collectorNumber: c.collector_number,
    manaCost: c.mana_cost ?? '',
    cmc: typeof c.cmc === 'number' ? c.cmc : 0,
    colors: Array.isArray(c.color_identity) ? c.color_identity.join('') : '',
  }
}

/**
 * Batch-resolves by exact card name (used to backfill mana curve data on
 * decks). Returns a map of normalized name -> resolved card; names Scryfall
 * doesn't know are simply absent.
 */
export async function resolveCardsByName(
  names: string[],
  fetcher: typeof fetch = fetch
): Promise<Map<string, ResolvedCard>> {
  const found = new Map<string, ResolvedCard>()
  const queue = names.map((n) => n.trim()).filter((n) => n.length > 0)
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE)
    const res = await fetcher(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'TableTally/1.0',
      },
      body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
    })
    if (!res.ok) throw new Error(`Scryfall returned ${res.status}`)
    const data = (await res.json()) as ScryfallCollectionResponse
    for (const c of data.data ?? []) {
      const key = c.name.trim().toLowerCase()
      if (!found.has(key)) found.set(key, toResolvedCard(c))
    }
  }
  return found
}
