---
phase: 08-admin-improvements
plan: "02"
subsystem: admin-ui
tags: [admin, react, inline-edit, sync-history, status-dots, client-component]
dependency_graph:
  requires:
    - 08-01 (PATCH /api/admin/users/[id], GET /api/admin/users/[id]/sync-logs)
  provides:
    - Per-user sync status dots with relative timestamps on admin user cards
    - Click-to-edit collection ID (Enter saves, Escape cancels, no page reload)
    - Expandable sync history rows with cron/manual source badges
  affects:
    - src/app/admin/page.tsx
tech_stack:
  added: []
  patterns:
    - Lazy-fetch expand (sync logs fetched on first expand, cached in state)
    - stopPropagation to prevent card expand when clicking edit input or delete button
    - No onBlur on edit input (avoids blur/keydown race condition per RESEARCH.md Pitfall 4)
key_files:
  created: []
  modified:
    - src/app/admin/page.tsx
decisions:
  - "syncSummary fetched for all users in parallel on page load (best-effort, errors silently ignored)"
  - "syncLogs lazy-fetched per user on first expand and cached in component state to avoid redundant fetches"
  - "No onBlur on collection ID input — user cancels via Escape or navigates away (avoids race with keydown)"
  - "Status dot and relative time grouped into flex row alongside delete button for compact layout"
metrics:
  duration: ~10min
  completed_date: "2026-04-13"
  tasks_completed: 2
  files_modified: 1
---

# Phase 08 Plan 02: Admin UI — Inline Edit, Sync Status, Expandable History Summary

**One-liner:** Admin user cards now show per-user sync status dots with relative timestamps, click-to-edit Moxfield collection IDs (Enter/Escape), and expandable sync history rows with cron/manual source badges.

## What Was Built

### Task 1: Per-user sync summary state and status dot rendering

- Added `syncSummary` state: `Record<string, { status: string; createdAt: string } | null>`
- Added `fetchSyncSummary(userList)`: parallel fetch of `/api/admin/users/${id}/sync-logs` for all users, populates summary with most recent log entry per user. Best-effort — silently ignores fetch errors.
- Updated `fetchUsers` to call `fetchSyncSummary(data)` after loading users.
- Each user card now renders a `StatusDot` (green/red/grey) + relative timestamp (or "no syncs") inline with the card content.

### Task 2: Inline collection ID editing and expandable sync history

**Inline edit (D-04, D-05):**
- Added `editingUserId`, `editValue`, `editError` state.
- `handleSaveCollectionId(userId)`: PATCH `/api/admin/users/${userId}` with trimmed value, updates local `users` state on success, sets `editError` on failure. No sync triggered on save.
- Collection ID text is a clickable `<span>` that toggles to an `<input>` with `autoFocus`. Enter saves, Escape cancels. No `onBlur` to avoid race condition.
- `e.stopPropagation()` on the input's `onClick` prevents triggering card expand.

**Expandable sync history (D-01, D-02):**
- Added `expandedUserId`, `syncLogs` state.
- `handleToggleExpand(userId)`: collapses if already expanded, otherwise expands and lazy-fetches sync logs if not yet cached.
- Expanded section renders each log entry with `StatusDot`, relative timestamp, source badge (blue "manual" / grey "cron"), and truncated error message if present.
- `e.stopPropagation()` on delete button prevents triggering expand.

## Verification

- `npx tsc --noEmit` — TypeScript compiles cleanly (zero errors)
- Checkpoint human-verify pending — visual verification required

## Deviations from Plan

**[Rule 1 - Bug] Fixed `await` inside non-async setter callback**
- **Found during:** Task 2 TypeScript compile check
- **Issue:** `setSyncLogs(prev => ({ ...prev, [userId]: await res.json() }))` — `await` not allowed in non-async arrow passed to setState
- **Fix:** Extracted `const logs = await res.json()` before the `setSyncLogs` call
- **Files modified:** src/app/admin/page.tsx
- **Commit:** 044be1c (included in Task 2 commit)

## Known Stubs

None. All fetch calls target real endpoints built in Plan 08-01. Status dots show live data once sync logs exist; "no syncs" is the correct empty state before any sync has run.

## Threat Flags

None. No new trust boundaries — all fetches target existing admin-protected endpoints under `/api/admin/*`. Collection ID edit input value is trimmed server-side in the PATCH handler (Plan 01). React escapes all rendered output.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 919b8b5 | feat(08-02): add per-user sync summary state and status dot rendering |
| Task 2 | 044be1c | feat(08-02): inline collection ID editing and expandable sync history rows |

## Self-Check: PASSED

- [x] src/app/admin/page.tsx — FOUND
- [x] Commits 919b8b5 and 044be1c exist — verified
- [x] syncSummary, fetchSyncSummary, editingUserId, handleSaveCollectionId, expandedUserId, handleToggleExpand all present — verified
- [x] TypeScript compiles cleanly — verified
