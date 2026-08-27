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
  routeKey: (request: unknown, route: string) => `${route}:${mockGetIpKey(request)}`,
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
    url: 'http://localhost:3000/api/games/g1/notify',
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
  variant: 'COMMANDER',
  bestOf: null,
  comboWins: null,
  createdAt: new Date(),
  participants: [
    {
      id: 'p1',
      gameId: 'g1',
      playerName: 'Alice',
      isWinner: true,
      isScrewed: false,
      isRandom: false,
      deckName: 'Atraxa',
      role: null,
    },
    {
      id: 'p2',
      gameId: 'g1',
      playerName: 'Bob',
      isWinner: false,
      isScrewed: false,
      isRandom: false,
      deckName: 'Edric',
      role: null,
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
        'New Commander game added! Alice won using Atraxa via combo. Check it out at http://localhost:3000/games',
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
          isRandom: false,
          deckName: null,
          role: null,
        },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Commander game added! Alice won using a deck they forgot to list without any combos. Check it out at http://localhost:3000/games',
    });
  });

  it('uses "without any combos" when wonByCombo is false', async () => {
    mockGameFindUnique.mockResolvedValue({ ...baseGame, wonByCombo: false });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Commander game added! Alice won using Atraxa without any combos. Check it out at http://localhost:3000/games',
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

  it('sends STAR multi-winner message format', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      variant: 'STAR',
      wonByCombo: true,
      participants: [
        { id: 'p1', gameId: 'g1', playerName: 'Bob', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Edric', role: null },
        { id: 'p2', gameId: 'g1', playerName: 'Alice', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa', role: null },
        { id: 'p3', gameId: 'g1', playerName: 'C', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: null },
        { id: 'p4', gameId: 'g1', playerName: 'D', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: null },
        { id: 'p5', gameId: 'g1', playerName: 'E', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: null },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Star Commander game added! Alice (Atraxa) and Bob (Edric) won together via combo. Check it out at http://localhost:3000/games',
    });
  });

  it('sends KING Royalty message with role labels and KING first', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      variant: 'KING',
      wonByCombo: false,
      participants: [
        { id: 'p1', gameId: 'g1', playerName: 'Bob', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Edric', role: 'SQUIRE' },
        { id: 'p2', gameId: 'g1', playerName: 'Zelda', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa', role: 'KING' },
        { id: 'p3', gameId: 'g1', playerName: 'Carol', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Kaalia', role: 'SQUIRE' },
        { id: 'p4', gameId: 'g1', playerName: 'Dan', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'ASSASSIN' },
        { id: 'p5', gameId: 'g1', playerName: 'Eve', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'ASSASSIN' },
        { id: 'p6', gameId: 'g1', playerName: 'Fred', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'ASSASSIN' },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New King Commander game added! Royalty won — Zelda (King, Atraxa), Bob (Squire, Edric), Carol (Squire, Kaalia) — without any combos. Check it out at http://localhost:3000/games',
    });
  });

  it('builds Bo3 STANDARD message from stored bestOf/comboWins', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: true });
    mockGameFindUnique.mockResolvedValueOnce({
      ...baseGame,
      id: 'g-bo3',
      variant: 'STANDARD',
      wonByCombo: true,
      bestOf: 3,
      comboWins: 2,
      participants: [
        {
          id: 'p-a',
          gameId: 'g-bo3',
          playerName: 'Alice',
          isWinner: true,
          isScrewed: false,
          isRandom: false,
          deckName: 'Burn',
          role: null,
        },
        {
          id: 'p-b',
          gameId: 'g-bo3',
          playerName: 'Bob',
          isWinner: false,
          isScrewed: false,
          isRandom: true,
          deckName: null,
          role: null,
        },
      ],
    });
    mockGameUpdate.mockResolvedValueOnce({});
    mockSendDiscordAlert.mockResolvedValueOnce(undefined);

    await POST(makeRequest(), makeParams('g-bo3'));

    const content = (mockSendDiscordAlert.mock.calls[0][0] as { content: string }).content;
    expect(content).toContain('New Standard (Bo3) game added!');
    expect(content).toContain('Alice won using Burn winning 2 games with combos.');
  });

  it('sends KING Assassins message in alphabetical order', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      variant: 'KING',
      wonByCombo: true,
      participants: [
        { id: 'p1', gameId: 'g1', playerName: 'Zelda', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'KING' },
        { id: 'p2', gameId: 'g1', playerName: 'Alex', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'SQUIRE' },
        { id: 'p3', gameId: 'g1', playerName: 'Beth', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'SQUIRE' },
        { id: 'p4', gameId: 'g1', playerName: 'Dan', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Voja', role: 'ASSASSIN' },
        { id: 'p5', gameId: 'g1', playerName: 'Carol', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Kaalia', role: 'ASSASSIN' },
        { id: 'p6', gameId: 'g1', playerName: 'Eve', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa', role: 'ASSASSIN' },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New King Commander game added! Assassins won — Carol (Kaalia), Dan (Voja), Eve (Atraxa) — via combo. Check it out at http://localhost:3000/games',
    });
  });
});
