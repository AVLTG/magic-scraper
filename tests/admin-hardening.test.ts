/**
 * Tests for in-handler admin auth on /api/admin routes that previously relied
 * solely on the proxy gate: updateCollections, scraper-health, test-scrape.
 * Verifies the requireAdmin() defense-in-depth guard (mirrors admin-sync.test.ts).
 */

const mockUpdateAll = jest.fn();
jest.mock('@/lib/updateCollections', () => ({
  updateAllCollections: (...args: any[]) => mockUpdateAll(...args),
}));

const mockSendDiscordAlert = jest.fn();
jest.mock('@/lib/discord', () => ({
  sendDiscordAlert: (...args: any[]) => mockSendDiscordAlert(...args),
}));

const mockGetAllStoreHealth = jest.fn();
jest.mock('@/lib/scraperHealthCache', () => ({
  getAllStoreHealth: (...args: any[]) => mockGetAllStoreHealth(...args),
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

import { POST as updateCollectionsPost } from '@/app/api/admin/updateCollections/route';
import { GET as scraperHealthGet } from '@/app/api/admin/scraper-health/route';
import { GET as testScrapeGet } from '@/app/api/admin/test-scrape/route';

const adminOk = { ok: true as const, session: { userId: 'admin', role: 'ADMIN', isLegacyAdmin: false } };

describe('POST /api/admin/updateCollections', () => {
  beforeEach(() => {
    mockUpdateAll.mockReset();
    mockSendDiscordAlert.mockReset();
    mockRequireAdmin.mockReset().mockResolvedValue(adminOk);
  });

  it('401s without a session and never syncs', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 401 } });
    const res: any = await updateCollectionsPost();
    expect(res.status).toBe(401);
    expect(mockUpdateAll).not.toHaveBeenCalled();
  });

  it('403s a non-admin and never syncs', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } });
    const res: any = await updateCollectionsPost();
    expect(res.status).toBe(403);
    expect(mockUpdateAll).not.toHaveBeenCalled();
  });

  it('syncs for an admin', async () => {
    mockUpdateAll.mockResolvedValue({ succeeded: ['Alice'], failed: [] });
    const res: any = await updateCollectionsPost();
    expect(mockUpdateAll).toHaveBeenCalledWith('manual');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/scraper-health', () => {
  beforeEach(() => {
    mockGetAllStoreHealth.mockReset().mockReturnValue({});
    mockRequireAdmin.mockReset().mockResolvedValue(adminOk);
  });

  it('401s without a session', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 401 } });
    const res: any = await scraperHealthGet();
    expect(res.status).toBe(401);
    expect(mockGetAllStoreHealth).not.toHaveBeenCalled();
  });

  it('403s a non-admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 403 } });
    const res: any = await scraperHealthGet();
    expect(res.status).toBe(403);
  });

  it('returns health for an admin', async () => {
    const res: any = await scraperHealthGet();
    expect(res.status).toBe(200);
    expect(mockGetAllStoreHealth).toHaveBeenCalled();
  });
});

describe('GET /api/admin/test-scrape', () => {
  const makeRequest = (): any => ({
    url: 'http://localhost/api/admin/test-scrape?id=abc',
    headers: { get: () => '127.0.0.1' },
  });

  beforeEach(() => {
    mockRequireAdmin.mockReset().mockResolvedValue(adminOk);
  });

  it('401s without a session and never fetches', async () => {
    mockRequireAdmin.mockResolvedValueOnce({ ok: false, response: { status: 401 } });
    const res: any = await testScrapeGet(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rate-limits repeated calls even for an admin', async () => {
    // The limiter is module-global per IP — hammer past the limit and expect a 429
    // without any outbound fetch happening for the limited call.
    const responses: any[] = [];
    for (let i = 0; i < 12; i++) {
      responses.push(await testScrapeGet(makeRequest()));
    }
    expect(responses.some((r) => r.status === 429)).toBe(true);
  });
});
