const mockGetSession = jest.fn()
jest.mock('@/lib/session', () => ({ getSession: (...a: unknown[]) => mockGetSession(...a) }))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

let ipCounter = 100
function makeRequest(body?: Record<string, unknown>): Request {
  ipCounter += 1
  return {
    json: async () => body ?? {},
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.9.9.${ipCounter}` : null) },
  } as unknown as Request
}

import { POST } from '../src/app/api/decks/fetch-url/route'

const MEMBER = { userId: 'u1', role: 'MEMBER', isLegacyAdmin: false }

describe('POST /api/decks/fetch-url', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockGetSession.mockResolvedValue(MEMBER)
    ;(global.fetch as unknown as jest.Mock | undefined)?.mockReset?.()
  })

  it('401s unauthenticated callers', async () => {
    mockGetSession.mockResolvedValue(null)
    const res: any = await POST(makeRequest({ url: 'https://moxfield.com/decks/abc123' }))
    expect(res.status).toBe(401)
  })

  it('400s non-Moxfield URLs without fetching', async () => {
    const spy = jest.spyOn(global, 'fetch')
    const res: any = await POST(makeRequest({ url: 'https://example.com/decks/abc' }))
    expect(res.status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('maps upstream 404 to 404 and other failures to 502', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response) as typeof fetch
    expect(((await POST(makeRequest({ url: 'https://moxfield.com/decks/abc123' }))) as any).status).toBe(404)
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as typeof fetch
    const res: any = await POST(makeRequest({ url: 'abc123' }))
    expect(res.status).toBe(502)
  })

  it('returns converted boards on success', async () => {
    global.fetch = jest.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'Dragons',
          format: 'commander',
          commanders: { k: { quantity: 1, card: { name: 'Ur-Dragon', set: 'cmm', cn: '1' } } },
          mainboard: { a: { quantity: 1, card: { name: 'Sol Ring', set: 'c21', cn: '263' } } },
          sideboard: {},
          maybeboard: {},
        }),
      }) as Response) as typeof fetch
    const res: any = await POST(makeRequest({ url: 'https://moxfield.com/decks/abc123' }))
    expect(res.status).toBe(200)
    expect(res.body.deck.name).toBe('Dragons')
    expect(res.body.deck.commander).toBe('Ur-Dragon')
    expect(res.body.deck.main).toContain('Sol Ring')
  })
})
