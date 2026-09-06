import "server-only";
import type { Product, ScrapeCardProps } from "@/types/product";

// 401 Games runs on Shopify, so instead of driving a headless browser through
// their FastSimon search page (Cloudflare + JS-rendered, never resolves from
// serverless), we use Shopify's own JSON endpoints over plain fetch:
//   - /search/suggest.json for matching products (title, price, image, URL)
//   - /products/<handle>.js for per-condition variants with exact inventory
// Zero ScraperAPI credits, zero Chromium. In-stock filtering uses real
// inventory_quantity counts, and conditions (NM/SP/MP/...) come free.

const STORE = "401 Games";
const BASE = "https://store.401games.ca";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SUGGEST_LIMIT = 10;
const DETAIL_CAP = 6;
const DETAIL_CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 10_000;

interface SuggestProduct {
  title?: string;
  handle?: string;
  image?: string;
  url?: string;
}

interface ProductVariant {
  title?: string;
  price?: number;
  inventory_quantity?: number;
  available?: boolean;
}

async function getJson(fetcher: typeof fetch, url: string): Promise<{ status: number; data: unknown }> {
  const res = await fetcher(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return { status: res.status, data: null };
  return { status: res.status, data: (await res.json()) as unknown };
}

function suggestProducts(data: unknown): SuggestProduct[] {
  if (!data || typeof data !== "object") return [];
  const products = (data as { resources?: { results?: { products?: unknown } } }).resources?.results?.products;
  if (!Array.isArray(products)) return [];
  return products.filter((p): p is SuggestProduct => !!p && typeof p === "object");
}

function productVariants(data: unknown): ProductVariant[] {
  if (!data || typeof data !== "object") return [];
  const variants = (data as { variants?: unknown }).variants;
  if (!Array.isArray(variants)) return [];
  return variants.filter((v): v is ProductVariant => !!v && typeof v === "object");
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    results.push(...(await Promise.all(items.slice(i, i + concurrency).map(fn))));
  }
  return results;
}

export async function scrape401({
  card,
  fetcher = fetch,
}: ScrapeCardProps & { fetcher?: typeof fetch }): Promise<Product[]> {
  const query = card.trim();
  if (!query) return [];

  const suggestUrl =
    `${BASE}/search/suggest.json?q=${encodeURIComponent(query)}` +
    `&resources[type]=product&resources[limit]=${SUGGEST_LIMIT}`;
  let suggest: { status: number; data: unknown };
  try {
    suggest = await getJson(fetcher, suggestUrl);
  } catch (error) {
    throw new Error(`401 Games search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (suggest.status === 404) return [];
  if (suggest.status < 200 || suggest.status >= 300 || !suggest.data) {
    throw new Error(`401 Games search returned ${suggest.status}`);
  }

  // Suggest already matches the query; keep a light title filter to drop noise
  // and dedupe handles (suggest can repeat a product across positions).
  const cardLower = query.toLowerCase();
  const seen = new Set<string>();
  const matches = suggestProducts(suggest.data).filter((p) => {
    const title = p.title?.trim() ?? "";
    const handle = p.handle?.trim() ?? "";
    if (!title || !handle) return false;
    if (!title.toLowerCase().includes(cardLower)) return false;
    if (seen.has(handle)) return false;
    seen.add(handle);
    return true;
  }).slice(0, DETAIL_CAP);

  const products: Product[] = [];
  // Return per-product arrays (flatMapped below) so result order follows
  // suggest order instead of detail-fetch completion order.
  const perProduct = await mapPool(matches, DETAIL_CONCURRENCY, async (match) => {
    const handle = match.handle!.trim();
    let detail: { status: number; data: unknown };
    try {
      detail = await getJson(fetcher, `${BASE}/products/${encodeURIComponent(handle)}.js`);
    } catch (error) {
      console.error(`401 Games detail fetch failed for ${handle}:`, error);
      return [];
    }
    if (!detail.data) return [];
    const image = typeof match.image === "string" ? match.image : "";
    const link = `${BASE}/products/${encodeURIComponent(handle)}`;
    const rows: Product[] = [];
    for (const v of productVariants(detail.data)) {
      const qty = typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0;
      const inStock = qty > 0 || v.available === true;
      if (!inStock) continue;
      const cents = typeof v.price === "number" ? v.price : 0;
      rows.push({
        title: match.title!.trim(),
        price: `$${(cents / 100).toFixed(2)}`,
        inventory: qty > 0 ? [`In Stock (${qty})`] : ["In Stock"],
        condition: v.title?.trim() || "N/A",
        image,
        link,
        store: STORE,
      });
    }
    return rows;
  });

  return perProduct.flat();
}
