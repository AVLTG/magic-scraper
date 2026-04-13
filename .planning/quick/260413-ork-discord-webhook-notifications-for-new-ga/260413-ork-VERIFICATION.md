---
phase: quick-260413-ork
verified: 2026-04-13T00:00:00Z
status: human_needed
score: 4/5
overrides_applied: 0
human_verification:
  - test: "Create a game via /games/new and observe the post-creation dialog"
    expected: "After saving, a dark overlay appears with 'Game saved!' title and two buttons: 'Send notification' and 'Skip'"
    why_human: "UI rendering and dialog appearance cannot be verified programmatically without a browser"
  - test: "Click 'Send notification' in the dialog"
    expected: "Button shows 'Sending...', then 'Sent! checkmark'. Button becomes disabled. A Discord message appears in the channel with the correct format."
    why_human: "Requires live browser session + real DISCORD_WEBHOOK_URL env var set in production"
  - test: "Click 'Send notification' a second time (or call POST /api/games/[id]/notify again)"
    expected: "Returns 409, UI shows 'Sent!' and does not double-post to Discord"
    why_human: "Needs live game ID to call against and real DB state"
---

# Quick Task: Discord Webhook Notifications — Verification Report

**Task Goal:** Discord webhook notifications for new game creation. Post-creation dialog lets the user optionally send one Discord notification per game (manual popup approach, chosen over 2-minute timer).
**Verified:** 2026-04-13
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After creating a new game, user sees a popup asking whether to send a Discord notification | ? HUMAN NEEDED | Dialog renders when `createdGameId !== null`; wiring confirmed. Requires browser to verify visual appearance. |
| 2 | Clicking 'Send notification' sends exactly one Discord message with winner name, deck, and combo status | VERIFIED | `handleNotify` POSTs to `/api/games/${createdGameId}/notify`; route builds the correct message and calls `sendDiscordAlert`; 6 test cases confirm message format. |
| 3 | The notification button is disabled after sending, preventing duplicate notifications | VERIFIED | `disabled={notifyStatus !== 'idle'}` in JSX; API enforces `discordNotified` boolean returning 409 on retry. |
| 4 | If no deck is listed for the winner, the message uses 'a deck they forgot to list' | VERIFIED | `winner?.deckName ?? 'a deck they forgot to list'` in route; test case explicitly covers this and passes. |
| 5 | No notifications are sent for edits or deletions | VERIFIED | `src/app/api/games/[id]/route.ts` contains no `sendDiscordAlert` or `discordNotified` references; notification only exists as an explicit POST to `/notify`. |

**Score:** 4/5 truths fully verified programmatically; truth #1 requires human confirmation of UI rendering.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/games/[id]/notify/route.ts` | POST endpoint to send Discord notification | VERIFIED | Exports `POST`; handles 404/409/429/500; calls `sendDiscordAlert`; updates `discordNotified`. |
| `src/app/games/new/page.tsx` | Post-creation notification dialog | VERIFIED | State machine (`idle/sending/sent/error`), dialog JSX with two buttons, `handleNotify` and `handleSkip` wired correctly. |
| `prisma/schema.prisma` | `discordNotified` boolean on Game model | VERIFIED | `discordNotified Boolean @default(false)` present at line 48. |
| `tests/games-notify.test.ts` | Tests for the notify endpoint | VERIFIED | 6 test cases, all passing. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/games/new/page.tsx` | `/api/games/[id]/notify` | `fetch POST after user confirms` | WIRED | Line 33: `fetch(\`/api/games/${createdGameId}/notify\`, { method: 'POST' })` |
| `src/app/api/games/[id]/notify/route.ts` | `src/lib/discord.ts` | `sendDiscordAlert call` | WIRED | Import at line 3; call at line 41: `await sendDiscordAlert({ content: message })` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 6 notify endpoint tests pass | `npx jest tests/games-notify.test.ts --no-coverage` | 6 passed, 0 failed | PASS |
| Correct message format (combo=true) | Test case 3 in suite | "Alice won using Atraxa via combo..." | PASS |
| Fallback deck text | Test case 4 in suite | "a deck they forgot to list" | PASS |
| 409 on duplicate send | Test case 2 in suite | Returns 409, no Discord call | PASS |
| Rate limiting (429) | Test case 6 in suite | Returns 429 with Retry-After header | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| QUICK-260413-ork | Discord webhook notification on new game creation with deduplication | SATISFIED | Notify endpoint + post-creation dialog + `discordNotified` boolean all implemented and tested. |

### Anti-Patterns Found

None. No TODOs, placeholders, empty handlers, or stub returns found in any modified file.

### Human Verification Required

#### 1. Post-creation dialog appears

**Test:** Create a game at `/games/new`, fill out the form, click Save.
**Expected:** A dark overlay dialog appears with "Game saved!" heading and "Would you like to notify the Discord channel about this game?" followed by "Send notification" and "Skip" buttons.
**Why human:** JSX rendering and visual appearance cannot be verified without a browser.

#### 2. Send notification flow end-to-end

**Test:** In the dialog, click "Send notification".
**Expected:** Button text changes to "Sending...", then to "Sent! ✓" (green). Button becomes disabled. A Discord message appears in the webhook channel: "New game added! [winner] won using [deck] [via combo / without any combos]. Check it out at magic-scraper.avltg.dev/games"
**Why human:** Requires a live browser session and `DISCORD_WEBHOOK_URL` set in the environment.

#### 3. Duplicate-send prevention

**Test:** After sending once, attempt to click "Send notification" again (button should be disabled) or call the notify API directly for the same game ID.
**Expected:** Button is disabled/non-clickable in the UI; direct API call returns 409 without sending a second Discord message.
**Why human:** Needs real DB state with a created game ID.

### Gaps Summary

No gaps. All programmatically verifiable must-haves pass. The three human verification items above are UI/integration checks that cannot be automated without a browser and live environment. Implementation is complete and correct based on code review and passing tests.

---

_Verified: 2026-04-13_
_Verifier: Claude (gsd-verifier)_
