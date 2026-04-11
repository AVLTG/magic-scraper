/**
 * Integration tests for /api/players and /api/decks route handlers
 * Mocks prisma, rateLimit, and next/server
 */

const mockUserFindMany = jest.fn();
const mockParticipantFindMany = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetIpKey = jest.fn(() => 'test-ip');

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    gameParticipant: { findMany: (...args: unknown[]) => mockParticipantFindMany(...args) },
  },
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getIpKey: (...args: unknown[]) => mockGetIpKey(...args),
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
import { GET as getDecks } from '../src/app/api/decks/route';

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
    expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 30, 60000);
  });

  it('returns 500 on DB error', async () => {
    mockUserFindMany.mockRejectedValue(new Error('db down'));
    mockParticipantFindMany.mockResolvedValue([]);
    const res: any = await getPlayers(makeRequest());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch players' });
  });
});

describe('GET /api/decks', () => {
  beforeEach(() => {
    mockParticipantFindMany.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns distinct non-null deckNames sorted', async () => {
    mockParticipantFindMany.mockResolvedValue([
      { deckName: 'Edric' },
      { deckName: 'Atraxa' },
      { deckName: 'Edric' },
    ]);
    const res: any = await getDecks(makeRequest());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ decks: ['Atraxa', 'Edric'] });
  });

  it('filters null deckNames out', async () => {
    mockParticipantFindMany.mockResolvedValue([{ deckName: null }, { deckName: 'Edric' }]);
    const res: any = await getDecks(makeRequest());
    expect(res.body).toEqual({ decks: ['Edric'] });
  });

  it('returns empty array when no games', async () => {
    mockParticipantFindMany.mockResolvedValue([]);
    const res: any = await getDecks(makeRequest());
    expect(res.body).toEqual({ decks: [] });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 10 });
    const res: any = await getDecks(makeRequest());
    expect(res.status).toBe(429);
    expect(res.headers['Retry-After']).toBe('10');
  });

  it('calls checkRateLimit with (ip, 30, 60000)', async () => {
    mockParticipantFindMany.mockResolvedValue([]);
    await getDecks(makeRequest());
    expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 30, 60000);
  });

  it('returns 500 on DB error', async () => {
    mockParticipantFindMany.mockRejectedValue(new Error('db down'));
    const res: any = await getDecks(makeRequest());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch decks' });
  });
});
