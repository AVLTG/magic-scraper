import { NextResponse } from 'next/server';
import { updateAllCollections } from '@/lib/updateCollections';

export const maxDuration = 60;

export async function POST() {
  try {
    const { succeeded, failed } = await updateAllCollections('manual');
    if (failed.length > 0) {
      return NextResponse.json({
        success: false,
        message: `Sync completed with errors. Failed: ${failed.map(f => f.name).join(', ')}`,
        succeeded: succeeded.length,
        failed: failed.length,
      });
    }
    return NextResponse.json({ success: true, message: 'Collections updated successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
