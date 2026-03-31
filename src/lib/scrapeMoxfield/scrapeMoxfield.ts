import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MoxfieldCard } from "@/types/moxfield";

const execFileAsync = promisify(execFile);

/**
 * Fetch Moxfield API using curl to bypass Cloudflare TLS fingerprinting.
 * Node.js fetch/https get blocked (403) because Cloudflare detects their
 * TLS handshake, but curl's TLS fingerprint is accepted.
 */
async function fetchMoxfield(targetUrl: string): Promise<unknown> {
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-H", "Accept: application/json, text/plain, */*",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://www.moxfield.com/",
    "-H", "Origin: https://www.moxfield.com",
    targetUrl,
  ]);
  return JSON.parse(stdout);
}

export async function scrapeMoxfield({
  collectionId,
}: {
  collectionId: string;
}): Promise<MoxfieldCard[]> {
  console.log("Starting scrape for collection:", collectionId);

  let allCards: MoxfieldCard[] = [];
  let pageNumber = 1;
  let hasMorePages = true;
  const pageSize = 5000;

  while (hasMorePages) {
    const apiUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=${pageNumber}&pageSize=${pageSize}&playStyle=paperDollars&pricingProvider=cardkingdom`;
    console.log(`Fetching page ${pageNumber}...`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiData = await fetchMoxfield(apiUrl) as { data?: Record<string, any> };

    if (!apiData || !apiData.data) {
      break;
    }

    const pageCards: MoxfieldCard[] = [];

    for (const key of Object.keys(apiData.data)) {
      const item = apiData.data[key];

      if (!item || !item.card) {
        continue;
      }

      const isBasicLand = item.card.type_line?.startsWith("Basic Land");
      const isToken = item.card.type_line?.includes("Token");

      if (isBasicLand || isToken) {
        continue;
      }

      pageCards.push({
        name: item.card.name,
        scryfall_id: item.card.scryfall_id,
        quantity: item.quantity,
        condition: item.condition,
        isFoil: item.isFoil,
        set: item.card.set,
        set_name: item.card.set_name,
        type_line: item.card.type_line || "",
      });
    }

    console.log(`  Got ${pageCards.length} cards from page ${pageNumber}`);
    allCards = allCards.concat(pageCards);

    if (pageCards.length < pageSize || Object.keys(apiData.data).length === 0) {
      hasMorePages = false;
    } else {
      pageNumber++;
    }
  }

  console.log("Total cards processed:", allCards.length);
  return allCards;
}
