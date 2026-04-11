/**
 * Integration tests for /api/games route handlers
 * Mocks prisma, rateLimit, and next/server; imports route handlers directly.
 */

const mockGameCreate = jest.fn();
const mockGameFindMany = jest.fn();
const mockGameFindUnique = jest.fn();
const mockGameUpdate = jest.fn();
const mockGameDelete = jest.fn();
const mockParticipantCreateMany = jest.fn();
const mockParticipantDeleteMany = jest.fn();
const mockTransaction = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetIpKey = jest.fn(() => 'test-ip');

jest.mock('@/lib/prisma', () => ({
  prisma: {
    game: {
      create: (...args: unknown[]) => mockGameCreate(...args),
      findMany: (...args: unknown[]) => mockGameFindMany(...args),
      findUnique: (...args: unknown[]) => mockGameFindUnique(...args),
      update: (...args: unknown[]) => mockGameUpdate(...args),
      delete: (...args: unknown[]) => mockGameDelete(...args),
    },
    gameParticipant: {
      createMany: (...args: unknown[]) => mockParticipantCreateMany(...args),
      deleteMany: (...args: unknown[]) => mockParticipantDeleteMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
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

import { POST, GET as getGames } from '../src/app/api/games/route';

function makeRequest(body?: unknown): Request {
  return {
    headers: { get: (_name: string) => null },
    json: async () => body,
  } as unknown as Request;
}

const validGameBody = {
  date: '2026-04-10T00:00:00.000Z',
  wonByCombo: false,
  notes: 'Close game',
  participants: [
    {
      playerName: 'Alice',
      isWinner: true,
      isScrewed: false,
      deckName: 'Atraxa',
    },
    {
      playerName: 'Bob',
      isWinner: false,
      isScrewed: true,
      deckName: 'Edric',
    },
  ],
};

describe('POST /api/games', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          game: {
            create: mockGameCreate,
            update: mockGameUpdate,
          },
          gameParticipant: {
            createMany: mockParticipantCreateMany,
            deleteMany: mockParticipantDeleteMany,
          },
        };
        return fn(tx);
      }
    );
  });

  it('creates game with participants atomically and returns 201', async () => {
    mockGameCreate.mockResolvedValue({
      id: 'g1',
      date: new Date('2026-04-10T00:00:00.000Z'),
      wonByCombo: false,
      notes: 'Close game',
      createdAt: new Date(),
    });
    mockParticipantCreateMany.mockResolvedValue({ count: 2 });

    const res: any = await POST(makeRequest(validGameBody));

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockGameCreate).toHaveBeenCalled();
    expect(mockParticipantCreateMany).toHaveBeenCalled();
    const createManyArg = mockParticipantCreateMany.mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(2);
    expect(createManyArg.data[0]).toMatchObject({
      playerName: 'Alice',
      isWinner: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.game).toBeDefined();
  });

  it('returns 400 when participants missing', async () => {
    const res: any = await POST(
      makeRequest({ date: '2026-04-10T00:00:00.000Z' })
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 when more than 4 participants', async () => {
    const body = {
      ...validGameBody,
      participants: [
        { playerName: 'A', isWinner: true, isScrewed: false },
        { playerName: 'B', isWinner: false, isScrewed: false },
        { playerName: 'C', isWinner: false, isScrewed: false },
        { playerName: 'D', isWinner: false, isScrewed: false },
        { playerName: 'E', isWinner: false, isScrewed: false },
      ],
    };
    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('returns 400 when playerName is empty string', async () => {
    const body = {
      ...validGameBody,
      participants: [{ playerName: '', isWinner: true, isScrewed: false }],
    };
    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('allows a participant to be winner AND screwed (D-02)', async () => {
    mockGameCreate.mockResolvedValue({
      id: 'g1',
      date: new Date(),
      wonByCombo: false,
      notes: null,
      createdAt: new Date(),
    });
    mockParticipantCreateMany.mockResolvedValue({ count: 1 });
    const body = {
      ...validGameBody,
      participants: [
        {
          playerName: 'Alice',
          isWinner: true,
          isScrewed: true,
          deckName: 'Atraxa',
        },
      ],
    };
    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(201);
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 42,
    });
    const res: any = await POST(makeRequest(validGameBody));
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded' });
    expect(res.headers['Retry-After']).toBe('42');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 500 on transaction failure', async () => {
    mockTransaction.mockRejectedValue(new Error('tx failed'));
    const res: any = await POST(makeRequest(validGameBody));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to create game' });
  });

  it('calls checkRateLimit with (ip, 30, 60000)', async () => {
    mockGameCreate.mockResolvedValue({
      id: 'g1',
      date: new Date(),
      wonByCombo: false,
      notes: null,
      createdAt: new Date(),
    });
    mockParticipantCreateMany.mockResolvedValue({ count: 2 });
    await POST(makeRequest(validGameBody));
    expect(mockCheckRateLimit).toHaveBeenCalledWith('test-ip', 30, 60000);
  });
});

describe('GET /api/games', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns games ordered by date desc with participants', async () => {
    mockGameFindMany.mockResolvedValue([
      {
        id: 'g2',
        date: new Date('2026-04-10'),
        wonByCombo: false,
        notes: null,
        createdAt: new Date(),
        participants: [],
      },
      {
        id: 'g1',
        date: new Date('2026-04-09'),
        wonByCombo: false,
        notes: null,
        createdAt: new Date(),
        participants: [],
      },
    ]);
    const res: any = await getGames(makeRequest());
    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(2);
    const call = mockGameFindMany.mock.calls[0][0];
    expect(call.include).toEqual({ participants: true });
    expect(call.orderBy).toEqual({ date: 'desc' });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 7,
    });
    const res: any = await getGames(makeRequest());
    expect(res.status).toBe(429);
    expect(res.headers['Retry-After']).toBe('7');
    expect(mockGameFindMany).not.toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockGameFindMany.mockRejectedValue(new Error('db down'));
    const res: any = await getGames(makeRequest());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch games' });
  });
});
