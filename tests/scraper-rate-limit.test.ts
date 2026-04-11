/**
 * Integration tests verifying rate limit behavior for scraper routes.
 * Mocks prisma + scrapeAllSites + lgsCache + rateLimit + next/server.
 *
 * Verifies D-24: scraper routes enforce 10 requests per 60s sliding window per IP.
 */

const mockCheckRateLimit = jest.fn();
const mockGetIpKey = jest.fn();
mockGetIpKey.mockReturnValue('test-ip');
const mockFindMany = jest.fn();
const mockScrapeAllSites = jest.fn();
const mockGetCached = jest.fn();
const mockSetCache = jest.fn();

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args: any[]) => mockCheckRateLimit(...args),
  getIpKey: (...args: any[]) => mockGetIpKey(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionCard: {
      findMany: (...args: any[]) => mockFindMany(...args),
    },
  },
}));

jest.mock('@/lib/parseDeck', () => ({
  parseDeckList: (text: string) =>
    text
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        return match
          ? { quantity: Number(match[1]), name: match[2] }
          : { quantity: 1, name: line.trim() };
      }),
}));

jest.mock('@/lib/scrapeLGS/scrapeAllSites', () => ({
  scrapeAllSites: (...args: any[]) => mockScrapeAllSites(...args),
}));

jest.mock('@/lib/scrapeLGS/lgsCache', () => ({
  getCached: (...args: any[]) => mockGetCached(...args),
  setCache: (...args: any[]) => mockSetCache(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn(
      (
        body: unknown,
        init?: { status?: number; headers?: Record<string, string> }
      ) => ({
        body,
        status: init?.status ?? 200,
        headers: init?.headers ?? {},
      })
    ),
  },
}));

import { POST as checkDeckPost } from '../src/app/api/checkDeck/route';
import { POST as scrapeLGSPost } from '../src/app/api/scrapeLGS/route';

function makeRequest(body?: unknown): Request {
  return {
    headers: { get: (_name: string) => null },
    json: async () => body ?? {},
  } as unknown as Request;
}

describe('POST /api/checkDeck rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls checkRateLimit with (ip, 10, 60000) before any DB work', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockFindMany.mockResolvedValue([]);
    await checkDeckPost(makeRequest({ decklist: '1 Lightning Bolt' }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 10, 60000);
  });

  it('returns 429 with Retry-After when rate limited and does NOT call prisma', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 42,
    });
    const res: any = await checkDeckPost(
      makeRequest({ decklist: '1 Lightning Bolt' })
    );
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded' });
    expect(res.headers['Retry-After']).toBe('42');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('proceeds when allowed: parses body and queries prisma', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockFindMany.mockResolvedValue([]);
    const res: any = await checkDeckPost(
      makeRequest({ decklist: '1 Lightning Bolt' })
    );
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalled();
  });
});

describe('POST /api/scrapeLGS rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 429 with Retry-After when rate limited and does NOT invoke scraper', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 15,
    });
    const res: any = await scrapeLGSPost(
      makeRequest({ card: 'Lightning Bolt' })
    );
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded' });
    expect(res.headers['Retry-After']).toBe('15');
    expect(mockScrapeAllSites).not.toHaveBeenCalled();
    expect(mockGetCached).not.toHaveBeenCalled();
  });

  it('calls checkRateLimit with (ip, 10, 60000)', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 1,
    });
    await scrapeLGSPost(makeRequest({ card: 'Lightning Bolt' }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 10, 60000);
  });
});
