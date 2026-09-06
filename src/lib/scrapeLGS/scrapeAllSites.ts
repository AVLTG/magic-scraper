import "server-only";
import { launchBrowser } from "./browser";
import { scrapeETB } from "./scrapeETB";
import { scrapeDCC } from "./scrapeDCC";
import { scrapeFTF } from "./scrapeFTF";
import { scrape401 } from "./scrape401";
import type { Product } from "@/types/product";
import { setStoreHealth } from "@/lib/scraperHealthCache";

export async function scrapeAllSites(
  card: string
): Promise<{ products: Product[]; failedStores: string[] }> {
  const browser = await launchBrowser();
  try {
    const results = await Promise.allSettled([
      scrapeETB({ card, browser }),
      scrapeDCC({ card, browser }),
      scrapeFTF({ card, browser }),
      // Fetch-based (no browser): Shopify suggest + product JSON, zero proxy cost
      scrape401({ card }),
    ]);

    const products: Product[] = [];
    const failedStores: string[] = [];
    const storeNames = [
      "Enter The Battlefield",
      "Dungeon Comics and Cards",
      "Face to Face Games",
      "401 Games",
    ];

    // Health is DB-backed (shared across serverless instances) — await all
    // writes before returning so the admin dashboard never misses a run.
    const healthWrites: Promise<unknown>[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        products.push(...result.value);
        healthWrites.push(
          setStoreHealth(storeNames[i], {
            status: "success",
            lastRun: new Date().toISOString(),
            error: null,
          })
        );
      } else {
        console.error(`${storeNames[i]} failed:`, result.reason);
        failedStores.push(storeNames[i]);
        healthWrites.push(
          setStoreHealth(storeNames[i], {
            status: "failure",
            lastRun: new Date().toISOString(),
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          })
        );
      }
    });
    // Health is DB-backed (shared across serverless instances) — best-effort:
    // a failed observability write must never 500 an otherwise good search.
    const healthResults = await Promise.allSettled(healthWrites);
    for (let i = 0; i < healthResults.length; i++) {
      if (healthResults[i].status === "rejected") {
        console.error(
          `Health write failed for ${storeNames[i]}:`,
          (healthResults[i] as PromiseRejectedResult).reason
        );
      }
    }

    return { products, failedStores };
  } finally {
    await browser.close();
  }
}
