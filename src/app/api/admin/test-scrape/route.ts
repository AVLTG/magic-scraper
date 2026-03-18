import { NextResponse } from 'next/server';

export const maxDuration = 30;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('id') ?? 'tQcWaTADxkSO7fgT0s2_Xw'; // Amirali's default

  const apiUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10&playStyle=paperDollars&pricingProvider=cardkingdom`;

  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    const bodyText = await response.text();
    let bodyPreview: unknown;
    try {
      const parsed = JSON.parse(bodyText);
      // Summarize structure without dumping everything
      bodyPreview = {
        topLevelKeys: Object.keys(parsed),
        dataType: Array.isArray(parsed.data) ? 'array' : typeof parsed.data,
        dataKeys: parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
          ? Object.keys(parsed.data).slice(0, 3)
          : null,
        dataLength: parsed.data
          ? Array.isArray(parsed.data)
            ? parsed.data.length
            : Object.keys(parsed.data).length
          : null,
        firstItemKeys: parsed.data
          ? Array.isArray(parsed.data)
            ? parsed.data[0] ? Object.keys(parsed.data[0]) : null
            : Object.values(parsed.data)[0] ? Object.keys(Object.values(parsed.data)[0] as object) : null
          : null,
        rawPreview: bodyText.slice(0, 500),
      };
    } catch {
      bodyPreview = { raw: bodyText.slice(0, 500) };
    }

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      body: bodyPreview,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
