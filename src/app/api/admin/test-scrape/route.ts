import { NextResponse } from "next/server";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";

export const maxDuration = 30;

function httpsGet(url: string, agent: HttpsProxyAgent<string>, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers, agent },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get("id") ?? "tQcWaTADxkSO7fgT0s2_Xw";

  const proxyPassword = process.env.APIFY_ID;
  if (!proxyPassword) {
    return NextResponse.json({ error: "APIFY_ID not set" }, { status: 500 });
  }

  const targetUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10&playStyle=paperDollars&pricingProvider=cardkingdom`;
  const proxyUrl = `http://auto:${proxyPassword}@proxy.apify.com:8000`;
  const agent = new HttpsProxyAgent(proxyUrl);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.moxfield.com/",
    Origin: "https://www.moxfield.com",
  };

  try {
    const { status, body } = await httpsGet(targetUrl, agent, headers);

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

    return NextResponse.json({ status, ok: status >= 200 && status < 300, body: bodyPreview });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && "cause" in error ? String((error as NodeJS.ErrnoException).cause) : undefined;
    return NextResponse.json({ error: msg, cause }, { status: 500 });
  }
}
