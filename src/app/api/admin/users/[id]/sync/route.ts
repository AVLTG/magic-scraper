import { NextResponse } from 'next/server';
import { updateUserCollection } from '@/lib/updateCollections';
import { sendDiscordAlert } from '@/lib/discord';

export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await updateUserCollection(id, 'manual');
  if (!result.success) {
    await sendDiscordAlert({
      content: `⚠️ Manual sync failed for ${result.userName ?? id}: ${result.error}`,
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  // No success Discord message — status dot provides feedback per spec
  return NextResponse.json({ success: true });
}
