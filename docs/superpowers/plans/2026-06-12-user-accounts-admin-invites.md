# User Accounts & Admin Invites Implementation Plan (Issue #6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shared group-password auth with per-user accounts created only via admin invites, per spec `docs/superpowers/specs/2026-06-12-user-accounts-admin-invites-design.md`.

**Architecture:** Extend `User` with nullable auth columns and add an `Invite` model (single local SQLite migration). Sessions become a signed `v1.<userId>.<role>.<exp>.<sig>` payload in the existing httpOnly `session` cookie, verified DB-free in Edge middleware. Password hashing uses Node's built-in scrypt in Node API routes only. Bootstrap via env-gated legacy admin login (`ALLOW_LEGACY_LOGIN`).

**Tech Stack:** Next.js 16 (App Router, Edge middleware), Prisma 6 + libsql adapter (SQLite/Turso), zod 4, `node:crypto` scrypt, jest + ts-jest.

**HARD CONSTRAINTS (from operator):**
- Migrations run ONLY against local `file:` dev.db (`.env` `DATABASE_URL` already points there). NEVER touch prod Turso, prod Vercel env vars, or cron config.
- Never push/merge to `master`/`main`; all work stays on `feature/user-accounts`; merge to `develop` is the human's call.
- Full `npx jest` must be green before any task is declared complete.
- Commits: 4 planned commit points (user confirmed count before execution). No `git push` ever.

---

## Commit plan (4 commits)

1. `feat(auth): schema migration + auth core libs (session tokens, scrypt, policy, invites)` — Tasks 1–6
2. `feat(auth): per-user login, signup, invite APIs and role-gated middleware` — Tasks 7–10
3. `feat(auth): login, invite-redeem and admin invite UI` — Tasks 11–13
4. `docs(auth): transition guide + spec/plan docs; retire legacy auth helpers` — Tasks 14–15

---

### Task 1: Prisma schema — auth fields + Invite model + local migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_user_auth_and_invites/` (generated)

- [ ] **Step 1: Update `model User`** in `prisma/schema.prisma` (replace lines 11–20):

```prisma
model User {
  id                    String            @id @default(cuid())
  name                  String
  moxfieldCollectionId  String?           @unique
  lastUpdated           DateTime          @default(now())
  username              String?           @unique
  passwordHash          String?
  role                  String            @default("MEMBER")
  createdAt             DateTime          @default(now())
  collectionCards       CollectionCard[]
  syncLogs              SyncLog[]
  invitesCreated        Invite[]          @relation("InviteCreator")
  invitesTargeting      Invite[]          @relation("InviteTarget")

  @@map("users")
}
```

(`role` is a String because Prisma does not support enums on SQLite; app-level validation enforces `'ADMIN' | 'MEMBER'`.)

- [ ] **Step 2: Add `model Invite`** at the end of `prisma/schema.prisma`:

```prisma
model Invite {
  id                String    @id @default(cuid())
  tokenHash         String    @unique
  targetUserId      String?
  suggestedUsername String?
  role              String    @default("MEMBER")
  createdByUserId   String?
  usedAt            DateTime?
  expiresAt         DateTime
  createdAt         DateTime  @default(now())

  targetUser User? @relation("InviteTarget", fields: [targetUserId], references: [id], onDelete: Cascade)
  createdBy  User? @relation("InviteCreator", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@map("invites")
}
```

- [ ] **Step 3: Validate and generate the migration against LOCAL dev.db only**

Run: `npx prisma validate && npx prisma migrate dev --name add_user_auth_and_invites`
Expected: migration created under `prisma/migrations/`, applied to `prisma/dev.db`, client regenerated. Verify the migration SQL contains no `DROP TABLE users` data loss (SQLite table rebuild with `INSERT INTO ... SELECT` is fine and preserves rows).

- [ ] **Step 4: Confirm existing rows survive**

Run: `sqlite3 prisma/dev.db "SELECT count(*) FROM users; SELECT count(*) FROM invites;"`
Expected: users count unchanged from before; invites = 0.

- [ ] **Step 5: Run full suite to confirm nothing broke**

Run: `npx jest`
Expected: all existing tests PASS.

---

### Task 2: Session tokens in `src/lib/auth.ts`

**Files:**
- Modify: `src/lib/auth.ts` (add new functions; keep `signCookie`/`verifyHmac` until Task 14)
- Test: `tests/session-token.test.ts`

- [ ] **Step 1: Write the failing test** `tests/session-token.test.ts`:

```ts
process.env.COOKIE_SECRET = 'test-secret-for-session-tests-32char!'

import { createSessionToken, verifySessionToken, LEGACY_ADMIN_USER_ID } from '@/lib/auth'

describe('session tokens', () => {
  it('round-trips a MEMBER session', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER')
    const payload = await verifySessionToken(token)
    expect(payload).toEqual({ userId: 'user_abc123', role: 'MEMBER' })
  })

  it('round-trips an ADMIN session including the legacy sentinel', async () => {
    const token = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
    const payload = await verifySessionToken(token)
    expect(payload).toEqual({ userId: LEGACY_ADMIN_USER_ID, role: 'ADMIN' })
  })

  it('rejects an expired token', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER', -10)
    expect(await verifySessionToken(token)).toBeNull()
  })

  it('rejects a tampered role', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER')
    const tampered = token.replace('.MEMBER.', '.ADMIN.')
    expect(await verifySessionToken(tampered)).toBeNull()
  })

  it('rejects a tampered userId', async () => {
    const token = await createSessionToken('user_abc123', 'MEMBER')
    const tampered = token.replace('user_abc123', 'user_evil99')
    expect(await verifySessionToken(tampered)).toBeNull()
  })

  it('rejects malformed values', async () => {
    for (const bad of ['', 'v1', 'garbage', 'v2.a.MEMBER.123.abc', 'v1.a.OTHER.123.abc', 'v1.a.MEMBER.notanum.abc']) {
      expect(await verifySessionToken(bad)).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/session-token.test.ts`
Expected: FAIL — `createSessionToken` is not exported.

- [ ] **Step 3: Implement in `src/lib/auth.ts`** (append; keep existing exports):

```ts
export type SessionRole = 'ADMIN' | 'MEMBER'
export interface SessionPayload {
  userId: string
  role: SessionRole
}

// Sentinel for the env-gated legacy bootstrap login (no DB row backs it)
export const LEGACY_ADMIN_USER_ID = '__legacy_admin__'

// Token format: v1.<userId>.<role>.<expUnixSeconds>.<hexHmac>
// userId is a cuid / sentinel (no dots), so '.' is a safe delimiter.
export async function createSessionToken(
  userId: string,
  role: SessionRole,
  maxAgeSeconds: number = COOKIE_OPTIONS.maxAge
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds
  const base = `v1.${userId}.${role}.${exp}`
  const key = await getKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base))
  return `${base}.${bytesToHex(sig)}`
}

export async function verifySessionToken(value: string): Promise<SessionPayload | null> {
  try {
    const parts = value.split('.')
    if (parts.length !== 5 || parts[0] !== 'v1') return null
    const [, userId, role, expStr, sig] = parts
    if (!userId || (role !== 'ADMIN' && role !== 'MEMBER')) return null
    if (!/^\d+$/.test(expStr)) return null
    if (parseInt(expStr, 10) * 1000 < Date.now()) return null
    const base = `v1.${userId}.${role}.${expStr}`
    const key = await getKey()
    const ok = await crypto.subtle.verify('HMAC', key, hexToBytes(sig), new TextEncoder().encode(base))
    return ok ? { userId, role } : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/session-token.test.ts`
Expected: PASS (6 tests).

---

### Task 3: Password hashing `src/lib/password.ts` (Node-only)

**Files:**
- Create: `src/lib/password.ts`
- Test: `tests/password.test.ts`

- [ ] **Step 1: Write the failing test** `tests/password.test.ts`:

```ts
import { hashPassword, verifyPassword } from '@/lib/password'

describe('scrypt password hashing', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword('correct horse 7 battery')
    expect(await verifyPassword('correct horse 7 battery', stored)).toBe(true)
  })

  it('stores self-describing scrypt format, never plaintext', async () => {
    const stored = await hashPassword('hunter2hunter2')
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
    expect(stored).not.toContain('hunter2')
  })

  it('produces unique salts per hash', async () => {
    const a = await hashPassword('same-password-1')
    const b = await hashPassword('same-password-1')
    expect(a).not.toEqual(b)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('rightpassword1')
    expect(await verifyPassword('wrongpassword1', stored)).toBe(false)
  })

  it('rejects malformed stored values without throwing', async () => {
    for (const bad of ['', 'plaintext', 'bcrypt$x$y', 'scrypt$16384$8$1$zz$zz', 'scrypt$0$8$1$aa$bb']) {
      expect(await verifyPassword('whatever1', bad)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/password.test.ts`
Expected: FAIL — cannot find module `@/lib/password`.

- [ ] **Step 3: Implement `src/lib/password.ts`**:

```ts
// scrypt password hashing — Node runtime ONLY (API routes / scripts).
// Never import from middleware/Edge code; crypto.scrypt does not exist there.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>

const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

// Stored format: scrypt$N$r$p$<saltHex>$<hashHex>
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const n = parseInt(parts[1], 10)
    const r = parseInt(parts[2], 10)
    const p = parseInt(parts[3], 10)
    const salt = Buffer.from(parts[4], 'hex')
    const expected = Buffer.from(parts[5], 'hex')
    if (!n || !r || !p || salt.length === 0 || expected.length === 0) return false
    const actual = await scrypt(password, salt, expected.length, { N: n, r, p })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/password.test.ts`
Expected: PASS (5 tests).

---

### Task 4: Password policy + username schema `src/lib/authValidators.ts`

**Files:**
- Create: `src/lib/authValidators.ts`
- Test: `tests/password-policy.test.ts`

- [ ] **Step 1: Write the failing test** `tests/password-policy.test.ts`:

```ts
import { validatePassword, usernameSchema } from '@/lib/authValidators'

describe('validatePassword', () => {
  it('accepts a compliant password', () => {
    expect(validatePassword('blueDragon42')).toEqual({ ok: true })
  })

  it('rejects fewer than 8 chars', () => {
    const r = validatePassword('abc123')
    expect(r.ok).toBe(false)
  })

  it('rejects more than 128 chars', () => {
    expect(validatePassword('a1' + 'x'.repeat(130)).ok).toBe(false)
  })

  it('rejects passwords without a letter', () => {
    expect(validatePassword('12345678!').ok).toBe(false)
  })

  it('rejects passwords without a digit', () => {
    expect(validatePassword('justletters!').ok).toBe(false)
  })

  it('rejects common passwords (case-insensitive)', () => {
    expect(validatePassword('Password1').ok).toBe(false)
    expect(validatePassword('qwerty123').ok).toBe(false)
  })

  it('rejects password equal to username (case-insensitive)', () => {
    expect(validatePassword('Amirali99', 'amirali99').ok).toBe(false)
  })

  it('returns a human-readable message on failure', () => {
    const r = validatePassword('short1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(typeof r.message).toBe('string')
  })
})

describe('usernameSchema', () => {
  it('accepts and lowercases valid usernames', () => {
    expect(usernameSchema.parse('  Some_User-1 ')).toBe('some_user-1')
  })

  it('rejects invalid charset, too-short and too-long', () => {
    for (const bad of ['ab', 'has space', 'emoji😀', 'x'.repeat(33), 'semi;colon']) {
      expect(usernameSchema.safeParse(bad).success).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/password-policy.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/authValidators.ts`**:

```ts
import { z } from 'zod'

// Policy (confirmed 2026-06-12): min 8, ≥1 letter, ≥1 digit, ≤128,
// not a common password, not equal to the username.
const COMMON_PASSWORDS = new Set([
  'password1', 'password123', 'p@ssw0rd', 'passw0rd', 'password2024', 'password2025',
  'qwerty123', 'qwerty1234', 'q1w2e3r4', '1q2w3e4r', 'qwe123qwe',
  'abc12345', 'abcd1234', 'a1b2c3d4', '12345678a', '123456789a',
  'iloveyou1', 'welcome1', 'welcome123', 'admin123', 'letmein1',
  'monkey123', 'dragon123', 'master123', 'shadow123', 'superman1',
  'batman123', 'trustno1', 'sunshine1', 'princess1', 'football1',
  'baseball1', 'soccer123', 'hockey123', 'jordan23x', 'michael1',
  'charlie1', 'jessica1', 'daniel123', 'mustang1', 'access123',
  'hello123', 'freedom1', 'whatever1', 'ninja123', 'azerty123',
  'zaq12wsx', '1qaz2wsx', 'qazwsx123', 'pass1234', 'test1234',
  'magic1234', 'tabletally1', 'mtg12345', 'commander1',
])

export type PasswordCheck = { ok: true } | { ok: false; message: string }

export function validatePassword(password: string, username?: string): PasswordCheck {
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters' }
  if (password.length > 128) return { ok: false, message: 'Password must be at most 128 characters' }
  if (!/[a-zA-Z]/.test(password)) return { ok: false, message: 'Password must contain at least one letter' }
  if (!/[0-9]/.test(password)) return { ok: false, message: 'Password must contain at least one number' }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: 'That password is too common — pick something less guessable' }
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return { ok: false, message: 'Password must not be the same as your username' }
  }
  return { ok: true }
}

// Stored lowercase; login lowercases input before lookup.
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, underscore and hyphen')
  .transform((v) => v.toLowerCase())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/password-policy.test.ts`
Expected: PASS (10 tests).

---

### Task 5: Invite helpers `src/lib/invites.ts`

**Files:**
- Create: `src/lib/invites.ts`
- Test: `tests/invites.test.ts`

- [ ] **Step 1: Write the failing test** `tests/invites.test.ts`:

```ts
import {
  generateInviteToken,
  hashInviteToken,
  inviteStatus,
  usernameFromName,
  DEFAULT_INVITE_EXPIRY_DAYS,
} from '@/lib/invites'

describe('invite tokens', () => {
  it('generates a base64url token with matching sha256 hash', () => {
    const { token, tokenHash } = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes base64url
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken(token)).toBe(tokenHash)
  })

  it('generates unique tokens', () => {
    expect(generateInviteToken().token).not.toEqual(generateInviteToken().token)
  })
})

describe('inviteStatus', () => {
  const future = new Date(Date.now() + 86_400_000)
  const past = new Date(Date.now() - 86_400_000)

  it('pending when unused and unexpired', () => {
    expect(inviteStatus({ usedAt: null, expiresAt: future })).toBe('pending')
  })

  it('used wins over expiry', () => {
    expect(inviteStatus({ usedAt: past, expiresAt: past })).toBe('used')
  })

  it('expired when past expiresAt', () => {
    expect(inviteStatus({ usedAt: null, expiresAt: past })).toBe('expired')
  })
})

describe('usernameFromName', () => {
  it('slugifies display names to valid usernames', () => {
    expect(usernameFromName('Amirali T')).toBe('amirali-t')
    expect(usernameFromName('  Bob!! ')).toBe('bob')
    expect(usernameFromName('mr_under-score')).toBe('mr_under-score')
  })
})

describe('DEFAULT_INVITE_EXPIRY_DAYS', () => {
  it('is 7', () => expect(DEFAULT_INVITE_EXPIRY_DAYS).toBe(7))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/invites.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/invites.ts`**:

```ts
// Invite token helpers — Node runtime only (uses node:crypto).
import { randomBytes, createHash } from 'node:crypto'

export const DEFAULT_INVITE_EXPIRY_DAYS = 7
export const MAX_INVITE_EXPIRY_DAYS = 30

// Raw token goes in the link (shown once); only its sha256 is stored.
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type InviteStatus = 'pending' | 'used' | 'expired'

export function inviteStatus(
  invite: { usedAt: Date | null; expiresAt: Date },
  now: Date = new Date()
): InviteStatus {
  if (invite.usedAt) return 'used'
  if (invite.expiresAt < now) return 'expired'
  return 'pending'
}

// Bound invites lock the username to the collection user's display name,
// slugified to the username charset (lowercase [a-z0-9_-]).
export function usernameFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/invites.test.ts`
Expected: PASS (7 tests).

---

### Task 6: `getSession()` helper for Node routes `src/lib/session.ts`

**Files:**
- Create: `src/lib/session.ts`
- Test: `tests/session-helper.test.ts`

- [ ] **Step 1: Write the failing test** `tests/session-helper.test.ts`:

```ts
process.env.COOKIE_SECRET = 'test-secret-for-sess-helper-32chars!!'

let cookieValue: string | undefined
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockImplementation(async () => ({
    get: (name: string) =>
      name === 'session' && cookieValue !== undefined ? { name, value: cookieValue } : undefined,
  })),
}))

import { getSession } from '@/lib/session'
import { createSessionToken, LEGACY_ADMIN_USER_ID } from '@/lib/auth'

describe('getSession', () => {
  it('returns payload with isLegacyAdmin=false for a real user', async () => {
    cookieValue = await createSessionToken('user_1', 'MEMBER')
    expect(await getSession()).toEqual({ userId: 'user_1', role: 'MEMBER', isLegacyAdmin: false })
  })

  it('flags the legacy admin sentinel', async () => {
    cookieValue = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
    expect(await getSession()).toEqual({ userId: LEGACY_ADMIN_USER_ID, role: 'ADMIN', isLegacyAdmin: true })
  })

  it('returns null when cookie missing or invalid', async () => {
    cookieValue = undefined
    expect(await getSession()).toBeNull()
    cookieValue = 'garbage'
    expect(await getSession()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/session-helper.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/lib/session.ts`**:

```ts
// Reads the current session in Node API routes (server-side, via next/headers).
// Middleware already gates routes; use this for role re-checks and createdBy attribution.
import { cookies } from 'next/headers'
import { COOKIE_NAMES, verifySessionToken, LEGACY_ADMIN_USER_ID, type SessionRole } from '@/lib/auth'

export interface CurrentSession {
  userId: string
  role: SessionRole
  isLegacyAdmin: boolean
}

export async function getSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies() // MUST await in Next.js 16
  const cookie = cookieStore.get(COOKIE_NAMES.session)
  if (!cookie) return null
  const payload = await verifySessionToken(cookie.value)
  if (!payload) return null
  return { ...payload, isLegacyAdmin: payload.userId === LEGACY_ADMIN_USER_ID }
}
```

- [ ] **Step 4: Run test to verify it passes, then commit (Commit 1)**

Run: `npx jest` (full suite)
Expected: PASS.

```bash
git add prisma/schema.prisma prisma/migrations src/lib/auth.ts src/lib/password.ts src/lib/authValidators.ts src/lib/invites.ts src/lib/session.ts tests/session-token.test.ts tests/password.test.ts tests/password-policy.test.ts tests/invites.test.ts tests/session-helper.test.ts
git commit -m "feat(auth): schema migration + auth core libs (session tokens, scrypt, policy, invites)"
```

---

### Task 7: Middleware role gating (`proxy.ts`)

**Files:**
- Modify: `proxy.ts`
- Test: `tests/proxy.test.ts` (rewrite)

- [ ] **Step 1: Rewrite `tests/proxy.test.ts`** (replace file contents):

```ts
process.env.COOKIE_SECRET = 'test-secret-for-proxy-tests-32chars!!'

import { createSessionToken, COOKIE_NAMES } from '@/lib/auth'

const mockRedirect = jest.fn((url: URL) => ({ type: 'redirect', url: url.toString(), status: 307 }))
const mockNext = jest.fn(() => ({ type: 'next' }))

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => mockRedirect(url),
    next: () => mockNext(),
  },
}))

import { proxy } from '../proxy'

function makeMockRequest(pathname: string, cookies: Record<string, string> = {}): any {
  return {
    nextUrl: { pathname },
    url: `http://localhost${pathname}`,
    cookies: {
      get: (name: string) => {
        const value = cookies[name]
        return value !== undefined ? { name, value } : undefined
      },
    },
  }
}

describe('proxy route protection (per-user sessions)', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    mockNext.mockClear()
  })

  it('redirects unauthenticated request to /login', async () => {
    await proxy(makeMockRequest('/'))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    expect(mockRedirect.mock.calls[0][0].pathname).toBe('/login')
  })

  it('allows a valid MEMBER session through to app routes', async () => {
    const token = await createSessionToken('user_1', 'MEMBER')
    await proxy(makeMockRequest('/checkDeck', { [COOKIE_NAMES.session]: token }))
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('rejects an expired session', async () => {
    const token = await createSessionToken('user_1', 'MEMBER', -10)
    await proxy(makeMockRequest('/', { [COOKIE_NAMES.session]: token }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
  })

  it('blocks MEMBER from /admin with admin-required message', async () => {
    const token = await createSessionToken('user_1', 'MEMBER')
    await proxy(makeMockRequest('/admin', { [COOKIE_NAMES.session]: token }))
    const url: URL = mockRedirect.mock.calls[0][0]
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('message')).toBe('admin-required')
  })

  it('blocks MEMBER from /api/admin routes', async () => {
    const token = await createSessionToken('user_1', 'MEMBER')
    await proxy(makeMockRequest('/api/admin/users', { [COOKIE_NAMES.session]: token }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
  })

  it('allows ADMIN through to /admin', async () => {
    const token = await createSessionToken('user_admin', 'ADMIN')
    await proxy(makeMockRequest('/admin', { [COOKIE_NAMES.session]: token }))
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('skips exempt paths without a session', async () => {
    for (const path of ['/login', '/api/auth/login', '/api/auth/signup', '/invite/some-token', '/api/invites/some-token', '/api/cron/sync-collections']) {
      mockNext.mockClear()
      mockRedirect.mockClear()
      await proxy(makeMockRequest(path))
      expect(mockNext).toHaveBeenCalledTimes(1)
      expect(mockRedirect).not.toHaveBeenCalled()
    }
  })

  it('ignores legacy signCookie-style cookie values', async () => {
    await proxy(makeMockRequest('/', { [COOKIE_NAMES.session]: 'aabbcc112233' }))
    expect(mockRedirect).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/proxy.test.ts`
Expected: FAIL (proxy still verifies old HMAC cookie; admin gating uses admin_session).

- [ ] **Step 3: Rewrite `proxy.ts`**:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken, COOKIE_NAMES } from '@/lib/auth'

const ADMIN_PATHS = ['/admin', '/api/admin']
// Reachable without a session: login, auth APIs, invite redemption, cron (Bearer-token auth at route level)
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/invite', '/api/invites', '/api/cron']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get(COOKIE_NAMES.session)
  const session = sessionCookie ? await verifySessionToken(sessionCookie.value) : null

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p))
  if (isAdminPath && session.role !== 'ADMIN') {
    const url = new URL('/login', request.url)
    url.searchParams.set('message', 'admin-required')
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/proxy.test.ts`
Expected: PASS (9 tests).

---

### Task 8: Login route (username+password, legacy gate) + logout

**Files:**
- Modify: `src/app/api/auth/login/route.ts` (rewrite)
- Modify: `src/app/api/auth/logout/route.ts` (comment only — behavior unchanged)
- Test: `tests/auth-login.test.ts` (rewrite); `tests/auth-logout.test.ts` unchanged

- [ ] **Step 1: Rewrite `tests/auth-login.test.ts`** (replace file contents):

```ts
process.env.COOKIE_SECRET = 'test-secret-for-login-tests-32chars!!'
process.env.ADMIN_PASSWORD = 'test-admin-password-stronger'

const mockCookieSet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ set: mockCookieSet }),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

const mockFindUnique = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: any[]) => mockFindUnique(...args) } },
}))

import { POST } from '../src/app/api/auth/login/route'
import { verifySessionToken, LEGACY_ADMIN_USER_ID } from '@/lib/auth'
import { hashPassword } from '@/lib/password'

let ipCounter = 0
function makeRequest(body: Record<string, unknown>): Request {
  // unique IP per call so the rate limiter never interferes across tests
  ipCounter += 1
  return {
    json: async () => body,
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.0.0.${ipCounter}` : null) },
  } as unknown as Request
}

describe('login route (per-user)', () => {
  beforeEach(() => {
    mockCookieSet.mockClear()
    mockFindUnique.mockReset()
    delete process.env.ALLOW_LEGACY_LOGIN
  })

  it('logs in a valid user and sets a session token bound to userId+role', async () => {
    const passwordHash = await hashPassword('goodpass1')
    mockFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', passwordHash, role: 'MEMBER' })
    const result = await POST(makeRequest({ username: 'Alice', password: 'goodpass1' }))
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { username: 'alice' } })
    expect((result as any).body).toEqual({ success: true, redirect: '/' })
    const [name, value] = mockCookieSet.mock.calls[0]
    expect(name).toBe('session')
    expect(await verifySessionToken(value)).toEqual({ userId: 'user_1', role: 'MEMBER' })
  })

  it('redirects ADMIN users to /admin', async () => {
    const passwordHash = await hashPassword('goodpass1')
    mockFindUnique.mockResolvedValue({ id: 'user_a', username: 'boss', passwordHash, role: 'ADMIN' })
    const result = await POST(makeRequest({ username: 'boss', password: 'goodpass1' }))
    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
  })

  it('returns generic 401 for unknown user and for wrong password', async () => {
    mockFindUnique.mockResolvedValue(null)
    const r1 = await POST(makeRequest({ username: 'ghost', password: 'whatever1' }))
    expect((r1 as any).status).toBe(401)

    const passwordHash = await hashPassword('rightpass1')
    mockFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', passwordHash, role: 'MEMBER' })
    const r2 = await POST(makeRequest({ username: 'alice', password: 'wrongpass1' }))
    expect((r2 as any).status).toBe(401)
    expect((r1 as any).body).toEqual((r2 as any).body)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects a user row without credentials (collection-only user)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'user_1', username: 'alice', passwordHash: null, role: 'MEMBER' })
    const result = await POST(makeRequest({ username: 'alice', password: 'whatever1' }))
    expect((result as any).status).toBe(401)
  })

  it('legacy admin login works only while ALLOW_LEGACY_LOGIN=true', async () => {
    process.env.ALLOW_LEGACY_LOGIN = 'true'
    const result = await POST(makeRequest({ password: 'test-admin-password-stronger' }))
    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
    const [, value] = mockCookieSet.mock.calls[0]
    expect(await verifySessionToken(value)).toEqual({ userId: LEGACY_ADMIN_USER_ID, role: 'ADMIN' })
  })

  it('legacy admin login is rejected when the flag is off', async () => {
    const result = await POST(makeRequest({ password: 'test-admin-password-stronger' }))
    expect((result as any).status).toBe(401)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies with 400', async () => {
    const result = await POST(makeRequest({ username: 42 }))
    expect((result as any).status).toBe(400)
  })

  it('rate-limits repeated attempts from one IP', async () => {
    mockFindUnique.mockResolvedValue(null)
    const fixedIpRequest = () =>
      ({
        json: async () => ({ username: 'ghost', password: 'whatever1' }),
        headers: { get: (n: string) => (n === 'x-forwarded-for' ? '10.9.9.9' : null) },
      }) as unknown as Request
    let last: any
    for (let i = 0; i < 11; i++) last = await POST(fixedIpRequest())
    expect(last.status).toBe(429)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/auth-login.test.ts`
Expected: FAIL (route still implements shared-password logic).

- [ ] **Step 3: Rewrite `src/app/api/auth/login/route.ts`**:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSessionToken, COOKIE_OPTIONS, COOKIE_NAMES, LEGACY_ADMIN_USER_ID } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { checkRateLimit, getIpKey } from '@/lib/rateLimit'

const loginSchema = z.object({
  username: z.string().trim().max(32).optional(),
  password: z.string().min(1).max(128),
})

const INVALID = { error: 'Invalid username or password' }

export async function POST(request: Request) {
  const rate = checkRateLimit(`login:${getIpKey(request)}`, 10, 60_000)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts — try again shortly' },
      { status: 429 }
    )
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { username, password } = parsed.data
  const cookieStore = await cookies() // MUST await in Next.js 16

  // Legacy bootstrap: no username + admin password, only while ALLOW_LEGACY_LOGIN=true.
  // Lets the admin self-assign an account before any credentials exist; see DEPLOYMENT.md.
  if (!username) {
    if (
      process.env.ALLOW_LEGACY_LOGIN === 'true' &&
      process.env.ADMIN_PASSWORD &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = await createSessionToken(LEGACY_ADMIN_USER_ID, 'ADMIN')
      cookieStore.set(COOKIE_NAMES.session, token, COOKIE_OPTIONS)
      return NextResponse.json({ success: true, redirect: '/admin' })
    }
    return NextResponse.json(INVALID, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } })
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    // Single generic 401 — do not reveal whether the username exists
    return NextResponse.json(INVALID, { status: 401 })
  }

  const role = user.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'
  const token = await createSessionToken(user.id, role)
  cookieStore.set(COOKIE_NAMES.session, token, COOKIE_OPTIONS)
  return NextResponse.json({ success: true, redirect: role === 'ADMIN' ? '/admin' : '/' })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/auth-login.test.ts tests/auth-logout.test.ts`
Expected: PASS. (Logout already clears both cookie names; clearing the now-unused `admin_session` is deliberate migration hygiene — leave `route.ts` as is.)

---

### Task 9: Signup route + invite preflight route

**Files:**
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/app/api/invites/[token]/route.ts`
- Test: `tests/auth-signup.test.ts`

- [ ] **Step 1: Write the failing test** `tests/auth-signup.test.ts`:

```ts
process.env.COOKIE_SECRET = 'test-secret-for-signup-tests-32chars!'

const mockCookieSet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ set: mockCookieSet }),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
  NextRequest: jest.fn(),
}))

const mockInviteFindUnique = jest.fn()
const mockInviteUpdateMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockUserFindFirst = jest.fn()
const mockUserUpdate = jest.fn()
const mockUserCreate = jest.fn()

const tx = {
  invite: { updateMany: (...a: any[]) => mockInviteUpdateMany(...a) },
  user: {
    findUnique: (...a: any[]) => mockUserFindUnique(...a),
    update: (...a: any[]) => mockUserUpdate(...a),
    create: (...a: any[]) => mockUserCreate(...a),
  },
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    invite: { findUnique: (...a: any[]) => mockInviteFindUnique(...a) },
    user: { findFirst: (...a: any[]) => mockUserFindFirst(...a) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  },
}))

import { POST } from '../src/app/api/auth/signup/route'
import { GET } from '../src/app/api/invites/[token]/route'
import { generateInviteToken } from '@/lib/invites'
import { verifySessionToken } from '@/lib/auth'

let ipCounter = 0
function makeRequest(body: Record<string, unknown>): any {
  ipCounter += 1
  return {
    json: async () => body,
    headers: { get: (n: string) => (n === 'x-forwarded-for' ? `10.1.0.${ipCounter}` : null) },
  }
}

const future = new Date(Date.now() + 86_400_000)

function baseInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    targetUserId: null,
    suggestedUsername: null,
    role: 'MEMBER',
    usedAt: null,
    expiresAt: future,
    ...overrides,
  }
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockInviteUpdateMany.mockResolvedValue({ count: 1 })
    mockUserFindFirst.mockResolvedValue(null)
  })

  it('redeems an open invite: creates user, marks invite used, auto-logs-in', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockUserCreate.mockResolvedValue({ id: 'user_new', role: 'MEMBER' })

    const result = await POST(makeRequest({ token, username: 'NewUser', password: 'decent-pw1' }))

    expect((result as any).body).toEqual({ success: true, redirect: '/' })
    expect(mockInviteUpdateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    })
    const createArgs = mockUserCreate.mock.calls[0][0]
    expect(createArgs.data.username).toBe('newuser')
    expect(createArgs.data.passwordHash).toMatch(/^scrypt\$/)
    expect(createArgs.data.role).toBe('MEMBER')
    const [name, value] = mockCookieSet.mock.calls[0]
    expect(name).toBe('session')
    expect(await verifySessionToken(value)).toEqual({ userId: 'user_new', role: 'MEMBER' })
  })

  it('redeems a bound invite onto the existing user row with locked username', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(
      baseInvite({ targetUserId: 'user_amir', suggestedUsername: 'amirali', role: 'ADMIN' })
    )
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', username: null })
    mockUserUpdate.mockResolvedValue({ id: 'user_amir', role: 'ADMIN' })

    const result = await POST(makeRequest({ token, username: 'ignored-input', password: 'decent-pw1' }))

    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
    const updateArgs = mockUserUpdate.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 'user_amir' })
    expect(updateArgs.data.username).toBe('amirali')
    expect(updateArgs.data.role).toBe('ADMIN')
  })

  it('rejects unknown, used and expired invites with 400', async () => {
    const { token } = generateInviteToken()
    for (const invite of [
      null,
      baseInvite({ usedAt: new Date() }),
      baseInvite({ expiresAt: new Date(Date.now() - 1000) }),
    ]) {
      mockInviteFindUnique.mockResolvedValue(invite)
      const result = await POST(makeRequest({ token, username: 'whoever', password: 'decent-pw1' }))
      expect((result as any).status).toBe(400)
    }
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('rejects policy-violating passwords with 400 and a message', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    const result = await POST(makeRequest({ token, username: 'newuser', password: 'short' }))
    expect((result as any).status).toBe(400)
    expect((result as any).body.error).toContain('8 characters')
  })

  it('rejects a taken username with 409', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockUserFindFirst.mockResolvedValue({ id: 'user_other' })
    const result = await POST(makeRequest({ token, username: 'taken', password: 'decent-pw1' }))
    expect((result as any).status).toBe(409)
  })

  it('returns 409 when the invite was claimed concurrently (single-use race)', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    mockInviteUpdateMany.mockResolvedValue({ count: 0 })
    const result = await POST(makeRequest({ token, username: 'newuser', password: 'decent-pw1' }))
    expect((result as any).status).toBe(409)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('rejects a bound invite whose target already has credentials', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite({ targetUserId: 'user_amir', suggestedUsername: 'amirali' }))
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', username: 'amirali' })
    const result = await POST(makeRequest({ token, password: 'decent-pw1' }))
    expect((result as any).status).toBe(400)
  })
})

describe('GET /api/invites/[token]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns valid + locked username for a pending bound invite', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite({ targetUserId: 'u1', suggestedUsername: 'amirali' }))
    const result = await GET({} as any, { params: Promise.resolve({ token }) })
    expect((result as any).body).toEqual({ valid: true, username: 'amirali', locked: true })
  })

  it('returns valid + unlocked for a pending open invite', async () => {
    const { token } = generateInviteToken()
    mockInviteFindUnique.mockResolvedValue(baseInvite())
    const result = await GET({} as any, { params: Promise.resolve({ token }) })
    expect((result as any).body).toEqual({ valid: true, username: null, locked: false })
  })

  it('returns valid:false for unknown/used/expired invites', async () => {
    const { token } = generateInviteToken()
    for (const invite of [null, baseInvite({ usedAt: new Date() }), baseInvite({ expiresAt: new Date(0) })]) {
      mockInviteFindUnique.mockResolvedValue(invite)
      const result = await GET({} as any, { params: Promise.resolve({ token }) })
      expect((result as any).body).toEqual({ valid: false })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/auth-signup.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `src/app/api/invites/[token]/route.ts`**:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashInviteToken, inviteStatus } from '@/lib/invites'

// Public preflight for the redeem page: never reveals more than validity + locked username.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } })
  if (!invite || inviteStatus(invite) !== 'pending') {
    return NextResponse.json({ valid: false })
  }
  return NextResponse.json({
    valid: true,
    username: invite.suggestedUsername ?? null,
    locked: invite.targetUserId !== null,
  })
}
```

- [ ] **Step 4: Implement `src/app/api/auth/signup/route.ts`**:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSessionToken, COOKIE_OPTIONS, COOKIE_NAMES } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { validatePassword, usernameSchema } from '@/lib/authValidators'
import { hashInviteToken, inviteStatus } from '@/lib/invites'
import { checkRateLimit, getIpKey } from '@/lib/rateLimit'

const signupSchema = z.object({
  token: z.string().min(1).max(128),
  username: z.string().max(64).optional(),
  password: z.string().min(1).max(128),
})

export async function POST(request: Request) {
  const rate = checkRateLimit(`signup:${getIpKey(request)}`, 5, 60_000)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many attempts — try again shortly' }, { status: 429 })
  }

  const parsed = signupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { token, password } = parsed.data

  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } })
  if (!invite || inviteStatus(invite) !== 'pending') {
    return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
  }

  // Bound invites lock the username; open invites take it from the form.
  let username: string
  if (invite.targetUserId) {
    username = invite.suggestedUsername ?? ''
    if (!username) {
      return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
    }
  } else {
    const result = usernameSchema.safeParse(parsed.data.username ?? '')
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
    }
    username = result.data
  }

  const policy = validatePassword(password, username)
  if (!policy.ok) {
    return NextResponse.json({ error: policy.message }, { status: 400 })
  }

  // Username collision (excluding the invite's own target row)
  const existing = await prisma.user.findFirst({
    where: { username, ...(invite.targetUserId ? { NOT: { id: invite.targetUserId } } : {}) },
  })
  if (existing) {
    return NextResponse.json({ error: 'That username is already taken' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)
  const role = invite.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Atomic single-use claim: only one redeemer can flip usedAt from null
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (claimed.count !== 1) throw new Error('INVITE_ALREADY_USED')

      if (invite.targetUserId) {
        const target = await tx.user.findUnique({ where: { id: invite.targetUserId } })
        if (!target || target.username) throw new Error('INVITE_TARGET_INVALID')
        return tx.user.update({
          where: { id: invite.targetUserId },
          data: { username, passwordHash, role },
        })
      }
      return tx.user.create({
        data: { name: username, username, passwordHash, role },
      })
    })

    const sessionToken = await createSessionToken(user.id, role)
    const cookieStore = await cookies() // MUST await in Next.js 16
    cookieStore.set(COOKIE_NAMES.session, sessionToken, COOKIE_OPTIONS)
    return NextResponse.json({ success: true, redirect: role === 'ADMIN' ? '/admin' : '/' })
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_ALREADY_USED') {
      return NextResponse.json({ error: 'This invite was already used' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'INVITE_TARGET_INVALID') {
      return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
    }
    console.error('Signup failed:', error)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
```

Note: the bound-target recheck (`INVITE_TARGET_INVALID`) lives INSIDE the transaction; the test mocks `tx.user.findUnique`. The route file order matters: validate cheap things first, hash only after validation.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/auth-signup.test.ts`
Expected: PASS (12 tests).

---

### Task 10: Admin invite APIs

**Files:**
- Create: `src/app/api/admin/invites/route.ts` (GET list, POST create)
- Create: `src/app/api/admin/invites/[id]/route.ts` (DELETE revoke)
- Modify: `src/app/api/admin/users/route.ts:6-9` (add `username`, `role` to the GET select)
- Test: `tests/admin-invites.test.ts`; update `tests/admin-users.test.ts:54-57` select assertion

- [ ] **Step 1: Write the failing test** `tests/admin-invites.test.ts`:

```ts
process.env.COOKIE_SECRET = 'test-secret-for-adm-inv-tests-32char!'

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
  NextRequest: jest.fn(),
}))

const mockSession = { userId: 'user_admin', role: 'ADMIN', isLegacyAdmin: false }
jest.mock('@/lib/session', () => ({
  getSession: jest.fn(async () => mockGetSession()),
}))
const mockGetSession = jest.fn(() => mockSession as any)

const mockInviteFindMany = jest.fn()
const mockInviteCreate = jest.fn()
const mockInviteDelete = jest.fn()
const mockInviteFindUnique = jest.fn()
const mockUserFindUnique = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    invite: {
      findMany: (...a: any[]) => mockInviteFindMany(...a),
      create: (...a: any[]) => mockInviteCreate(...a),
      delete: (...a: any[]) => mockInviteDelete(...a),
      findUnique: (...a: any[]) => mockInviteFindUnique(...a),
    },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
  },
}))

import { GET, POST } from '@/app/api/admin/invites/route'
import { DELETE } from '@/app/api/admin/invites/[id]/route'
import { hashInviteToken } from '@/lib/invites'

function makeRequest(body?: object): any {
  return {
    json: async () => body,
    nextUrl: { origin: 'https://tabletally.example' },
  }
}

describe('POST /api/admin/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockReturnValue(mockSession as any)
  })

  it('creates an open invite and returns the one-time URL', async () => {
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_1', ...data }))
    const result = await POST(makeRequest({ type: 'open' }))
    expect((result as any).status).toBe(201)
    const { url, invite } = (result as any).body
    const token = url.split('/invite/')[1]
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.startsWith('https://tabletally.example/invite/')).toBe(true)
    // stored hash matches the raw token in the returned URL
    expect(mockInviteCreate.mock.calls[0][0].data.tokenHash).toBe(hashInviteToken(token))
    expect(mockInviteCreate.mock.calls[0][0].data.createdByUserId).toBe('user_admin')
    expect(invite.tokenHash).toBeUndefined() // never echo the hash
  })

  it('creates a bound invite with slugified locked username and chosen role', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', name: 'Amirali T', username: null })
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_2', ...data }))
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'user_amir', role: 'ADMIN' }))
    expect((result as any).status).toBe(201)
    const data = mockInviteCreate.mock.calls[0][0].data
    expect(data.targetUserId).toBe('user_amir')
    expect(data.suggestedUsername).toBe('amirali-t')
    expect(data.role).toBe('ADMIN')
  })

  it('rejects bound invites for users that already have credentials', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user_amir', name: 'Amirali', username: 'amirali' })
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'user_amir' }))
    expect((result as any).status).toBe(409)
  })

  it('rejects bound invites for unknown users', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const result = await POST(makeRequest({ type: 'bound', targetUserId: 'nope' }))
    expect((result as any).status).toBe(404)
  })

  it('stores null createdByUserId for the legacy bootstrap admin', async () => {
    mockGetSession.mockReturnValue({ userId: '__legacy_admin__', role: 'ADMIN', isLegacyAdmin: true } as any)
    mockInviteCreate.mockImplementation(async ({ data }: any) => ({ id: 'inv_3', ...data }))
    await POST(makeRequest({ type: 'open' }))
    expect(mockInviteCreate.mock.calls[0][0].data.createdByUserId).toBeNull()
  })

  it('rejects invalid bodies and non-admin sessions', async () => {
    const bad = await POST(makeRequest({ type: 'nonsense' }))
    expect((bad as any).status).toBe(400)
    mockGetSession.mockReturnValue(null as any)
    const noSession = await POST(makeRequest({ type: 'open' }))
    expect((noSession as any).status).toBe(401)
  })
})

describe('GET /api/admin/invites', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockReturnValue(mockSession as any)
  })

  it('lists invites with computed status, newest first, no token hashes', async () => {
    const future = new Date(Date.now() + 86_400_000)
    mockInviteFindMany.mockResolvedValue([
      {
        id: 'inv_1', tokenHash: 'secret', targetUserId: null, suggestedUsername: null,
        role: 'MEMBER', createdByUserId: 'user_admin', usedAt: null, expiresAt: future,
        createdAt: new Date(), targetUser: null,
      },
    ])
    const result = await GET()
    expect((result as any).status).toBe(200)
    const [row] = (result as any).body
    expect(row.status).toBe('pending')
    expect(row.tokenHash).toBeUndefined()
  })
})

describe('DELETE /api/admin/invites/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockReturnValue(mockSession as any)
  })

  it('revokes an unused invite', async () => {
    mockInviteFindUnique.mockResolvedValue({ id: 'inv_1', usedAt: null })
    mockInviteDelete.mockResolvedValue({})
    const result = await DELETE({} as any, { params: Promise.resolve({ id: 'inv_1' }) })
    expect((result as any).status).toBe(200)
    expect(mockInviteDelete).toHaveBeenCalledWith({ where: { id: 'inv_1' } })
  })

  it('refuses to revoke a used invite', async () => {
    mockInviteFindUnique.mockResolvedValue({ id: 'inv_1', usedAt: new Date() })
    const result = await DELETE({} as any, { params: Promise.resolve({ id: 'inv_1' }) })
    expect((result as any).status).toBe(409)
    expect(mockInviteDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/admin-invites.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `src/app/api/admin/invites/route.ts`**:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import {
  generateInviteToken,
  inviteStatus,
  usernameFromName,
  DEFAULT_INVITE_EXPIRY_DAYS,
  MAX_INVITE_EXPIRY_DAYS,
} from '@/lib/invites'
import { usernameSchema } from '@/lib/authValidators'

const createInviteSchema = z.object({
  type: z.enum(['open', 'bound']),
  targetUserId: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  expiresInDays: z.number().int().min(1).max(MAX_INVITE_EXPIRY_DAYS).default(DEFAULT_INVITE_EXPIRY_DAYS),
})

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      include: { targetUser: { select: { name: true } } },
    })
    return NextResponse.json(
      invites.map(({ tokenHash: _tokenHash, ...invite }) => ({
        ...invite,
        status: inviteStatus(invite),
        targetUserName: invite.targetUser?.name ?? null,
        targetUser: undefined,
      }))
    )
  } catch (error) {
    console.error('Failed to list invites:', error)
    return NextResponse.json({ error: 'Failed to list invites' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = createInviteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { type, targetUserId, role, expiresInDays } = parsed.data

  let boundTarget: { id: string; suggestedUsername: string } | null = null
  if (type === 'bound') {
    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required for bound invites' }, { status: 400 })
    }
    const target = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }
    if (target.username) {
      return NextResponse.json({ error: 'That user already has an account' }, { status: 409 })
    }
    const slug = usernameFromName(target.name)
    if (!usernameSchema.safeParse(slug).success) {
      return NextResponse.json(
        { error: `Cannot derive a valid username from "${target.name}"` },
        { status: 400 }
      )
    }
    boundTarget = { id: target.id, suggestedUsername: slug }
  }

  try {
    const { token, tokenHash } = generateInviteToken()
    const invite = await prisma.invite.create({
      data: {
        tokenHash,
        targetUserId: boundTarget?.id ?? null,
        suggestedUsername: boundTarget?.suggestedUsername ?? null,
        role,
        createdByUserId: session.isLegacyAdmin ? null : session.userId,
        expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
      },
    })
    const { tokenHash: _tokenHash, ...safeInvite } = invite as typeof invite & { tokenHash?: string }
    return NextResponse.json(
      // Raw token is returned exactly once — only its hash is stored
      { url: `${request.nextUrl.origin}/invite/${token}`, invite: safeInvite },
      { status: 201 }
    )
  } catch (error) {
    console.error('Failed to create invite:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Implement `src/app/api/admin/invites/[id]/route.ts`**:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    const invite = await prisma.invite.findUnique({ where: { id } })
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: 'Invite was already used' }, { status: 409 })
    }
    await prisma.invite.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to revoke invite:', error)
    return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Extend the admin users GET select** in `src/app/api/admin/users/route.ts` (line 7):

```ts
      select: { id: true, name: true, moxfieldCollectionId: true, username: true, role: true },
```

And update the matching assertion in `tests/admin-users.test.ts` (lines 54–57):

```ts
    expect(mockFindMany).toHaveBeenCalledWith({
      select: { id: true, name: true, moxfieldCollectionId: true, username: true, role: true },
      orderBy: { name: 'asc' },
    });
```

- [ ] **Step 6: Run tests, then commit (Commit 2)**

Run: `npx jest`
Expected: full suite PASS.

```bash
git add proxy.ts src/app/api/auth src/app/api/invites src/app/api/admin/invites src/app/api/admin/users/route.ts tests/proxy.test.ts tests/auth-login.test.ts tests/auth-signup.test.ts tests/admin-invites.test.ts tests/admin-users.test.ts
git commit -m "feat(auth): per-user login, signup, invite APIs and role-gated middleware"
```

---

### Task 11: Login page UI (username + password)

**Files:**
- Modify: `src/app/login/page.tsx`

No jest coverage for client components in this repo (no testing-library); UI verified by dev-server smoke test in Task 15.

- [ ] **Step 1: Update `LoginContent`** — replace the single password form (keep file structure, Suspense wrapper, theme toggle, error handling identical). Replace the state and form portion:

```tsx
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() || undefined, password }),
      })

      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        router.push(data.redirect || "/")
      } else if (res.status === 401) {
        setError("Invalid username or password.")
      } else if (res.status === 429) {
        setError(data?.error ?? "Too many attempts — try again shortly.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }
```

Subtitle changes from "Enter group password to continue" to "Sign in with your account". Form gains a username field above the password field (same input styling as the existing password input):

```tsx
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                autoComplete="username"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                disabled={isLoading}
              />
            </div>
```

Password input gains `autoComplete="current-password"` and its wrapping `<div>` gets `className="mt-4"`. Below the button, after the error paragraph, add the quiet hint:

```tsx
            <p className="mt-4 text-xs text-muted">
              No account? Ask the admin for an invite link.
            </p>
```

(The legacy bootstrap path is intentionally undocumented in the UI: admin leaves username blank and enters `ADMIN_PASSWORD` while `ALLOW_LEGACY_LOGIN=true`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (pre-existing errors, if any, noted and unchanged).

---

### Task 12: Invite redeem page `/invite/[token]`

**Files:**
- Create: `src/app/invite/[token]/page.tsx`

- [ ] **Step 1: Create `src/app/invite/[token]/page.tsx`**:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import ThemeToggle from "../../components/theme-toggle"

type Preflight =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "ready"; username: string | null; locked: boolean }

export default function InvitePage() {
  const router = useRouter()
  const params = useParams<{ token: string }>()
  const token = params.token

  const [preflight, setPreflight] = useState<Preflight>({ state: "loading" })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/invites/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data?.valid) {
          setPreflight({ state: "ready", username: data.username, locked: data.locked })
          if (data.username) setUsername(data.username)
        } else {
          setPreflight({ state: "invalid" })
        }
      })
      .catch(() => !cancelled && setPreflight({ state: "invalid" }))
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username: username.trim() || undefined, password }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        router.push(data.redirect || "/")
      } else {
        setError(data?.error ?? "Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors disabled:opacity-60"

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-surface p-8">
          <h1 className="text-xl font-bold font-narrow text-foreground mb-1">TableTally</h1>

          {preflight.state === "loading" && (
            <p className="text-sm text-muted">Checking your invite…</p>
          )}

          {preflight.state === "invalid" && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-400">
                This invite link is invalid, expired, or already used. Ask the admin for a new one.
              </p>
            </div>
          )}

          {preflight.state === "ready" && (
            <>
              <p className="text-sm text-muted mb-6">
                {preflight.locked
                  ? `Welcome! Set a password for "${preflight.username}" to finish creating your account.`
                  : "Welcome! Pick a username and password to create your account."}
              </p>

              <form onSubmit={handleSubmit}>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your-username"
                    autoComplete="username"
                    className={inputClass}
                    disabled={isLoading || preflight.locked}
                    readOnly={preflight.locked}
                  />
                  {preflight.locked && (
                    <p className="mt-1 text-xs text-muted">
                      This invite is tied to an existing collection — the username is fixed.
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={inputClass}
                    disabled={isLoading}
                  />
                  <p className="mt-1 text-xs text-muted">
                    At least 8 characters, with at least one letter and one number.
                  </p>
                </div>

                <div className="mt-4">
                  <label className="text-sm font-medium text-foreground mb-1.5 block">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={inputClass}
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`mt-6 w-full rounded-lg bg-accent px-6 py-2.5 text-base font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer${isLoading ? " opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isLoading ? "Creating account..." : "Create account"}
                </button>

                {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

---

### Task 13: Admin "Invites" section

**Files:**
- Create: `src/app/admin/invites-section.tsx` (keeps the 438-line `page.tsx` from growing further)
- Modify: `src/app/admin/page.tsx` (import + render between Users and Update All Collections sections, i.e. after the Users section ending before line 378)

- [ ] **Step 1: Create `src/app/admin/invites-section.tsx`**:

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface AdminUser {
  id: string
  name: string
  username: string | null
}

interface InviteRow {
  id: string
  suggestedUsername: string | null
  targetUserName: string | null
  role: string
  status: "pending" | "used" | "expired"
  expiresAt: string
  createdAt: string
}

export default function InvitesSection() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [inviteType, setInviteType] = useState<"open" | "bound">("bound")
  const [targetUserId, setTargetUserId] = useState("")
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
      ])
      if (usersRes.ok) setUsers(await usersRes.json())
      if (invitesRes.ok) setInvites(await invitesRes.json())
    } catch {
      // non-fatal; section just shows empty state
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const unboundUsers = users.filter((u) => !u.username)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setIsCreating(true)
    setError(null)
    setCreatedUrl(null)
    setCopied(false)
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: inviteType,
          targetUserId: inviteType === "bound" ? targetUserId : undefined,
          role: makeAdmin ? "ADMIN" : "MEMBER",
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        setCreatedUrl(data.url)
        refresh()
      } else {
        setError(data?.error ?? "Failed to create invite")
      }
    } catch {
      setError("Failed to create invite")
    } finally {
      setIsCreating(false)
    }
  }

  async function handleCopy() {
    if (!createdUrl) return
    await navigator.clipboard.writeText(createdUrl)
    setCopied(true)
  }

  function handleSelfAssign() {
    // Self-assign = redeem your own invite right now
    if (createdUrl) router.push(new URL(createdUrl).pathname)
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this invite?")) return
    const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" })
    if (res.ok) refresh()
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold font-narrow text-foreground mb-1">Invites</h2>
      <p className="text-sm text-muted mb-4">
        Invite friends to create accounts. Bound invites attach to an existing collection user
        (username locked to their name); open invites let them pick a username. To self-assign,
        create a bound invite for your own user and open the link.
      </p>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Type</label>
          <select
            value={inviteType}
            onChange={(e) => setInviteType(e.target.value as "open" | "bound")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="bound">Bound to collection user</option>
            <option value="open">Open (they pick a username)</option>
          </select>
        </div>

        {inviteType === "bound" && (
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">User</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              required
            >
              <option value="">Select user…</option>
              {unboundUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground pb-2">
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={(e) => setMakeAdmin(e.target.checked)}
          />
          Admin account
        </label>

        <button
          type="submit"
          disabled={isCreating || (inviteType === "bound" && !targetUserId)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
        >
          {isCreating ? "Creating…" : "Create invite"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}

      {createdUrl && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-400 mb-2">
            Invite created — copy it now, the link is only shown once:
          </p>
          <code className="block break-all text-xs text-foreground mb-2">{createdUrl}</code>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors cursor-pointer"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={handleSelfAssign}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors cursor-pointer"
            >
              Open now (self-assign)
            </button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-medium">For</th>
              <th className="py-1.5 font-medium">Role</th>
              <th className="py-1.5 font-medium">Status</th>
              <th className="py-1.5 font-medium">Expires</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id} className="border-t border-border text-foreground">
                <td className="py-2">{inv.targetUserName ?? inv.suggestedUsername ?? "Open invite"}</td>
                <td className="py-2">{inv.role}</td>
                <td className="py-2">
                  <span
                    className={
                      inv.status === "pending"
                        ? "text-amber-400"
                        : inv.status === "used"
                          ? "text-emerald-400"
                          : "text-muted"
                    }
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="py-2">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                <td className="py-2 text-right">
                  {inv.status === "pending" && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-xs font-medium text-red-400 hover:underline cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Render it from `src/app/admin/page.tsx`** — add the import at the top and `<InvitesSection />` between the Users section (ends before line 378's comment) and the "Update All Collections" section:

```tsx
import InvitesSection from "./invites-section"
// ...
      {/* Invites section */}
      <InvitesSection />
```

- [ ] **Step 3: Type-check + full suite, then commit (Commit 3)**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

```bash
git add src/app/login/page.tsx src/app/invite src/app/admin/invites-section.tsx src/app/admin/page.tsx
git commit -m "feat(auth): login, invite-redeem and admin invite UI"
```

---

### Task 14: Retire legacy auth helpers + jest setup hygiene

**Files:**
- Modify: `src/lib/auth.ts` (delete `signCookie`, `verifyHmac`, `adminSession` cookie name)
- Modify: `src/app/api/auth/logout/route.ts` (clear stale `admin_session` by literal name)
- Modify: `jest.setup.ts`

- [ ] **Step 1: Confirm no remaining consumers**

Run: `grep -rn "signCookie\|verifyHmac\|adminSession" src/ proxy.ts tests/ --include="*.ts" --include="*.tsx"`
Expected: only `src/lib/auth.ts` definitions, the logout route, and old test references already rewritten. If anything else appears, migrate it first.

- [ ] **Step 2: Delete `signCookie` and `verifyHmac`** from `src/lib/auth.ts` and change `COOKIE_NAMES` to:

```ts
export const COOKIE_NAMES = {
  session: 'session',
} as const
```

- [ ] **Step 3: Update `src/app/api/auth/logout/route.ts`** to keep clearing the legacy cookie by literal name:

```ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_NAMES } from '@/lib/auth'

export async function POST() {
  const cookieStore = await cookies()  // MUST await in Next.js 16
  cookieStore.set(COOKIE_NAMES.session, '', { maxAge: 0, path: '/' })
  // Stale pre-migration cookie — keep clearing it until the legacy window closes
  cookieStore.set('admin_session', '', { maxAge: 0, path: '/' })
  return NextResponse.json({ success: true, redirect: '/login' })
}
```

- [ ] **Step 4: Update `jest.setup.ts`** (GROUP_PASSWORD is gone from the product):

```ts
// Stub environment variables needed by auth modules
process.env.COOKIE_SECRET = 'test-secret-at-least-32-characters-long-for-hmac'
process.env.ADMIN_PASSWORD = 'test-admin-password'
```

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: PASS. (Tests referencing `COOKIE_NAMES.adminSession` were already rewritten in Tasks 7–8; `tests/auth-logout.test.ts` asserts on the literal `'admin_session'` string and still passes.)

---

### Task 15: Docs, verification, final commit

**Files:**
- Modify: `DEPLOYMENT.md` (add transition section)
- Modify: `.planning/PROJECT.md` (auth decision changed)
- Modify: `.env.example` if present (add `ALLOW_LEGACY_LOGIN`)

- [ ] **Step 1: Add to `DEPLOYMENT.md`** a "User accounts migration (v1.2)" section:

```markdown
## User accounts migration (issue #6)

Shared group-password auth is replaced by per-user accounts (admin invites only).

### Rollout order (production)
1. Apply the schema to Turso (`npx prisma db push` with prod env) — adds nullable
   auth columns + `invites` table; existing users/collections are preserved.
2. Set `ALLOW_LEGACY_LOGIN=true` in Vercel env and deploy.
3. Log in with the legacy admin password (leave username blank on /login).
4. In /admin → Invites: create a bound invite for your own collection user with
   "Admin account" checked, click "Open now (self-assign)", set your password.
5. Send bound/open invites to the group. The group password no longer works.
6. When everyone is migrated: set `ALLOW_LEGACY_LOGIN=false` (or remove it) and
   redeploy. `GROUP_PASSWORD` can be deleted; keep `ADMIN_PASSWORD` only if you
   may need the bootstrap again.

### Notes
- Passwords: scrypt (node:crypto), hashed only in Node API routes (Edge can't).
- Sessions: HMAC-signed `session` cookie now carries userId + role; the old
  `admin_session` cookie is gone (middleware checks `role === 'ADMIN'`).
- Invite links are single-use, expire after 7 days by default, and are shown
  exactly once (only a SHA-256 hash is stored).
```

- [ ] **Step 2: Update `.planning/PROJECT.md`** — move "Individual user accounts/logins" out of "Out of Scope" (mark superseded by issue #5/#6); add a Key Decision row:

```markdown
| Per-user accounts via admin invites (#6) | Per-user decks/library (#5) need identity; shared password retired via env-gated legacy login | — in progress |
```

- [ ] **Step 3: Full verification**

Run: `npx jest && npx tsc --noEmit && npm run build`
Expected: suite green, no type errors, production build succeeds (build runs `prisma generate` only — no DB access).

- [ ] **Step 4: Dev-server smoke test (local dev.db only)**

Run: `npm run dev` (background), then verify with curl:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/checkDeck` → 307 (redirect to /login)
- `curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"password":"<local ADMIN_PASSWORD>"}'` with `ALLOW_LEGACY_LOGIN=true` in `.env.local` → `{"success":true,"redirect":"/admin"}`
- Create an invite via the API with the session cookie, open `/invite/<token>`, complete signup, login as the new user.
Stop the dev server afterwards.

- [ ] **Step 5: Commit (Commit 4)**

```bash
git add DEPLOYMENT.md .planning/PROJECT.md jest.setup.ts src/lib/auth.ts src/app/api/auth/logout/route.ts docs/superpowers
git commit -m "docs(auth): user-accounts transition guide; retire legacy auth helpers"
```

---

## Acceptance criteria → task map (issue #6)

| Criterion | Tasks |
|---|---|
| Migration adds auth fields + Invite without breaking sync | 1 |
| Admin UI issues both invite kinds + self-assign | 10, 13 |
| Invitee completes signup with policy-compliant password and logs in | 9, 11, 12 |
| Passwords hashed, inputs validated against injection | 3, 4, 8, 9 (zod everywhere, Prisma parameterized) |
| Protected routes need per-user session; admin routes need ADMIN | 7 |
| Tests cover invite issue/redeem, policy, login/logout, role gating | 2–10 |
| Transition documented | 15 |
