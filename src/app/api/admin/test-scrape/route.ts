import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireAdmin } from "@/lib/session";
import { checkRateLimit, getIpKey } from "@/lib/rateLimit";

const execFileAsync = promisify(execFile);

export const maxDuration = 30;

async function fetchMoxfield(targetUrl: string): Promise<{ method: string; body: string }> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;

  if (scraperApiKey) {
    const proxyUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(proxyUrl);
    return { method: "scraperapi", body: await res.text() };
  }

  const { stdout } = await execFileAsync("curl", [
    "-s",
    "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-H", "Accept: application/json, text/plain, */*",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://www.moxfield.com/",
    "-H", "Origin: https://www.moxfield.com",
    targetUrl,
  ]);
  return { method: "curl", body: stdout };
}

export async function GET(request: Request) {
  // Each call makes a real outbound scrape (ScraperAPI credits or a curl
  // subprocess) — throttle on its own bucket, not the shared per-IP one.
  const rl = checkRateLimit(`test-scrape:${getIpKey(request)}`, 5, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get("id") ?? "tQcWaTADxkSO7fgT0s2_Xw";

  const targetUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10&playStyle=paperDollars&pricingProvider=cardkingdom`;

  try {
    const { method, body } = await fetchMoxfield(targetUrl);

    let bodyPreview: unknown;
    try {
      const parsed = JSON.parse(body);
      bodyPreview = {
        topLevelKeys: Object.keys(parsed),
        dataType: Array.isArray(parsed.data) ? "array" : typeof parsed.data,
        dataLength: parsed.data
          ? Array.isArray(parsed.data)
            ? parsed.data.length
            : Object.keys(parsed.data).length
          : null,
        firstItemKeys:
          parsed.data && !Array.isArray(parsed.data)
            ? Object.keys(Object.values(parsed.data)[0] as object)
            : null,
      };
    } catch {
      bodyPreview = { raw: body.slice(0, 500) };
    }

    return NextResponse.json({ method, ok: true, body: bodyPreview });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
