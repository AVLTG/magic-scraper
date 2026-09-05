/**
 * Integration tests for /api/players route handler
 * Mocks prisma, rateLimit, and next/server
 *
 * NOTE: The old /api/decks GET (distinct GameParticipant deckNames) was removed
 * in the user-decks-library feature. Those tests lived here and are deleted.
 * The new /api/decks GET returns tiered {userDecks, otherDecks} — see decks-api.test.ts.
 */

const mockUserFindMany: jest.Mock = jest.fn();
const mockParticipantFindMany: jest.Mock = jest.fn();
const mockCheckRateLimit: jest.Mock = jest.fn();
const mockGetIpKey: jest.Mock = jest.fn(() => 'test-ip');

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    gameParticipant: { findMany: (...args: unknown[]) => mockParticipantFindMany(...args) },
  },
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (key: string, limit: number, windowMs: number) =>
    mockCheckRateLimit(key, limit, windowMs),
  routeKey: (request: Request, route: string) => `${route}:${mockGetIpKey(request)}`,
  getIpKey: (request: Request) => mockGetIpKey(request),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    })),
  },
}));

import { GET as getPlayers } from '../src/app/api/players/route';

function makeRequest(): Request {
  return {
    headers: { get: (_name: string) => null },
  } as unknown as Request;
}

describe('GET /api/players', () => {
  beforeEach(() => {
    mockUserFindMany.mockReset();
    mockParticipantFindMany.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns union of users.name and participants.playerName sorted and deduped', async () => {
    mockUserFindMany.mockResolvedValue([{ name: 'Bob' }, { name: 'Carol' }]);
    mockParticipantFindMany.mockResolvedValue([{ playerName: 'Alice' }, { playerName: 'Bob' }]);
    const res: any = await getPlayers(makeRequest());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ players: ['Alice', 'Bob', 'Carol'] });
  });

  it('returns empty array when there is no data', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockParticipantFindMany.mockResolvedValue([]);
    const res: any = await getPlayers(makeRequest());
    expect(res.body).toEqual({ players: [] });
  });

  it('returns 429 with Retry-After header when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
    const res: any = await getPlayers(makeRequest());
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded' });
    expect(res.headers['Retry-After']).toBe('42');
  });

  it('calls checkRateLimit with (ip, 30, 60000)', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockParticipantFindMany.mockResolvedValue([]);
    await getPlayers(makeRequest());
    expect(mockCheckRateLimit).toHaveBeenCalledWith('players:get:test-ip', 30, 60000);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindMany.mockRejectedValue(new Error('db down'));
    mockParticipantFindMany.mockResolvedValue([]);
    const res: any = await getPlayers(makeRequest());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch players' });
  });

  it('dedupes case-sensitively (alice and Alice are distinct entries)', async () => {
    mockUserFindMany.mockResolvedValue([{ name: 'Alice' }]);
    mockParticipantFindMany.mockResolvedValue([{ playerName: 'alice' }, { playerName: 'Alice' }]);
    const res: any = await getPlayers(makeRequest());
    // Both cases preserved (dedup is case-sensitive via Set), Alice appears exactly once
    expect(res.body.players).toContain('Alice');
    expect(res.body.players).toContain('alice');
    expect(res.body.players.filter((p: string) => p === 'Alice')).toHaveLength(1);
    expect(res.body.players).toHaveLength(2);
  });

  it('excludes random participants from the player list', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockParticipantFindMany.mockResolvedValue([{ playerName: 'Alice' }, { playerName: 'Bob' }]);
    const res: any = await getPlayers(makeRequest());
    expect(res.status).toBe(200);
    const callArg = mockParticipantFindMany.mock.calls[0][0];
    expect(callArg.where).toEqual(expect.objectContaining({ isRandom: false }));
  });
});

