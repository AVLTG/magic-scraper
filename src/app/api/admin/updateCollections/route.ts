import { NextResponse } from 'next/server';
import { updateAllCollections } from '@/lib/updateCollections';

export const maxDuration = 60;

export async function POST() {
  try {
    await updateAllCollections();
    return NextResponse.json({ success: true, message: 'Collections updated successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Update error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
