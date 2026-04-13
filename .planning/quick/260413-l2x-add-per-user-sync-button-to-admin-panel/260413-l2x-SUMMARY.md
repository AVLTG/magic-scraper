---
quick_task: 260413-l2x
title: Add per-user Sync button to admin panel
status: complete
completed: "2026-04-13"
duration: ~8min
tags: [admin, sync, api-route, ui]

key-files:
  created:
    - src/app/api/admin/users/[id]/sync/route.ts
  modified:
    - src/lib/updateCollections.ts
    - src/app/admin/page.tsx

decisions:
  - No auth check on POST /api/admin/users/[id]/sync — consistent with all existing admin routes (UI-gated, private deployment)
  - No success Discord message — status dot provides all user feedback per spec
  - No error toast on failure — Discord webhook handles notification
  - fetchSyncSummary called with single-item array after sync to refresh only that user's status dot

tech-stack:
  patterns:
    - Next.js 15 async params pattern (params: Promise<{ id: string }>)
    - Per-key optimistic state invalidation (delete syncLogs[userId] on sync complete)
---

# Quick Task 260413-l2x: Add per-user Sync button to admin panel

**One-liner:** Per-user Sync button in admin panel triggering single-user Moxfield collection sync via new `updateUserCollection` lib function and POST route, with in-flight disabled state and status dot refresh.

## What Was Built

### Task 1: updateUserCollection + API route

Added `updateUserCollection(userId, source)` export to `src/lib/updateCollections.ts` — extracts the inner loop body of `updateAllCollections` for a single user. Key difference: no 2-second inter-user delay (only needed for sequential multi-user calls).

Created `src/app/api/admin/users/[id]/sync/route.ts`:
- `POST /api/admin/users/[id]/sync`
- Calls `updateUserCollection`, sends Discord alert on failure only
- `maxDuration = 120` (matches scraping duration needs)
- Async params pattern consistent with existing `[id]/route.ts`

### Task 2: Admin page Sync button

Three additions to `src/app/admin/page.tsx`:
- `syncingUsers: Record<string, boolean>` state — tracks in-flight state per user independently
- `handleSyncUser(userId)` — fires POST, always runs cleanup in `finally`: re-enables button, refreshes status dot via `fetchSyncSummary([{id: userId}])`, invalidates sync log cache by deleting the key
- Sync button inserted between status dot group and Delete button; uses `e.stopPropagation()` consistent with all other action buttons in the row

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 599f869 | feat(quick-260413-l2x-01): add updateUserCollection and POST sync route |
| 2 | cdfe5dc | feat(quick-260413-l2x-01): add per-user Sync button to admin panel |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. New route surface matches threat model accepted dispositions (T-l2x-01, T-l2x-02, T-l2x-03 — all accepted per plan).

## Self-Check

- [x] `src/app/api/admin/users/[id]/sync/route.ts` created
- [x] `updateUserCollection` exported from `src/lib/updateCollections.ts`
- [x] `src/app/admin/page.tsx` has syncingUsers state, handleSyncUser, and Sync button
- [x] `npx tsc --noEmit` — zero errors
- [x] Commits 599f869 and cdfe5dc exist on admin-improvements branch
