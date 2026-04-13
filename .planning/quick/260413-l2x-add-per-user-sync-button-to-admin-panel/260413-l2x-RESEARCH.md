# Quick Task: Add Per-User Sync Button to Admin Panel - Research

**Researched:** 2026-04-13
**Domain:** Next.js API routes, React state management, existing sync infrastructure
**Confidence:** HIGH

## Summary

The existing `updateAllCollections` function in `src/lib/updateCollections.ts` handles the entire per-user sync logic already — it iterates users in a loop, scrapes Moxfield, writes to DB, and creates a SyncLog entry. Extracting single-user sync is straightforward: create a `updateUserCollection(userId, source)` function that runs the same logic for one user, pulled out of the loop body.

The admin page is a client component with established patterns for per-user async actions (delete, edit collection ID, expand sync logs). The per-user sync button follows the exact same pattern: per-user loading state in a `Record<string, boolean>` map, a new API route at `/api/admin/users/[id]/sync`, and the button inserted between the status dot group and the delete button.

**Auth finding (important):** There is no middleware and no server-side auth check on any existing `/api/admin/**` routes — verified by searching all files in `src/app/api/admin/` and `src/`. The admin routes are UI-gated only (the admin login sets a cookie the admin page checks client-side). The new sync route follows the same pattern — no auth check needed to stay consistent. [VERIFIED: grep across src/app/api/admin/]

**Primary recommendation:** Extract per-user sync into a new lib function, create `/api/admin/users/[id]/sync` POST route (no auth check — matches existing routes), add `syncingUsers` Record state to the admin page, insert the Sync button in the existing flex row.

## Architecture Patterns

### Existing per-user button layout (admin/page.tsx lines 264-281)

The action buttons for each user already live in a `flex items-center gap-2` div:

```tsx
<div className="flex items-center gap-2">
  <div className="flex items-center gap-1.5 text-xs text-muted">
    <StatusDot ... />
    <span>...</span>
  </div>
  {/* NEW SYNC BUTTON GOES HERE */}
  <button onClick={handleDelete} ...>Delete</button>
</div>
```

[VERIFIED: read src/app/admin/page.tsx]

### Per-user loading state pattern

The page already uses `Record<string, ...>`-style state for per-user concerns (`syncSummary`, `syncLogs`). Use the same pattern:

```tsx
const [syncingUsers, setSyncingUsers] = useState<Record<string, boolean>>({});
```

Check: `syncingUsers[user.id] ?? false`
Set: `setSyncingUsers(prev => ({ ...prev, [user.id]: true }))`
Clear: `setSyncingUsers(prev => ({ ...prev, [user.id]: false }))`

[VERIFIED: consistent with existing state patterns in src/app/admin/page.tsx]

### New lib function: updateUserCollection

Extract the inner loop body of `updateAllCollections` into a standalone function. The loop body (lines 16-104 of updateCollections.ts) is self-contained — it takes a single `user` object and does the Moxfield fetch, DB transaction, and SyncLog write.

```typescript
// src/lib/updateCollections.ts — new export alongside updateAllCollections
export async function updateUserCollection(
  userId: string,
  source: 'cron' | 'manual' = 'manual'
): Promise<{ success: boolean; error?: string; userName?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: 'User not found' };
  // ... same logic as loop body — no 2s delay needed (single user)
}
```

No delay (`setTimeout 2000`) is needed for single-user sync — the delay exists only to avoid Moxfield rate-limiting when syncing multiple users in sequence. [VERIFIED: read src/lib/updateCollections.ts lines 21-24]

### New API route: /api/admin/users/[id]/sync

Pattern follows existing `/api/admin/users/[id]/sync-logs/route.ts` and `/api/admin/users/[id]/route.ts` (already confirmed these exist in the `[id]` dynamic segment, and confirmed async params pattern is already used in `[id]/route.ts` line 6).

```typescript
// src/app/api/admin/users/[id]/sync/route.ts
import { NextResponse } from 'next/server';
import { updateUserCollection } from '@/lib/updateCollections';
import { sendDiscordAlert } from '@/lib/discord';

export const maxDuration = 120; // Single user needs far less than 300s

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // async params — already used in [id]/route.ts
  const result = await updateUserCollection(id, 'manual');
  if (!result.success) {
    await sendDiscordAlert({
      content: `⚠️ Manual sync failed for ${result.userName ?? id}: ${result.error}`,
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  // No success Discord message — status dot provides feedback per task spec
  return NextResponse.json({ success: true });
}
```

Async params (`{ params }: { params: Promise<{ id: string }> }`) is the correct pattern — already used verbatim in the existing `src/app/api/admin/users/[id]/route.ts` line 6. [VERIFIED: read src/app/api/admin/users/[id]/route.ts]

### Button placement and disabled state

```tsx
<button
  onClick={(e) => {
    e.stopPropagation(); // prevent expand toggle on parent div
    handleSyncUser(user.id);
  }}
  disabled={syncingUsers[user.id] ?? false}
  className="flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
>
  {syncingUsers[user.id] ? "Syncing..." : "Sync"}
</button>
```

The `e.stopPropagation()` is required — the entire user row div has an `onClick` for expand/collapse (admin/page.tsx line 229). All existing action buttons (delete, edit) already use this pattern. [VERIFIED: read src/app/admin/page.tsx lines 229, 244, 253]

### Post-sync: refresh the status dot and invalidate cached logs

After sync completes, refresh `syncSummary` for just that user and clear the cached sync logs entry so the next expand re-fetches fresh data:

```typescript
async function handleSyncUser(userId: string) {
  setSyncingUsers(prev => ({ ...prev, [userId]: true }));
  try {
    await fetch(`/api/admin/users/${userId}/sync`, { method: 'POST' });
  } finally {
    setSyncingUsers(prev => ({ ...prev, [userId]: false }));
    // Refresh status dot for this user only
    fetchSyncSummary([{ id: userId }]);
    // Invalidate cached sync logs so next expand re-fetches
    setSyncLogs(prev => { const next = { ...prev }; delete next[userId]; return next; });
  }
}
```

No success/error message displayed per task spec — Discord webhook and status dot provide feedback. [VERIFIED: task spec]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Discord notification | Custom HTTP code | Existing `sendDiscordAlert` from `src/lib/discord.ts` |
| Moxfield scraping | Any new fetch logic | Existing `scrapeMoxfield` already called inside `updateAllCollections` |
| Auth check on new route | Cookie verification | None needed — matches existing admin API routes (all unprotected at API layer) |

## Common Pitfalls

### Pitfall 1: Forgetting e.stopPropagation()
**What goes wrong:** Clicking Sync toggles the sync log expand/collapse — disorienting UX.
**Why it happens:** The entire user row div has an onClick handler (line 229 of admin/page.tsx).
**How to avoid:** Add `e.stopPropagation()` in the button's onClick, matching delete/edit pattern.

### Pitfall 2: Including the 2-second delay
**What goes wrong:** Unnecessary 2s hang in the API route, making the button feel broken.
**Why it happens:** Copy-pasting the full loop body including the delay guard (`if (i > 0) setTimeout 2000`).
**How to avoid:** The `updateUserCollection` function must NOT include the delay — it only makes sense when iterating multiple users sequentially.

### Pitfall 3: Keeping stale sync logs open after sync
**What goes wrong:** Expanded sync history shows old entries even after a fresh sync.
**Why it happens:** `syncLogs[userId]` is cached in state; expand doesn't re-fetch if already loaded.
**How to avoid:** Delete the user's entry from `syncLogs` state after sync completes (forces re-fetch on next expand).

### Pitfall 4: Forgetting to return userName from updateUserCollection
**What goes wrong:** Discord failure alert says "Manual sync failed for undefined" instead of the user's name.
**Why it happens:** The function only receives userId; user.name is only available after the DB lookup inside the function.
**How to avoid:** Include `userName: user.name` in the return value of `updateUserCollection`.

## Implementation Checklist

1. Add `updateUserCollection(userId, source)` export to `src/lib/updateCollections.ts` — extract loop body, no delay, return `{ success, error?, userName? }`
2. Create `src/app/api/admin/users/[id]/sync/route.ts` — POST handler, `maxDuration=120`, Discord on failure only, async params
3. Add `syncingUsers` state (`Record<string, boolean>`) to admin page component
4. Add `handleSyncUser(userId)` function to admin page
5. Insert Sync button between status dot group and Delete button, with `e.stopPropagation()`
6. In finally block: refresh summary dot for that user + delete that user's entry from `syncLogs` state

## Sources

### Primary (HIGH confidence — verified by reading files)
- `src/app/admin/page.tsx` — button placement, existing patterns, state shapes, stopPropagation pattern
- `src/lib/updateCollections.ts` — loop body to extract, SyncLog creation, delay logic
- `src/app/api/admin/updateCollections/route.ts` — Discord alert pattern, maxDuration value
- `src/lib/discord.ts` — sendDiscordAlert signature
- `src/app/api/admin/users/[id]/route.ts` — async params pattern, no auth check confirmed
- grep across `src/app/api/admin/` and `src/` — confirmed no middleware or auth guards on admin API routes

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next.js 15 async params (`params: Promise<{ id: string }>`) is correct | API route pattern | Build error or undefined params — low risk, already used in existing [id]/route.ts |
| A2 | `Record<string, boolean>` is idiomatic for per-user loading | UI state | Style inconsistency only — no functional impact |

**All security/auth claims verified:** No assumptions — confirmed by codebase search that admin API routes have no server-side auth checks.
