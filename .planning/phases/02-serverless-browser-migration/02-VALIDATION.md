---
phase: 2
slug: serverless-browser-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — Wave 0 installs (no test framework currently in project) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SCRP-01 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | SCRP-01 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 2 | SCRP-02 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-01-04 | 01 | 2 | SCRP-03 | build | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `next.config.ts` updated with `serverExternalPackages` before any scraper changes (build-time requirement)

*Existing TypeScript infrastructure covers compilation checks. No test framework installation required for this phase — scraper correctness verified via build + manual Vercel deployment test.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LGS scrape returns results from Vercel function | SCRP-01 | Requires live Vercel deployment + real chromium binary download | Deploy to Vercel, call `/api/scrapeLGS` with a card name, verify ETB/DCC/FTF results returned |
| Moxfield fetch returns cards without browser | SCRP-02 | Requires live Moxfield API connectivity | Trigger collection update, check logs show no puppeteer launch, verify cards saved to DB |
| Cache TTL prevents redundant browser launch | SCRP-03 | Requires timing + log inspection | Call `/api/scrapeLGS` twice within 1 hour for same card, verify second call returns cached data (no chromium process) |
| Bundle stays under 250MB | SCRP-01 | Requires Vercel deployment inspection | Check Vercel function size in deployment logs; chromium binary must NOT be bundled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
