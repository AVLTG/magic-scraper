import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { parseMoxfieldDeckId, fetchMoxfieldDeck } from '@/lib/moxfieldDeckFetch';

const bodySchema = z.object({
  url: z.string().trim().min(1, 'url is required').max(500, 'url too long'),
});

// Resolves a Moxfield share URL to plaintext boards. The fetch runs
// server-side; the client then commits each board through the existing
// dryRun/commit import endpoints, so all library validation is reused.
export async function POST(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'decks-fetch-url:post'), 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = bodySchema.parse(await request.json());
    if (!parseMoxfieldDeckId(url)) {
      return NextResponse.json(
        { error: 'That does not look like a Moxfield deck URL — paste the share link from moxfield.com/decks/…' },
        { status: 400 }
      );
    }

    try {
      const deck = await fetchMoxfieldDeck(url);
      return NextResponse.json({ deck });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch deck';
      const status = /not found/i.test(message) ? 404 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks/fetch-url error:', error);
    return NextResponse.json({ error: 'Failed to fetch deck' }, { status: 500 });
  }
}
