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
const mockGetIpKey = jest.fn((..._args: unknown[]) => 'test-ip');

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
import {
  GET as getGameById,
  PATCH as patchGame,
  DELETE as deleteGame,
} from '../src/app/api/games/[id]/route';

function makeRequest(body?: unknown): Request {
  return {
    headers: { get: (_name: string) => null },
    json: async () => body,
  } as unknown as Request;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
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

describe('GET /api/games/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns 200 with game + participants when found', async () => {
    mockGameFindUnique.mockResolvedValue({
      id: 'g1',
      date: new Date('2026-04-10'),
      wonByCombo: false,
      notes: null,
      createdAt: new Date(),
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
    const res: any = await getGameById(makeRequest(), makeParams('g1'));
    expect(res.status).toBe(200);
    expect(res.body.game.id).toBe('g1');
    expect(res.body.game.participants).toHaveLength(1);
  });

  it('returns 404 when game not found', async () => {
    mockGameFindUnique.mockResolvedValue(null);
    const res: any = await getGameById(makeRequest(), makeParams('missing'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 5,
    });
    const res: any = await getGameById(makeRequest(), makeParams('g1'));
    expect(res.status).toBe(429);
    expect(mockGameFindUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/games/[id]', () => {
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

  it('full-replace: deletes existing participants, updates game, creates new participants', async () => {
    mockParticipantDeleteMany.mockResolvedValue({ count: 2 });
    mockGameUpdate.mockResolvedValue({
      id: 'g1',
      date: new Date('2026-04-10'),
      wonByCombo: true,
      notes: 'updated',
      createdAt: new Date(),
    });
    mockParticipantCreateMany.mockResolvedValue({ count: 3 });

    const body = {
      date: '2026-04-10T00:00:00.000Z',
      wonByCombo: true,
      notes: 'updated',
      participants: [
        { playerName: 'X', isWinner: true, isScrewed: false },
        { playerName: 'Y', isWinner: false, isScrewed: false },
        { playerName: 'Z', isWinner: false, isScrewed: true },
      ],
    };
    const res: any = await patchGame(makeRequest(body), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockParticipantDeleteMany).toHaveBeenCalledWith({
      where: { gameId: 'g1' },
    });
    expect(mockGameUpdate).toHaveBeenCalled();
    const cm = mockParticipantCreateMany.mock.calls[0][0];
    expect(cm.data).toHaveLength(3);
  });

  it('returns 400 on ZodError', async () => {
    const res: any = await patchGame(
      makeRequest({ foo: 'bar' }),
      makeParams('g1')
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 when update targets missing id (P2025)', async () => {
    mockTransaction.mockRejectedValue(
      Object.assign(new Error('Not found'), { code: 'P2025' })
    );
    const body = {
      date: '2026-04-10T00:00:00.000Z',
      wonByCombo: false,
      participants: [{ playerName: 'X', isWinner: true, isScrewed: false }],
    };
    const res: any = await patchGame(makeRequest(body), makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 3,
    });
    const res: any = await patchGame(makeRequest({}), makeParams('g1'));
    expect(res.status).toBe(429);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/games/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('deletes the game and returns 200', async () => {
    mockGameDelete.mockResolvedValue({ id: 'g1' });
    const res: any = await deleteGame(makeRequest(), makeParams('g1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockGameDelete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('does NOT explicitly delete participants (cascade handles it)', async () => {
    mockGameDelete.mockResolvedValue({ id: 'g1' });
    await deleteGame(makeRequest(), makeParams('g1'));
    expect(mockParticipantDeleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 when game missing (P2025)', async () => {
    mockGameDelete.mockRejectedValue(
      Object.assign(new Error('Not found'), { code: 'P2025' })
    );
    const res: any = await deleteGame(makeRequest(), makeParams('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 8,
    });
    const res: any = await deleteGame(makeRequest(), makeParams('g1'));
    expect(res.status).toBe(429);
    expect(mockGameDelete).not.toHaveBeenCalled();
  });
});
