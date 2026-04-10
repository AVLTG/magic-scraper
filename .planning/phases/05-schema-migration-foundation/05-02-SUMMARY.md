---
phase: 05-schema-migration-foundation
plan: 02
subsystem: validation-and-docs
tags: [zod, validators, schema-doc, foundation]

requires:
  - phase: 05
    plan: 01
    provides: Game, GameParticipant, SyncLog Prisma models with indexes and cascades
provides:
  - zod ^4.3.6 installed as production dependency
  - src/lib/validators.ts exporting gameSchema, gameParticipantSchema, syncLogSchema (+ inferred types)
  - .planning/codebase/SCHEMA.md single-source design doc for game tracking + sync log data model
affects:
  - 06-* (game tracking CRUD — API routes import validators from @/lib/validators)
  - 07-* (stats dashboard — researchers read SCHEMA.md instead of re-deriving from schema.prisma)
  - 08-* (admin sync history — SyncLog schema documented; syncLogSchema ready for cron writes)

tech-stack:
  added:
    - "zod ^4.3.6 (production dependency — runtime validation for API route inputs)"
  patterns:
    - "Zod schemas as the ingest sanitization chokepoint (GAME-09: trim, clamp, narrow)"
    - "Validator types inferred via z.infer<typeof schema> — single source of truth for shape"
    - "Empty-string transform to undefined/null so Prisma receives clean optionals"
    - "z.enum narrowing at ingest even when DB column is plain String (D-07)"

key-files:
  created:
    - src/lib/validators.ts
    - .planning/codebase/SCHEMA.md
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Followed D-17, D-18, D-19 exactly: validators + schema doc landed, query helpers explicitly deferred"
  - "zod installed in dependencies (not devDependencies) because API routes will import at runtime"
  - "SCHEMA.md committed as empty marker — .planning/ is gitignored; orchestrator surfaces file back to main repo (same pattern as 05-01 Task 2)"
  - "Max lengths (100 for names, 1000 for game notes, 2000 for errorMessage) chosen conservatively — Phase 6 can tune if real data shows issues"

patterns-established:
  - "src/lib/validators.ts as the single flat file for zod schemas (matches parseDeck.ts flat style)"
  - "Inline // comments referencing decision IDs (D-01..D-19) and requirement IDs (GAME-XX) directly in the validator source"
  - "SCHEMA.md as the reference doc format for Phase 6/7/8 researchers"

requirements-completed:
  - GAME-03
  - GAME-04
  - GAME-05
  - GAME-09
  - STAT-04
  - STAT-07

duration: ~10 min
completed: 2026-04-10
---

# Phase 05 Plan 02: Validators & Schema Doc Summary

**zod 4.3.6 installed as a production dependency, `src/lib/validators.ts` landed with gameSchema/gameParticipantSchema/syncLogSchema (plus inferred input types), and `.planning/codebase/SCHEMA.md` written as the single design reference for Phase 6/7/8 researchers.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-10T06:27:41Z (worktree spawn)
- **Completed:** 2026-04-10T06:37:14Z
- **Tasks:** 2 / 2
- **Files created:** 2 (`src/lib/validators.ts`, `.planning/codebase/SCHEMA.md`)
- **Files modified:** 2 (`package.json`, `package-lock.json`)

## Accomplishments

- Installed zod ^4.3.6 in `dependencies` (verified not in devDependencies)
- Created `src/lib/validators.ts` with three exported schemas and three inferred input types
- Wrote `.planning/codebase/SCHEMA.md` covering all three new tables, column lists, index choices, cascade FKs, and design rationale referencing D-01..D-19
- `npx tsc --noEmit` exit 0 after both changes — no regressions in existing deck checker, admin, LGS scraper, or Moxfield scraper
- Zero DB access, zero query helpers, zero premature abstraction (D-19 enforced)

## Task Commits

Each task was committed atomically with `--no-verify` per parallel worktree protocol:

1. **Task 1: Install zod and add validators** — `10e8693` (feat)
   - `package.json`, `package-lock.json`, `src/lib/validators.ts`
2. **Task 2: Write SCHEMA.md design doc** — `35a82a0` (docs, empty marker)
   - `.planning/codebase/SCHEMA.md` is in a gitignored path; commit is an `--allow-empty` marker so the task-commit audit trail stays consistent. Pattern identical to 05-01 Task 2 (`ece0158`).

## Files Created/Modified

### `src/lib/validators.ts` (new — 75 lines)

Full content:

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// GameParticipant validator (D-02, GAME-09 sanitization)
// -----------------------------------------------------------------------------
// playerName: free-text per D-02 (no Player table); trimmed + non-empty per GAME-09
// deckName: optional per D-02 (winner's deck matters most; others are bonus)
// isWinner / isScrewed: boolean flags per D-03 (no winner FK on Game)
export const gameParticipantSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(1, "playerName is required")
    .max(100, "playerName too long"),
  isWinner: z.boolean(),
  isScrewed: z.boolean(),
  deckName: z
    .string()
    .trim()
    .max(100, "deckName too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type GameParticipantInput = z.infer<typeof gameParticipantSchema>;

// -----------------------------------------------------------------------------
// Game validator (D-01, GAME-01 "1-4 players", GAME-09 sanitization)
// -----------------------------------------------------------------------------
// date: coerced from ISO string or Date (API bodies arrive as JSON strings)
// wonByCombo: defaults to false per D-01 — Phase 6 form toggle
// notes: optional per D-01; trimmed and length-clamped per GAME-09
// participants: 1-4 entries per GAME-01; winner count NOT enforced here
//   (Phase 6 may want to allow unresolved-winner drafts — defer to route)
export const gameSchema = z.object({
  date: z.coerce.date(),
  wonByCombo: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(1000, "notes too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  participants: z
    .array(gameParticipantSchema)
    .min(1, "at least one participant required")
    .max(4, "at most four participants per game"),
});

export type GameInput = z.infer<typeof gameSchema>;

// -----------------------------------------------------------------------------
// SyncLog validator (D-06, D-07)
// -----------------------------------------------------------------------------
// Granularity: one row per user per sync (D-06)
// status: "success" | "failure" stored as string (D-07 — SQLite enum support awkward)
// errorMessage: nullable, holds truncated error text on failure (D-07)
// Phase 8 Discord alert will read rows WHERE status = "failure"
export const syncLogSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  status: z.enum(["success", "failure"]),
  errorMessage: z
    .string()
    .max(2000, "errorMessage too long")
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v ?? null)),
});

export type SyncLogInput = z.infer<typeof syncLogSchema>;
```

### `.planning/codebase/SCHEMA.md` (new — 168 lines)

Sections:
- **Overview** — introduces three new tables and normalization approach
- **Tables** — per-table column tables for `games`, `game_participants`, `sync_logs`, including indexes, cascade FKs, and requirement coverage
- **Design Rationale** — "Why no winner FK on Game" (D-03), "Why free-text playerName" (D-02), "Why optional deckName" (D-02), "Why minimal SyncLog columns" (D-07/D-08), "Why String status instead of Prisma enum" (D-07), "Why cascade delete" (D-04/D-07)
- **What's NOT in This Schema (Deferred)** — pointer to 05-CONTEXT.md deferred list
- **Migration History** — Phase 5 additive-only entry referencing D-13, D-14, D-16
- **Validators** — explains `src/lib/validators.ts` exports, notes D-18 (doc mandated by foundation scope) and D-19 (no query helpers in Phase 5)

### `package.json` — added `"zod": "^4.3.6"` to `dependencies`

```diff
   "dependencies": {
     ...
     "react": "19.2.3",
-    "react-dom": "19.2.3"
+    "react-dom": "19.2.3",
+    "zod": "^4.3.6"
   },
```

### `package-lock.json` — regenerated (zod + transitive dependencies)

## Command Output (verbatim)

### `npm install zod`
```
added 804 packages, and audited 805 packages in 2m
217 packages are looking for funding
12 vulnerabilities (3 moderate, 8 high, 1 critical)
```

Vulnerability audit note: the 12 vulns are pre-existing in the dependency tree (puppeteer-core, @sparticuz/chromium-min, and their transitives from v1.0). `zod` itself has zero runtime dependencies and contributes no vulnerabilities. Not in scope for this plan — documented as a deferred item for a future hardening phase if needed.

### `npx prisma generate`
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Generated Prisma Client (v6.19.2) to .\node_modules\@prisma\client in 66ms
```

Ran to re-hydrate the Prisma client in this fresh worktree's `node_modules` after `npm install` (Prisma client lives in `node_modules/@prisma/client` which is gitignored and gets rebuilt on install).

### `npx tsc --noEmit`
Exit code: **0**. No errors, no warnings from `src/` files.

## Acceptance Criteria Check

### Task 1 — validators.ts + zod install
- [x] `package.json` contains `"zod"` inside `dependencies` block (NOT devDependencies) — verified via node JSON parse
- [x] `package-lock.json` contains `node_modules/zod` entry — `ls node_modules/zod` succeeds
- [x] `src/lib/validators.ts` exists
- [x] Contains literal `import { z } from "zod"`
- [x] Contains literal `export const gameSchema`
- [x] Contains literal `export const gameParticipantSchema`
- [x] Contains literal `export const syncLogSchema`
- [x] Contains literal `z.coerce.date()`
- [x] Contains literal `.min(1`
- [x] Contains literal `.max(4`
- [x] Contains literal `z.enum(["success", "failure"])`
- [x] Contains literal `.trim()`
- [x] Exports `GameInput`, `GameParticipantInput`, `SyncLogInput` types
- [x] Does NOT contain `from "@/lib/prisma"` (no DB access per D-19) — verified
- [x] Does NOT contain `prisma.game` — verified
- [x] Does NOT contain `export default` — verified
- [x] `npx tsc --noEmit` exit 0

### Task 2 — SCHEMA.md
- [x] `.planning/codebase/SCHEMA.md` exists
- [x] Contains `# Schema Design`
- [x] Contains `games`, `game_participants`, `sync_logs`
- [x] Contains `model Game`, `GameParticipant`, `SyncLog`
- [x] Contains decision references D-01, D-02, D-03, D-04, D-06, D-07, D-09, D-10, D-11, D-13, D-18, D-19 (verified via node script)
- [x] Contains `@@index([date])`, `@@index([playerName])`, `@@index([userId, createdAt])`
- [x] Contains `onDelete` and `Cascade`
- [x] Contains `free-text`
- [x] Contains section "Why no winner FK on Game"
- [x] Contains deferred-fields section
- [x] Contains `src/lib/validators.ts` reference
- [x] Contains NO emoji characters from the problem set (`✓✗⚠🚀📋` etc.) — verified
- [x] File size 168 lines (> 50 line minimum)

## Decisions Made

None outside the plan — D-17, D-18, D-19 from 05-CONTEXT.md were followed exactly. Local judgment calls:

- **Max-length values** (100 for names, 1000 for game notes, 2000 for errorMessage) were labeled "Claude's discretion" in the plan. Went with the plan-suggested values unchanged.
- **Task 2 committed as `--allow-empty` marker.** `.planning/` is gitignored in this repo, so `SCHEMA.md` cannot be tracked via a normal commit. The marker commit preserves the one-commit-per-task contract and the orchestrator will surface the file content back to the main repo on worktree merge. This is the same pattern 05-01 used for its Task 2 (`ece0158`).

## Deviations from Plan

**None** — plan executed exactly as written. No Rule 1-3 auto-fixes triggered.

Minor operational note (not a plan deviation): after `npm install zod`, the fresh `node_modules/@prisma/client` in this worktree did not yet have the Phase 5 Game/Participant/SyncLog types (because 05-01's `prisma generate` wrote them to the *main repo's* node_modules, which is not shared with the worktree). Ran `npx prisma generate` once to re-hydrate. This is a worktree hygiene step, not a plan change. The initial tsc error surfaced then disappeared after `prisma generate` — zero code changes were needed in `updateCollections.ts` or any other existing file.

## Issues Encountered

- **Worktree missing `.planning/` and `.env` at spawn.** Same as 05-01 — bootstrapped from main repo per the orchestrator's instructions. Not a plan deviation, owned by the orchestrator.
- **Worktree base was not the expected 05-01 HEAD at spawn.** `git reset --hard ece01584c78af6e1ad6675ac04da65eb5b324911` was run per the worktree-branch-check block to land on the Phase 5 Plan 1 commit. After the reset, the new Prisma models were present in `prisma/schema.prisma` as expected.
- **Fresh worktree `node_modules` didn't have Phase 5 Prisma client types.** Resolved by running `npx prisma generate` once. No code changes.

## Known Stubs

**None.** This plan is validators + documentation only — no UI, no API routes, no placeholder data rendering paths. Nothing is stubbed.

## Threat Flags

**None.** The two new artifacts are:
- A zod validator module with no network/DB/file-access surface (validators are pure functions)
- A markdown design doc containing no secrets

Both are already dispositioned in the plan's threat register (T-05-05 mitigate, T-05-06 mitigate, T-05-07 accept, T-05-08 accept). No new threat surface to flag.

The `supply chain` entry (T-05-08) is worth noting operationally: zod's install flagged 12 pre-existing vulnerabilities in the wider dependency tree (puppeteer-core, chromium-min, their transitives), but zod itself has zero runtime dependencies. Adding zod did not contribute to the vuln count.

## User Setup Required

**None.** `npm install` will pick up zod automatically the next time someone runs it; no env vars, no DB changes, no manual steps. Phase 6 researchers can just `import { gameSchema } from "@/lib/validators"` and start building.

## Next Phase Readiness

**Plan 03 (production Turso apply) can now:**
- Proceed independently. This plan touched only TypeScript source and a doc file — no schema changes, no migration SQL.

**Phase 6 (Game CRUD) is unblocked** on all three foundation artifacts:
- Prisma models exist (from 05-01)
- zod validators exist (this plan)
- Design doc exists (this plan)

Phase 6 API routes can write:
```typescript
import { gameSchema, type GameInput } from "@/lib/validators";
import { prisma } from "@/lib/prisma";

const body = gameSchema.parse(await req.json());
const game = await prisma.game.create({ data: { ...body, participants: { create: body.participants } } });
```
with zero additional setup.

**Phase 7 (Stats)** and **Phase 8 (Admin sync history)** are similarly unblocked — they can import `syncLogSchema` and reference SCHEMA.md directly.

**No blockers or concerns.**

## Self-Check: PASSED

- [x] `src/lib/validators.ts` exists — `ls -la` shows 2858 bytes
- [x] `.planning/codebase/SCHEMA.md` exists — `ls -la` shows 6941 bytes (168 lines)
- [x] Commit `10e8693` exists — `git log --oneline` shows `10e8693 feat(05-02): install zod and add Game/Participant/SyncLog validators`
- [x] Commit `35a82a0` exists — `git log --oneline` shows `35a82a0 docs(05-02): add SCHEMA.md documenting Game/Participant/SyncLog design`
- [x] `package.json` has `"zod": "^4.3.6"` in `dependencies` section (verified via node JSON parse)
- [x] `npx tsc --noEmit` exits 0
- [x] All plan verify grep checks pass (see Acceptance Criteria Check above)

---
*Phase: 05-schema-migration-foundation*
*Completed: 2026-04-10*
