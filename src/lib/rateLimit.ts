// Sliding-window rate limiter (D-25, D-27)
// In-memory Map per Vercel instance (D-28 — per-instance memory accepted for private app)
// Mirrors the module-level singleton pattern from src/lib/prisma.ts.

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = buckets.get(key) ?? [];
  // Prune entries older than the window (D-25 sliding window)
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= limit) {
    const oldestInWindow = recent[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestInWindow + windowMs - now) / 1000)
    );
    buckets.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true };
}

export function getIpKey(request: Request): string {
  // Prefer x-real-ip: set by the Vercel proxy itself, not client-spoofable.
  // The left-most x-forwarded-for entry can be attacker-supplied on some stacks.
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? 'unknown';
}

// Route-scoped bucket key. Every handler MUST scope its bucket with a route
// prefix: a bare per-IP key is shared by ~20 endpoints with limits from 10 to
// 30, so browse-heavy GETs exhaust the bucket and block unrelated low-limit
// writes (e.g. POST /api/decks) with spurious 429s. The auth routes already
// followed this shape (`login:${ip}`) — this makes it uniform.
export function routeKey(request: Request, route: string): string {
  return `${route}:${getIpKey(request)}`;
}
