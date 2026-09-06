import { prisma } from "./prisma";

export interface StoreHealth {
  status: "success" | "failure" | "unknown";
  lastRun: string | null; // ISO string for JSON serialization
  error: string | null;
}

// Stores scraped by scrapeAllSites. Always present in getAllStoreHealth so a
// fresh database shows four grey rows instead of just the 401 seed.
export const KNOWN_STORES = [
  "Enter The Battlefield",
  "Dungeon Comics and Cards",
  "Face to Face Games",
  "401 Games",
] as const;

const UNKNOWN: StoreHealth = { status: "unknown", lastRun: null, error: null };

function toHealth(row: { status: string; errorMessage: string | null; lastRun: Date } | null): StoreHealth {
  if (!row) return { ...UNKNOWN };
  const status = row.status === "success" || row.status === "failure" ? row.status : "unknown";
  return { status, lastRun: row.lastRun.toISOString(), error: row.errorMessage };
}

export async function setStoreHealth(storeName: string, health: StoreHealth): Promise<void> {
  await prisma.storeHealth.upsert({
    where: { store: storeName },
    update: {
      status: health.status,
      errorMessage: health.error,
      lastRun: health.lastRun ? new Date(health.lastRun) : new Date(),
    },
    create: {
      store: storeName,
      status: health.status,
      errorMessage: health.error,
      lastRun: health.lastRun ? new Date(health.lastRun) : new Date(),
    },
  });
}

export async function getStoreHealth(storeName: string): Promise<StoreHealth> {
  const row = await prisma.storeHealth.findUnique({ where: { store: storeName } });
  return toHealth(row);
}

export async function getAllStoreHealth(): Promise<Record<string, StoreHealth>> {
  const rows = await prisma.storeHealth.findMany({
    where: { store: { in: [...KNOWN_STORES] } },
  });
  const byStore = new Map(rows.map((r) => [r.store, toHealth(r)]));
  const result: Record<string, StoreHealth> = {};
  for (const name of KNOWN_STORES) {
    result[name] = byStore.get(name) ?? { ...UNKNOWN };
  }
  return result;
}
