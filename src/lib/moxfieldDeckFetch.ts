// Fetches a public Moxfield deck by share URL and converts its boards to the
// Moxfield plaintext our import pipeline already parses ("1 Name (SET) 123").
// Server-side fetch goes through the same path as the collection scraper in
// production (Cloudflare blocks datacenter IPs), so callers should prefer the
// /api/decks/fetch-url route over calling this from the browser.

export interface FetchedMoxfieldDeck {
  id: string;
  name: string;
  format: string | null;
  commander: string | null;
  /** Plaintext per board — empty string when the board has no cards. */
  main: string;
  side: string;
  maybe: string;
}

/**
 * Accepts a full share URL (https://moxfield.com/decks/<id>[-slug]) or a bare
 * deck ID. Returns null when no plausible ID is found.
 */
export function parseMoxfieldDeckId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{4,64}$/.test(trimmed) && !trimmed.includes(' ')) return trimmed;
  return null;
}

interface BoardEntry {
  quantity?: number;
  finish?: string;
  card?: { name?: string; set?: string; cn?: string; collector_number?: string };
}

// A board is a map of unique key -> entry, but be liberal: arrays work too.
function boardEntries(board: unknown): BoardEntry[] {
  if (!board || typeof board !== 'object') return [];
  const values = Array.isArray(board) ? board : Object.values(board as Record<string, unknown>);
  return values.filter((v): v is BoardEntry => !!v && typeof v === 'object');
}

function boardToText(board: unknown): string {
  return boardEntries(board)
    .map((e) => {
      const qty = typeof e.quantity === 'number' && e.quantity > 0 ? e.quantity : 1;
      const name = e.card?.name?.trim();
      if (!name) return null;
      const set = e.card?.set?.toUpperCase();
      const cn = e.card?.cn ?? e.card?.collector_number;
      const finish = e.finish === 'foil' ? ' *F*' : '';
      return set && cn ? `${qty} ${name} (${set}) ${cn}${finish}` : `${qty} ${name}${finish}`;
    })
    .filter((l): l is string => l !== null)
    .join('\n');
}

export async function fetchMoxfieldDeck(
  urlOrId: string,
  fetcher: typeof fetch = fetch
): Promise<FetchedMoxfieldDeck> {
  const id = parseMoxfieldDeckId(urlOrId);
  if (!id) throw new Error('That does not look like a Moxfield deck URL or ID');

  const res = await fetcher(`https://api2.moxfield.com/v2/decks/view/${id}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TableTally/1.0',
      Referer: 'https://www.moxfield.com/',
    },
  });
  if (res.status === 404) throw new Error('Deck not found — is the Moxfield link public?');
  if (!res.ok) throw new Error(`Moxfield returned ${res.status} — try again or paste the list manually`);

  const data = (await res.json()) as {
    name?: string;
    format?: string;
    commanders?: unknown;
    mainboard?: unknown;
    main?: unknown;
    sideboard?: unknown;
    side?: unknown;
    maybeboard?: unknown;
    maybe?: unknown;
  };
  if (!data || typeof data !== 'object') throw new Error('Moxfield returned an unexpected response');

  // The view API nests boards under mainboard/sideboard/maybeboard; accept the
  // short aliases too. Commanders board holds 1-2 entries for Commander decks.
  const main = boardToText(data.mainboard ?? data.main);
  const commanderEntry = boardEntries(data.commanders)[0]?.card?.name?.trim() ?? null;

  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported deck',
    format: typeof data.format === 'string' && data.format.trim() ? data.format.trim() : null,
    commander: commanderEntry,
    main,
    side: boardToText(data.sideboard ?? data.side),
    maybe: boardToText(data.maybeboard ?? data.maybe),
  };
}
