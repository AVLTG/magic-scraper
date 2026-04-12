# Requirements: magic-scraper

**Defined:** 2026-04-09
**Core Value:** Friends can instantly see who in the group owns any card from a decklist, and check which local stores have it in stock.

## v1.1 Requirements

Requirements for Game Tracking & Polish milestone. Each maps to roadmap phases.

### Game Tracking

- [ ] **GAME-01**: User can submit a new game with date, players (1-4), winner, screwed players, and winner deck
- [ ] **GAME-02**: User can select players from autocomplete dropdown shared across all player/winner/screwed fields
- [ ] **GAME-03**: User can type to filter dropdown or add a new player/deck not in the list
- [ ] **GAME-04**: Player autocomplete is seeded from existing Moxfield users and includes all previously entered player names
- [ ] **GAME-05**: Deck autocomplete maintains a separate list from players, persisted from previous game entries
- [ ] **GAME-06**: Screwed field supports multi-select (multiple players can be screwed in one game)
- [ ] **GAME-07**: User can view game history as a newest-first scrollable table
- [ ] **GAME-08**: User can edit or delete previously entered games
- [ ] **GAME-09**: All game input is sanitized before storage

### Stats & Visualization

- [x] **STAT-01**: User can view win rate per player as a bar chart
- [x] **STAT-02**: User can view win rate per deck as a bar chart
- [x] **STAT-03**: User can view screwed rate per player as a chart
- [x] **STAT-04**: User can view weekly game regularity (frequency of games over time)
- [x] **STAT-05**: User can view "most likely to play" metric (highest % of games participated)
- [x] **STAT-06**: User can view pie chart breakdowns (wins by player, games by deck)
- [ ] **STAT-07**: Stats update reactively when new games are added
- [x] **STAT-08**: Players/decks with no relevant data are excluded from charts

### Optimization

- [ ] **OPT-01**: API scraper routes are rate limited to prevent abuse
- [ ] **OPT-02**: 401 Games scraper attempts Cloudflare bypass via ScraperAPI render mode
- [ ] **OPT-03**: All scrapers have retry logic with typed errors and graceful failure modes

### Admin

- [ ] **ADM-01**: Admin can inline-edit a user's Moxfield collection ID
- [ ] **ADM-02**: Admin can view sync history and last-updated timestamps per user
- [ ] **ADM-03**: Cron sync failures are logged to SyncLog table and trigger Discord webhook alert
- [ ] **ADM-04**: Admin can view scraper health dashboard showing store success/failure status with logging

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Game Tracking

- **GAME-10**: Commander/format tracking per game
- **GAME-11**: Venue/location tracking per game
- **GAME-12**: Win streak display per player

### Stats

- **STAT-09**: Elo rating system for players
- **STAT-10**: Head-to-head player matchup records
- **STAT-11**: CSV export of game history

### Visualization

- **STAT-12**: Real-time chart updates (WebSocket)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Individual user accounts/logins | Shared password sufficient for closed friend group |
| Public access or sign-up flow | Invite-only by design |
| Mobile app | Web-only is fine |
| Price history tracking | Not needed for this use case |
| OAuth / social login | Unnecessary complexity for private tool |
| Player-deck binding | Players use random/borrowed decks too often; keep decks separate |
| Separate Player table in DB | Free-text playerName on GameParticipant is simpler; union query handles autocomplete |
| Upstash Redis for rate limiting | Overkill for ~10-user private app; in-memory Map accepted |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GAME-01 | Phase 6 | Pending |
| GAME-02 | Phase 6 | Pending |
| GAME-03 | Phase 6 | Pending |
| GAME-04 | Phase 6 | Pending |
| GAME-05 | Phase 6 | Pending |
| GAME-06 | Phase 6 | Pending |
| GAME-07 | Phase 6 | Pending |
| GAME-08 | Phase 6 | Pending |
| GAME-09 | Phase 6 | Pending |
| STAT-01 | Phase 7 | Complete |
| STAT-02 | Phase 7 | Complete |
| STAT-03 | Phase 7 | Complete |
| STAT-04 | Phase 7 | Complete |
| STAT-05 | Phase 7 | Complete |
| STAT-06 | Phase 7 | Complete |
| STAT-07 | Phase 7 | Pending |
| STAT-08 | Phase 7 | Complete |
| OPT-01 | Phase 6 | Pending |
| OPT-02 | Phase 9 | Pending |
| OPT-03 | Phase 9 | Pending |
| ADM-01 | Phase 8 | Pending |
| ADM-02 | Phase 8 | Pending |
| ADM-03 | Phase 8 | Pending |
| ADM-04 | Phase 8 | Pending |

**Coverage:**
- v1.1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after roadmap creation*
