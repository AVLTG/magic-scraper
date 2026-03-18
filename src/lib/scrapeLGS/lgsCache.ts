import "server-only";
import type { Product } from "@/types/product";

interface CacheEntry {
  products: Product[];
  failedStores: string[];
  cachedAt: number;
}

const lgsCache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCached(
  cardName: string
): { products: Product[]; failedStores: string[] } | null {
  const key = cardName.toLowerCase();
  const entry = lgsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    lgsCache.delete(key);
    return null;
  }
  return { products: entry.products, failedStores: entry.failedStores };
}

export function setCache(
  cardName: string,
  data: { products: Product[]; failedStores: string[] }
): void {
  const key = cardName.toLowerCase();
  lgsCache.set(key, { ...data, cachedAt: Date.now() });
}
