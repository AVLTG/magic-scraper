/**
 * Tests for src/app/api/admin/users/[id]/sync-logs/route.ts
 * Tests sync log retrieval: last 4 cron + last 1 manual per user
 */

const mockSyncLogFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    syncLog: {
      findMany: (...args: any[]) => mockSyncLogFindMany(...args),
    },
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
  NextRequest: jest.fn(),
}));

import { GET } from '@/app/api/admin/users/[id]/sync-logs/route';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/users/[id]/sync-logs', () => {
  beforeEach(() => {
    mockSyncLogFindMany.mockClear();
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockClear();
  });

  it('returns merged and sorted logs: last 4 cron + last 1 manual', async () => {
    const cronLogs = [
      { id: 'c1', userId: '1', status: 'success', errorMessage: null, source: 'cron', createdAt: new Date('2024-01-04T10:00:00Z') },
      { id: 'c2', userId: '1', status: 'success', errorMessage: null, source: 'cron', createdAt: new Date('2024-01-03T10:00:00Z') },
      { id: 'c3', userId: '1', status: 'failure', errorMessage: 'timeout', source: 'cron', createdAt: new Date('2024-01-02T10:00:00Z') },
      { id: 'c4', userId: '1', status: 'success', errorMessage: null, source: 'cron', createdAt: new Date('2024-01-01T10:00:00Z') },
    ];
    const manualLogs = [
      { id: 'm1', userId: '1', status: 'success', errorMessage: null, source: 'manual', createdAt: new Date('2024-01-03T15:00:00Z') },
    ];

    mockSyncLogFindMany
      .mockResolvedValueOnce(cronLogs)
      .mockResolvedValueOnce(manualLogs);

    const result = await GET({} as any, makeParams('1'));

    // Should have called findMany twice: once for cron, once for manual
    expect(mockSyncLogFindMany).toHaveBeenCalledTimes(2);
    expect(mockSyncLogFindMany).toHaveBeenCalledWith({
      where: { userId: '1', source: 'cron' },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    expect(mockSyncLogFindMany).toHaveBeenCalledWith({
      where: { userId: '1', source: 'manual' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect((result as any).status).toBe(200);
    const logs = (result as any).body as any[];
    expect(logs).toHaveLength(5);
    // Sorted newest first: c1 (Jan 4), m1 (Jan 3 15:00), c2 (Jan 3 10:00), c3 (Jan 2), c4 (Jan 1)
    expect(logs[0].id).toBe('c1');
    expect(logs[1].id).toBe('m1');
    expect(logs[2].id).toBe('c2');
    expect(logs[3].id).toBe('c3');
    expect(logs[4].id).toBe('c4');
  });

  it('returns empty array when no logs exist', async () => {
    mockSyncLogFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await GET({} as any, makeParams('1'));

    expect((result as any).status).toBe(200);
    expect((result as any).body).toEqual([]);
  });

  it('returns 500 when prisma throws', async () => {
    mockSyncLogFindMany.mockRejectedValue(new Error('DB error'));

    const result = await GET({} as any, makeParams('1'));

    expect((result as any).status).toBe(500);
    expect((result as any).body).toEqual({ error: 'Failed to fetch sync logs' });
  });
});
