---
phase: 08-admin-improvements
plan: 01
subsystem: admin-backend
tags: [prisma, sync-log, discord, webhook, api-routes, tdd]
dependency_graph:
  requires: []
  provides:
    - SyncLog.source column (cron/manual distinction)
    - updateAllCollections(source) with SyncLog writes and structured return
    - PATCH /api/admin/users/[id] for collection ID editing
    - GET /api/admin/users/[id]/sync-logs for sync history
    - sendDiscordAlert utility (src/lib/discord.ts)
    - Cron route Discord failure alerting
  affects:
    - src/app/api/admin/users/[id]/route.ts
    - src/app/api/cron/sync-collections/route.ts
    - src/app/api/admin/updateCollections/route.ts
    - src/lib/updateCollections.ts
tech_stack:
  added: []
  patterns:
    - TDD (RED-GREEN per task)
    - Best-effort webhook (no throw on Discord failure)
    - Source-tagged SyncLog writes per user per sync run
key_files:
  created:
    - src/lib/discord.ts
    - src/app/api/admin/users/[id]/sync-logs/route.ts
    - tests/admin-sync-logs.test.ts
    - tests/discord.test.ts
  modified:
    - prisma/schema.prisma
    - src/lib/updateCollections.ts
    - src/app/api/admin/users/[id]/route.ts
    - src/app/api/cron/sync-collections/route.ts
    - src/app/api/admin/updateCollections/route.ts
    - tests/admin-users.test.ts
    - tests/cron-sync.test.ts
decisions:
  - "Additive SyncLog.source column with DEFAULT 'cron' — existing rows backfill correctly"
  - "updateAllCollections wraps SyncLog.create in inner try/catch so logging failures don't mask sync errors"
  - "Discord webhook uses plain text content (not embeds) per Claude's Discretion"
  - "Manual sync route returns partial-success shape when some users fail (no Discord alert per D-07)"
metrics:
  duration: ~15min
  completed: "2026-04-13"
  tasks_completed: 2
  files_changed: 11
---

# Phase 8 Plan 1: Admin Backend Infrastructure Summary

**One-liner:** SyncLog source column + per-user SyncLog writes + PATCH collection ID endpoint + sync-logs GET endpoint + Discord failure alert utility wired to cron route.

## What Was Built

### Task 1: Schema, SyncLog writes, PATCH endpoint, sync-logs endpoint

- **prisma/schema.prisma**: Added `source String @default("cron")` to SyncLog model. Additive-only change; existing rows default to "cron". `prisma generate` run to regenerate client.
- **src/lib/updateCollections.ts**: Signature changed from `(): Promise<void>` to `(source: "cron" | "manual" = "cron"): Promise<{ succeeded: string[]; failed: Array<{ name: string; error: string }> }>`. Writes one SyncLog per user (success or failure) after each sync operation. SyncLog.create wrapped in inner try/catch so logging failures don't propagate.
- **src/app/api/admin/users/[id]/route.ts**: Added PATCH handler alongside existing DELETE. Validates non-empty trimmed moxfieldCollectionId, handles P2025 (404) and P2002 (409) Prisma errors.
- **src/app/api/admin/users/[id]/sync-logs/route.ts**: New GET endpoint. Fetches last 4 cron + last 1 manual entries via Promise.all, merges and sorts newest-first. Returns empty array when no logs exist.

### Task 2: Discord utility, cron/manual route updates

- **src/lib/discord.ts**: `sendDiscordAlert({ content })` utility. Best-effort — catches all errors, console.error, never throws. Skips silently with console.error when `DISCORD_WEBHOOK_URL` is unset.
- **src/app/api/cron/sync-collections/route.ts**: Updated to pass `"cron"` source, destructure `{ succeeded, failed }`, and call `sendDiscordAlert` with a failure summary when `failed.length > 0`.
- **src/app/api/admin/updateCollections/route.ts**: Updated to pass `"manual"` source, destructure `{ succeeded, failed }`, return partial-success shape. Does NOT call sendDiscordAlert (per D-07).

## Tests

| File | Cases | Result |
|------|-------|--------|
| tests/admin-users.test.ts | +5 PATCH cases (valid save, empty body, missing field, P2002 409, P2025 404) | PASS |
| tests/admin-sync-logs.test.ts | 3 cases (merged+sorted 4 cron+1 manual, empty array, 500 error) | PASS |
| tests/discord.test.ts | 4 cases (success post, URL unset, fetch throws, non-2xx response) | PASS |
| tests/cron-sync.test.ts | +3 Discord cases (no alert on success, alert on failure, source="cron") | PASS |
| Full suite | 201 tests | PASS |

## Deviations from Plan

None — plan executed exactly as written. The inner try/catch around SyncLog.create (not explicitly in the plan action but mentioned in the action spec) was implemented as described.

## Known Stubs

None. All endpoints are fully implemented with real Prisma queries.

## Threat Flags

No new trust boundaries introduced beyond what the plan's threat model covered. PATCH and sync-logs endpoints are under `/api/admin/*` protected by existing middleware auth. `DISCORD_WEBHOOK_URL` is server-only and never passed to any client component.

## User Setup Required

To enable Discord alerts, add `DISCORD_WEBHOOK_URL` to:
1. `.env.local` (local dev)
2. Vercel project environment variables (production)

Source: Discord Server Settings → Integrations → Webhooks → New Webhook → Copy URL

## Production Schema Migration

Before deploying, run in `turso db shell`:
```sql
ALTER TABLE sync_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'cron';
```

(prisma migrate deploy is incompatible with Turso — manual SQL required per established project pattern)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | ef38cc9 | feat(08-01): schema source column, PATCH endpoint, sync-logs endpoint, SyncLog writes |
| Task 2 | 0c69d68 | feat(08-01): Discord webhook utility, cron/manual route updates, Discord alert on failures |

## Self-Check: PASSED

- [x] prisma/schema.prisma contains `source       String   @default("cron")` — verified
- [x] src/lib/updateCollections.ts exports `{ succeeded, failed }` and writes SyncLog per user — verified
- [x] src/app/api/admin/users/[id]/route.ts contains `export async function PATCH` — verified
- [x] src/app/api/admin/users/[id]/sync-logs/route.ts contains `export async function GET` — verified
- [x] src/lib/discord.ts contains `sendDiscordAlert` — verified
- [x] Commits ef38cc9 and 0c69d68 exist — verified
- [x] 201 tests pass, TypeScript compiles cleanly — verified
