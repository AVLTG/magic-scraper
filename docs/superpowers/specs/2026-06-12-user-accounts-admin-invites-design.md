# User Accounts & Admin Invites — Design (Issue #6)

**Date:** 2026-06-12
**Branch:** `feature/user-accounts` → integrates into `develop` (human-gated)
**Parent:** #5 (Task 1 of 2). Sibling task (per-user decks/library) is out of scope.

## Goal

Replace the shared group-password auth with per-user accounts created only via
admin invite. No public sign-up. Existing `User` rows (Moxfield collection
owners) and the nightly sync must keep working unchanged.

## Decisions (confirmed with user 2026-06-12)

| Decision | Choice |
|---|---|
| Password KDF | `scrypt` via `node:crypto` (zero deps; Node API routes only, never Edge) |
| Bootstrap / transition | Env-gated legacy admin login: `ALLOW_LEGACY_LOGIN=true` keeps `ADMIN_PASSWORD` working; group password retired immediately |
| Cookies | Single `session` cookie with signed payload embedding userId + role; `admin_session` removed |
| Password policy | min 8 chars, ≥1 letter, ≥1 digit, ≤128 chars, common-password blocklist, username ≠ password |

## Data model (Prisma migration, local dev.db only — prod rollout is human-gated)

```prisma
model User {
  id                   String   @id @default(cuid())
  name                 String
  moxfieldCollectionId String?  @unique        // now nullable; multiple NULLs OK in SQLite unique
  lastUpdated          DateTime @default(now())
  username             String?  @unique        // null = collection-only user (no login yet)
  passwordHash         String?                 // scrypt format string
  role                 String   @default("MEMBER") // 'ADMIN' | 'MEMBER' — SQLite Prisma has no enums; validated in app
  createdAt            DateTime @default(now())
  collectionCards      CollectionCard[]
  syncLogs             SyncLog[]
  invitesCreated       Invite[] @relation("InviteCreator")
  invitesTargeting     Invite[] @relation("InviteTarget")
}

model Invite {
  id                String    @id @default(cuid())
  tokenHash         String    @unique   // sha256(raw token); raw token shown once at creation
  targetUserId      String?             // bound invite → existing collection user
  suggestedUsername String?             // bound invite → locked username (= user.name)
  role              String    @default("MEMBER") // role granted on redeem (ADMIN for self-assign)
  createdByUserId   String?             // null when created under legacy bootstrap session
  usedAt            DateTime?
  expiresAt         DateTime
  createdAt         DateTime  @default(now())
}
```

Migration adds nullable/defaulted columns only → existing rows preserved,
nightly Moxfield sync unaffected. `prisma migrate dev` runs against local
`file:` dev.db ONLY. Prod (Turso, `prisma db push`) is applied by the human at
deploy time per DEPLOYMENT.md instructions added in this change.

## Sessions

Edge-compatible HMAC (existing `crypto.subtle` approach), new payload format:

```
v1.<userId>.<role>.<expiresAtUnixSeconds>.<hexHmacSha256("v1.<userId>.<role>.<exp>")>
```

- `userId` is a cuid (no `.`), `role` ∈ {ADMIN, MEMBER} — delimiter-safe.
- `verifySessionToken(value)` → `{ userId, role } | null`; checks signature
  (timing-safe via crypto.subtle.verify) and expiry.
- Legacy bootstrap session uses sentinel userId `__legacy_admin__` with role
  ADMIN; invite-creation treats it as `createdByUserId = null`.
- Middleware (`proxy.ts`, Edge runtime) verifies the token with zero DB calls
  and additionally requires `role === 'ADMIN'` for `/admin` + `/api/admin`.
- Role changes take effect at re-login/expiry (accepted tradeoff, 30-day maxAge).
- `admin_session` cookie removed; logout clears it once for migration hygiene.

## Password hashing (`src/lib/password.ts`, Node-only)

- `hashPassword(pw)`: scrypt, 16-byte random salt, N=16384 r=8 p=1, keylen 64.
  Stored as `scrypt$16384$8$1$<saltHex>$<hashHex>` (self-describing params).
- `verifyPassword(pw, stored)`: re-derive + `timingSafeEqual`.
- Never imported from middleware/Edge code.

## Password policy (zod, in `src/lib/validators.ts` style)

min 8 / max 128, ≥1 letter, ≥1 digit, not in embedded common-password
blocklist (~top 100, case-insensitive), not equal to username
(case-insensitive). Username: 3–32 chars, `[a-zA-Z0-9_-]`, case-insensitive
uniqueness enforced via normalized lookup.

## Invite flow

- Token: 32 random bytes, base64url. DB stores `sha256(token)` only; the raw
  invite URL is returned exactly once at creation (admin copies it manually —
  no email infra, per issue).
- Default expiry 7 days (admin can pick); single-use enforced atomically:
  `updateMany({ where: { id, usedAt: null } })` count check inside a
  transaction with user creation/binding.
- **Bound invite**: admin picks an existing user row without `username`;
  `suggestedUsername = user.name`, locked at redeem. Redeem sets
  username/passwordHash/role on that SAME user row (collection stays attached).
- **Open invite**: invitee picks their own username at redeem; creates a new
  `User` row with `moxfieldCollectionId = null`.
- **Self-assign**: the same bound-invite path with `role: 'ADMIN'`, created
  for the admin's own collection user; UI redirects the admin straight to the
  redeem page.
- Admin can list invites (status: pending/used/expired/revoked) and revoke
  (delete) unused ones.

## Routes

| Route | Runtime | Change |
|---|---|---|
| `POST /api/auth/login` | Node | username+password → verify scrypt → set session cookie. Legacy branch: `ALLOW_LEGACY_LOGIN=true` + `password === ADMIN_PASSWORD` (no username) → legacy admin session. Group password path deleted. Rate-limited. |
| `POST /api/auth/logout` | Node | clears `session` (+ stale `admin_session`) |
| `POST /api/auth/signup` | Node | `{token, username?, password}` → validate policy, redeem invite atomically, auto-login. Rate-limited. |
| `GET /api/invites/[token]` | Node | public preflight for redeem page: valid? locked username? |
| `GET/POST /api/admin/invites` | Node | list / create invites (admin-gated by middleware; route re-checks role) |
| `DELETE /api/admin/invites/[id]` | Node | revoke unused invite |
| `middleware.ts` / `proxy.ts` | Edge | exempt `/login`, `/api/auth`, `/invite`, `/api/invites`, `/api/cron`; verify session token; ADMIN role for admin paths |

A small `getSession()` helper (reads + verifies cookie in Node routes) provides
`{ userId, role, isLegacyAdmin }` for route-level checks and `createdByUserId`.

## UI

- `/login`: username + password fields (replaces single password field).
  Legacy admin login reachable by leaving username empty (only functions while
  `ALLOW_LEGACY_LOGIN=true`); subtle hint text, no dedicated UI.
- `/invite/[token]`: redeem page — shows locked username (bound) or username
  input (open), password + confirm with inline policy feedback.
- `/admin`: new "Invites" section — self-assign button, bound-invite creator
  (dropdown of users lacking `username`), open-invite creator, invite list with
  one-time link copy at creation + revoke.

## Transition / rollout (documented in DEPLOYMENT.md)

1. Deploy with `ALLOW_LEGACY_LOGIN=true`; apply schema to prod (human runs it).
2. Admin logs in via legacy admin password → self-assigns ADMIN account.
3. Admin sends invites to the group; group password no longer works at all.
4. Once everyone has an account: set `ALLOW_LEGACY_LOGIN=false` (or remove),
   optionally rotate/remove `GROUP_PASSWORD`/`ADMIN_PASSWORD` env vars.

## Security notes

- All inputs zod-validated; Prisma parameterization throughout (no raw SQL).
- Plaintext passwords never stored or logged; tokens stored hashed.
- Hashing only in Node runtime (Edge constraint from issue notes).
- Login/signup rate-limited via existing `src/lib/rateLimit.ts`.
- Login returns a single generic 401 for unknown-user vs wrong-password.

## Testing (jest, existing harness in `tests/`)

- `password.test.ts` — hash/verify round-trip, wrong password, tamper, format.
- `password-policy.test.ts` — length, classes, blocklist, username==password.
- `session-token.test.ts` — sign/verify, expiry, tamper, malformed.
- `invites.test.ts` — create (both kinds), redeem happy path, single-use race,
  expiry, revoked, bound-username lock.
- `auth-login.test.ts` (rewrite) — user login, legacy gate on/off, generic 401.
- `auth-signup.test.ts` — policy enforcement, open vs bound, auto-login cookie.
- `proxy.test.ts` (extend) — session required, ADMIN gating, exempt paths.
- Full suite (`npx jest`) green before completion.

## Out of scope

Per-user decks/card library (#7 sibling), OAuth/social login, email delivery,
password reset (admin can re-invite via bound invite as a manual reset),
prod migration execution.
