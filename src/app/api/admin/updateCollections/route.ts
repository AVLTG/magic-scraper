import { NextResponse } from 'next/server';
import { updateAllCollections } from '@/lib/updateCollections';
import { sendDiscordAlert } from '@/lib/discord';

export const maxDuration = 300;

export async function POST() {
  try {
    const { succeeded, failed } = await updateAllCollections('manual');
    if (failed.length > 0) {
      const lines = failed.map(f => `- ${f.name}: ${f.error}`).join('\n');
      await sendDiscordAlert({
        content: `⚠️ Manual sync completed with ${failed.length} failure(s) (${succeeded.length} succeeded):\n${lines}`,
      });
      return NextResponse.json({
        success: false,
        message: `Sync completed with errors. Failed: ${failed.map(f => f.name).join(', ')}`,
        succeeded: succeeded.length,
        failed: failed.length,
      });
    }
    await sendDiscordAlert({
      content: `✅ Manual sync complete: ${succeeded.length} user(s) synced successfully`,
    });
    return NextResponse.json({ success: true, message: 'Collections updated successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
