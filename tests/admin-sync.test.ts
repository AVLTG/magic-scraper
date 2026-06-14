/**
 * Tests for src/app/api/admin/users/[id]/sync/route.ts (manual collection sync).
 * Verifies the admin guard plus the success/failure branches.
 */

const mockUpdateUserCollection = jest.fn();
jest.mock('@/lib/updateCollections', () => ({
  updateUserCollection: (...args: any[]) => mockUpdateUserCollection(...args),
}));

const mockSendDiscordAlert = jest.fn();
jest.mock('@/lib/discord', () => ({
  sendDiscordAlert: (...args: any[]) => mockSendDiscordAlert(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

const mockRequireAdmin = jest.fn();
jest.mock('@/lib/session', () => ({
  requireAdmin: (...args: any[]) => mockRequireAdmin(...args),
}));

import { POST } from '@/app/api/admin/users/[id]/sync/route';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/admin/users/[id]/sync', () => {
  beforeEach(() => {
    mockUpdateUserCollection.mockReset();
    mockSendDiscordAlert.mockReset();
    mockRequireAdmin.mockResolvedValue({ ok: true, session: { userId: 'admin', role: 'ADMIN', isLegacyAdmin: false } });
  });

  it('403s a non-admin without syncing', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } });
    const res: any = await POST(undefined as never, params('u1'));
    expect(res.status).toBe(403);
    expect(mockUpdateUserCollection).not.toHaveBeenCalled();
  });

  it('triggers a manual sync for an admin', async () => {
    mockUpdateUserCollection.mockResolvedValue({ success: true, userName: 'Alice' });
    const res: any = await POST(undefined as never, params('u1'));
    expect(mockUpdateUserCollection).toHaveBeenCalledWith('u1', 'manual');
    expect(res.body).toEqual({ success: true });
  });

  it('500s and alerts Discord on sync failure', async () => {
    mockUpdateUserCollection.mockResolvedValue({ success: false, error: 'boom', userName: 'Alice' });
    const res: any = await POST(undefined as never, params('u1'));
    expect(res.status).toBe(500);
    expect(mockSendDiscordAlert).toHaveBeenCalled();
  });
});
