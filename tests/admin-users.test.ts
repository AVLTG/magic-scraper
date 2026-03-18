/**
 * Tests for src/app/api/admin/users/route.ts and src/app/api/admin/users/[id]/route.ts
 * Mocks Prisma and next/server to test route handlers in isolation
 */

const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: (...args: any[]) => mockFindMany(...args),
      create: (...args: any[]) => mockCreate(...args),
      delete: (...args: any[]) => mockDelete(...args),
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

import { GET, POST } from '@/app/api/admin/users/route';
import { DELETE } from '@/app/api/admin/users/[id]/route';

function makeRequest(body?: object): any {
  return {
    json: async () => body,
  };
}

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockClear();
  });

  it('GET returns user list', async () => {
    const mockUsers = [{ id: '1', name: 'Alice', moxfieldCollectionId: 'abc' }];
    mockFindMany.mockResolvedValue(mockUsers);

    const result = await GET();

    expect(mockFindMany).toHaveBeenCalledWith({
      select: { id: true, name: true, moxfieldCollectionId: true },
      orderBy: { name: 'asc' },
    });
    expect((result as any).status).toBe(200);
    expect((result as any).body).toEqual(mockUsers);
  });
});

describe('POST /api/admin/users', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockClear();
  });

  it('POST creates user and returns 201', async () => {
    const newUser = { id: '2', name: 'Bob', moxfieldCollectionId: 'def' };
    mockCreate.mockResolvedValue(newUser);

    const req = makeRequest({ name: 'Bob', moxfieldCollectionId: 'def' });
    const result = await POST(req);

    expect(mockCreate).toHaveBeenCalledWith({
      data: { name: 'Bob', moxfieldCollectionId: 'def' },
    });
    expect((result as any).status).toBe(201);
    expect((result as any).body).toEqual(newUser);
  });

  it('POST returns 400 when name is empty', async () => {
    const req = makeRequest({ name: '', moxfieldCollectionId: 'def' });
    const result = await POST(req);

    expect(mockCreate).not.toHaveBeenCalled();
    expect((result as any).status).toBe(400);
    expect((result as any).body).toEqual({ error: 'Name is required' });
  });

  it('POST returns 400 when moxfieldCollectionId is empty', async () => {
    const req = makeRequest({ name: 'Bob', moxfieldCollectionId: '' });
    const result = await POST(req);

    expect(mockCreate).not.toHaveBeenCalled();
    expect((result as any).status).toBe(400);
    expect((result as any).body).toEqual({ error: 'Moxfield Collection ID is required' });
  });

  it('POST returns 409 on duplicate moxfieldCollectionId', async () => {
    mockCreate.mockRejectedValue({ code: 'P2002' });

    const req = makeRequest({ name: 'Bob', moxfieldCollectionId: 'abc' });
    const result = await POST(req);

    expect((result as any).status).toBe(409);
    expect((result as any).body.error).toMatch(/already exists/);
  });
});

describe('DELETE /api/admin/users/[id]', () => {
  beforeEach(() => {
    mockDelete.mockClear();
    const { NextResponse } = jest.requireMock('next/server');
    NextResponse.json.mockClear();
  });

  it('DELETE returns 204 on success', async () => {
    mockDelete.mockResolvedValue({});

    const result = await DELETE(makeRequest(), { params: Promise.resolve({ id: '1' }) });

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: '1' } });
    expect(result.status).toBe(204);
  });

  it('DELETE returns 404 when user not found', async () => {
    mockDelete.mockRejectedValue({ code: 'P2025' });

    const result = await DELETE(makeRequest(), { params: Promise.resolve({ id: '999' }) });

    expect((result as any).status).toBe(404);
    expect((result as any).body).toEqual({ error: 'User not found' });
  });
});
