import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const [cronLogs, manualLogs] = await Promise.all([
      prisma.syncLog.findMany({
        where: { userId: id, source: 'cron' },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      prisma.syncLog.findMany({
        where: { userId: id, source: 'manual' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
    ]);
    const logs = [...cronLogs, ...manualLogs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json(logs);
  } catch (error) {
    console.error('Failed to fetch sync logs:', error);
    return NextResponse.json({ error: 'Failed to fetch sync logs' }, { status: 500 });
  }
}
