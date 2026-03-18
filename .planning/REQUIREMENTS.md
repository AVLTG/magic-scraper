# Requirements: magic-scraper

**Defined:** 2026-03-16
**Core Value:** Friends can instantly see who in the group owns any card from a decklist, and check which local stores have it in stock.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: Any visitor is redirected to a login page before accessing any route
- [ ] **AUTH-02**: Visitor can log in with the shared group password and gain access via httpOnly cookie
- [ ] **AUTH-03**: Admin routes (`/admin`, `/api/admin/*`) require a separate stronger admin password
- [ ] **AUTH-04**: User can log out, which clears the session cookie and redirects to login

### Database

- [x] **DB-01**: App connects to Turso cloud SQLite DB (replacing local `better-sqlite3`)
- [x] **DB-02**: All existing data models (User, CollectionCard) preserved with no schema changes
- [x] **DB-03**: Initial database schema applied to Turso at deploy time via Prisma

### Scrapers

- [x] **SCRP-01**: LGS scrapers (ETB, DCC, FTF) run on Vercel serverless using `@sparticuz/chromium-min` + `puppeteer-core`
- [x] **SCRP-02**: Moxfield collection scraper replaced with plain `fetch()` — no browser needed
- [x] **SCRP-03**: LGS scrape results cached per card name with TTL to avoid redundant browser launches on repeated requests
- [x] **SCRP-04**: Collection update (`deleteMany` + `createMany`) wrapped in a Prisma transaction to prevent partial data loss

### Automation

- [ ] **AUTO-01**: Vercel Cron job triggers nightly Moxfield collection sync for all users
- [ ] **AUTO-02**: Cron route validates `Authorization: Bearer <CRON_SECRET>` header before running sync

### Admin

- [ ] **ADMIN-01**: Admin can add a new user (name + Moxfield collection ID) via the admin panel
- [ ] **ADMIN-02**: Admin can delete a user (and their cards) via the admin panel
- [ ] **ADMIN-03**: Admin can manually trigger a full collection refresh from the admin panel (existing feature, now auth-protected)

### Deployment

- [ ] **DEPLOY-01**: Step-by-step deployment guide covers Turso setup, Vercel project setup, all required env vars, and first deploy

## v2 Requirements

### Scrapers

- **SCRP-V2-01**: Fix 401 Games scraper — currently non-functional; likely blocked by Cloudflare when running from Vercel IPs; investigate browser fingerprinting workarounds
- **SCRP-V2-02**: Rate limiting on `/api/scrapeLGS` and `/api/checkDeck` to prevent abuse

### Admin

- **ADMIN-V2-01**: Admin can edit an existing user's Moxfield collection ID (in case it changes)
- **ADMIN-V2-02**: Admin can view sync history / last-updated timestamps per user

### Operations

- **OPS-V2-01**: Error alerting when nightly cron sync fails (email or webhook)
- **OPS-V2-02**: Scraper health dashboard showing which stores are returning results vs failing

## Out of Scope

| Feature | Reason |
|---------|--------|
| Individual user accounts/login | Small closed group; shared password is sufficient |
| Public sign-up or invite flow | Invite-only by design; admin adds users manually |
| Mobile app | Web-only is fine for this use case |
| Real-time price updates | Nightly sync is sufficient |
| Price history tracking | Not needed |
| OAuth / social login | Unnecessary complexity for a private tool |
| 401 Games scraper (v1) | High risk — likely Cloudflare-blocked from Vercel IPs; deferred to v2 investigation |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 1 | Complete |
| SCRP-01 | Phase 2 | Complete |
| SCRP-02 | Phase 2 | Complete |
| SCRP-03 | Phase 2 | Complete |
| SCRP-04 | Phase 1 (early) | Complete |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| AUTH-04 | Phase 3 | Pending |
| AUTO-01 | Phase 4 | Pending |
| AUTO-02 | Phase 4 | Pending |
| ADMIN-01 | Phase 4 | Pending |
| ADMIN-02 | Phase 4 | Pending |
| ADMIN-03 | Phase 4 | Pending |
| DEPLOY-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-17 — SCRP-01, SCRP-02 completed in 02-01*
