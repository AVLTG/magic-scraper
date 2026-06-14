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
  }>
  not_found?: Array<{ set?: string; collector_number?: string }>
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
      found.set(scryfallKey(c.set, c.collector_number), {
        name: c.name,
        scryfallId: c.id,
        set: c.set,
        setName: c.set_name,
        typeLine: c.type_line ?? '',
        collectorNumber: c.collector_number,
      })
    }
    for (const nf of data.not_found ?? []) {
      if (nf.set && nf.collector_number) notFound.push({ set: nf.set, collectorNumber: nf.collector_number })
    }
  }

  return { found, notFound }
}
