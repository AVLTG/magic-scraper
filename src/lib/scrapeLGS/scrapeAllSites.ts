import "server-only";
import { launchBrowser } from "./browser";
import { scrapeETB } from "./scrapeETB";
import { scrapeDCC } from "./scrapeDCC";
import { scrapeFTF } from "./scrapeFTF";
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
    ]);

    const products: Product[] = [];
    const failedStores: string[] = [];
    const storeNames = [
      "Enter The Battlefield",
      "Dungeon Comics and Cards",
      "Face to Face Games",
    ];

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        products.push(...result.value);
        setStoreHealth(storeNames[i], {
          status: "success",
          lastRun: new Date().toISOString(),
          error: null,
        });
      } else {
        console.error(`${storeNames[i]} failed:`, result.reason);
        failedStores.push(storeNames[i]);
        setStoreHealth(storeNames[i], {
          status: "failure",
          lastRun: new Date().toISOString(),
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    return { products, failedStores };
  } finally {
    await browser.close();
  }
}
