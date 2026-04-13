/**
 * Tests for /api/games/[id]/notify endpoint
 * Mocks prisma, discord, rateLimit, and next/server following games-api.test.ts pattern.
 */

const mockGameFindUnique = jest.fn();
const mockGameUpdate = jest.fn();
const mockSendDiscordAlert = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetIpKey = jest.fn((..._args: unknown[]) => 'test-ip');

jest.mock('@/lib/prisma', () => ({
  prisma: {
    game: {
      findUnique: (...args: unknown[]) => mockGameFindUnique(...args),
      update: (...args: unknown[]) => mockGameUpdate(...args),
    },
  },
}));

jest.mock('@/lib/discord', () => ({
  sendDiscordAlert: (...args: unknown[]) => mockSendDiscordAlert(...args),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getIpKey: (...args: unknown[]) => mockGetIpKey(...args),
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

import { POST } from '../src/app/api/games/[id]/notify/route';

function makeRequest(): Request {
  return {
    headers: { get: (_name: string) => null },
    json: async () => ({}),
  } as unknown as Request;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseGame = {
  id: 'g1',
  date: new Date('2026-04-10'),
  wonByCombo: false,
  notes: null,
  isImported: false,
  discordNotified: false,
  createdAt: new Date(),
  participants: [
    {
      id: 'p1',
      gameId: 'g1',
      playerName: 'Alice',
      isWinner: true,
      isScrewed: false,
      deckName: 'Atraxa',
    },
    {
      id: 'p2',
      gameId: 'g1',
      playerName: 'Bob',
      isWinner: false,
      isScrewed: false,
      deckName: 'Edric',
    },
  ],
};

describe('POST /api/games/[id]/notify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockGameUpdate.mockResolvedValue({ ...baseGame, discordNotified: true });
  });

  it('returns 404 when game not found', async () => {
    mockGameFindUnique.mockResolvedValue(null);

    const res: any = await POST(makeRequest(), makeParams('missing'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(mockSendDiscordAlert).not.toHaveBeenCalled();
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when game already notified', async () => {
    mockGameFindUnique.mockResolvedValue({ ...baseGame, discordNotified: true });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Notification already sent' });
    expect(mockSendDiscordAlert).not.toHaveBeenCalled();
    expect(mockGameUpdate).not.toHaveBeenCalled();
  });

  it('sends correct Discord message with winner name, deck, combo text and marks notified', async () => {
    mockGameFindUnique.mockResolvedValue({ ...baseGame, wonByCombo: true });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New game added! Alice won using Atraxa via combo. Check it out at magic-scraper.avltg.dev/games',
    });
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { discordNotified: true },
    });
  });

  it('uses fallback deck text "a deck they forgot to list" when winner has no deckName', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      participants: [
        {
          id: 'p1',
          gameId: 'g1',
          playerName: 'Alice',
          isWinner: true,
          isScrewed: false,
          deckName: null,
        },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New game added! Alice won using a deck they forgot to list without any combos. Check it out at magic-scraper.avltg.dev/games',
    });
  });

  it('uses "without any combos" when wonByCombo is false', async () => {
    mockGameFindUnique.mockResolvedValue({ ...baseGame, wonByCombo: false });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New game added! Alice won using Atraxa without any combos. Check it out at magic-scraper.avltg.dev/games',
    });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 15,
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded' });
    expect(res.headers['Retry-After']).toBe('15');
    expect(mockGameFindUnique).not.toHaveBeenCalled();
    expect(mockSendDiscordAlert).not.toHaveBeenCalled();
  });
});
