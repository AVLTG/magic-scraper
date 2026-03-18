import "server-only";
import { launchBrowser } from "./browser";
import { scrapeETB } from "./scrapeETB";
import { scrapeDCC } from "./scrapeDCC";
import { scrapeFTF } from "./scrapeFTF";
import type { Product } from "@/types/product";

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
      } else {
        console.error(`${storeNames[i]} failed:`, result.reason);
        failedStores.push(storeNames[i]);
      }
    });

    return { products, failedStores };
  } finally {
    await browser.close();
  }
}
