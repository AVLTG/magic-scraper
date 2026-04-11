/**
 * Tests for src/lib/rateLimit.ts
 * Covers checkRateLimit sliding-window behavior and getIpKey header parsing.
 * Uses jest.resetModules to get a fresh buckets Map per test (the module-level
 * singleton otherwise leaks state across tests).
 */

describe('checkRateLimit', () => {
  let checkRateLimit: typeof import('../src/lib/rateLimit').checkRateLimit;

  beforeEach(() => {
    jest.resetModules();
    const mod = require('../src/lib/rateLimit');
    checkRateLimit = mod.checkRateLimit;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows calls up to the limit', () => {
    expect(checkRateLimit('ip-a', 3, 60000)).toEqual({ allowed: true });
    expect(checkRateLimit('ip-a', 3, 60000)).toEqual({ allowed: true });
    expect(checkRateLimit('ip-a', 3, 60000)).toEqual({ allowed: true });
  });

  it('denies the call that exceeds the limit with retryAfterSeconds', () => {
    checkRateLimit('ip-a', 2, 60000);
    checkRateLimit('ip-a', 2, 60000);
    const result = checkRateLimit('ip-a', 2, 60000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('tracks different keys independently', () => {
    checkRateLimit('ip-a', 1, 60000);
    expect(checkRateLimit('ip-a', 1, 60000).allowed).toBe(false);
    expect(checkRateLimit('ip-b', 1, 60000).allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-10T12:00:00Z'));
    checkRateLimit('ip-a', 1, 60000);
    expect(checkRateLimit('ip-a', 1, 60000).allowed).toBe(false);
    jest.advanceTimersByTime(60001);
    expect(checkRateLimit('ip-a', 1, 60000).allowed).toBe(true);
  });
});

describe('getIpKey', () => {
  let getIpKey: typeof import('../src/lib/rateLimit').getIpKey;

  beforeEach(() => {
    jest.resetModules();
    getIpKey = require('../src/lib/rateLimit').getIpKey;
  });

  function makeRequest(headers: Record<string, string>): Request {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
    } as unknown as Request;
  }

  it('returns first entry from x-forwarded-for', () => {
    expect(getIpKey(makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('trims whitespace', () => {
    expect(getIpKey(makeRequest({ 'x-forwarded-for': '  1.2.3.4  ' }))).toBe('1.2.3.4');
  });

  it('falls back to unknown when header missing', () => {
    expect(getIpKey(makeRequest({}))).toBe('unknown');
  });
});
