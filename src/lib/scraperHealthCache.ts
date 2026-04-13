export interface StoreHealth {
  status: "success" | "failure" | "unknown";
  lastRun: string | null; // ISO string for JSON serialization
  error: string | null;
}

const cache = new Map<string, StoreHealth>();

// Initialize 401 Games as disabled
cache.set("401 Games", { status: "unknown", lastRun: null, error: null });

export function getStoreHealth(storeName: string): StoreHealth {
  return cache.get(storeName) ?? { status: "unknown", lastRun: null, error: null };
}

export function setStoreHealth(storeName: string, health: StoreHealth): void {
  cache.set(storeName, health);
}

export function getAllStoreHealth(): Record<string, StoreHealth> {
  const result: Record<string, StoreHealth> = {};
  for (const [name, health] of cache.entries()) {
    result[name] = health;
  }
  return result;
}
