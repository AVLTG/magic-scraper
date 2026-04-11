import { NextResponse } from "next/server";
import { scrapeAllSites } from "@/lib/scrapeLGS/scrapeAllSites";
import { getCached, setCache } from "@/lib/scrapeLGS/lgsCache";
import { checkRateLimit, getIpKey } from "@/lib/rateLimit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const body = await request.json();
    const card = typeof body.card === "string" ? body.card.trim() : "";

    if (!card) {
      return NextResponse.json({ error: "card is required" }, { status: 400 });
    }

    // Check cache first
    const cached = getCached(card);
    if (cached) {
      return NextResponse.json({
        products: cached.products,
        failedStores: cached.failedStores,
      });
    }

    // Cache miss — scrape all stores
    const { products, failedStores } = await scrapeAllSites(card);

    // Cache the result (even partial results with failedStores)
    setCache(card, { products, failedStores });

    return NextResponse.json({ products, failedStores });
  } catch (error) {
    console.error("Scrape failed", error);
    return NextResponse.json({ error: "Failed to scrape" }, { status: 500 });
  }
}
