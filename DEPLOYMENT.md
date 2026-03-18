# Deployment Guide — magic-scraper

magic-scraper is an MTG collection checker for friend groups. It lets any member of the group instantly see who owns a given card and which local stores have it in stock. It runs on Next.js (deployed to Vercel) with a Turso (SQLite-compatible) database. Nightly collection syncs are driven by a Vercel Cron job that fetches each user's Moxfield collection automatically.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Dev Quickstart](#local-dev-quickstart)
3. [Turso Setup](#turso-setup)
4. [Vercel Project Setup](#vercel-project-setup)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Database Migration (Production)](#database-migration-production)
7. [Cron Job Setup](#cron-job-setup)
8. [Fluid Compute](#fluid-compute)
9. [First Deploy](#first-deploy)
10. [Post-Deploy Verification](#post-deploy-verification)
11. [Seed Users](#seed-users)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js 18+** — required for local development
- **npm** — comes bundled with Node.js
- **Git** — to clone and push the repository
- **Turso account** (free tier) — https://turso.tech
- **Vercel account** (free Hobby tier) — https://vercel.com
- **Turso CLI** — install via npm or the official docs:
  ```bash
  npm install -g turso
  # or follow: https://docs.turso.tech/cli/installation
  ```

---

## Local Dev Quickstart

```bash
# 1. Clone the repo
git clone <repo-url>
cd magic-scraper

# 2. Install dependencies
npm install

# 3. Create your local env file
cp .env.example .env.local   # then fill in the values below
# If .env.example does not exist, create .env.local manually — see Environment Variables Reference
```

Minimum values needed for local dev (use your Turso dev database URLs or a local dev DB):

```
DATABASE_URL=libsql://your-db-name-your-org.turso.io
DATABASE_AUTH_TOKEN=eyJhbGc...
COOKIE_SECRET=<64 hex chars — generate with: openssl rand -hex 32>
GROUP_PASSWORD=any-password
ADMIN_PASSWORD=any-admin-password
CRON_SECRET=<64 hex chars — generate with: openssl rand -hex 32>
CHROMIUM_REMOTE_EXEC_PATH=https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar
```

```bash
# 4. Generate Prisma client (uses libsql adapter)
npx prisma generate

# 5. Apply schema to DB (safe to re-run)
npx prisma db push

# 6. Start dev server
npm run dev
```

Visit `http://localhost:3000/login` and enter the group password to verify the app is running.

> **Note for local scraping:** The Chromium binary is downloaded from `CHROMIUM_REMOTE_EXEC_PATH` at runtime during scraping. This requires an internet connection and may be slow on first use.

---

## Turso Setup

```bash
# Log in to Turso CLI
turso auth login

# Create a new database (name it anything — used only for identification)
turso db create magic-scraper

# Get the database URL
turso db show magic-scraper --url
# Output: libsql://magic-scraper-<your-org>.turso.io
# Copy this — it becomes DATABASE_URL

# Create an auth token (full-access token for the database)
turso db tokens create magic-scraper
# Output: eyJhbGc...
# Copy this — it becomes DATABASE_AUTH_TOKEN
```

Turso free tier includes 500 databases, 9 GB storage, and 1 billion row reads per month — more than enough for this use case.

---

## Vercel Project Setup

1. Go to https://vercel.com/new and import your Git repository
2. Vercel will auto-detect **Next.js** as the framework — no build settings changes are needed
3. Do **not** change the output directory or install command — defaults work correctly
4. Before the first deploy, add all environment variables (see next section)
5. Click **Deploy**

---

## Environment Variables Reference

Set all of these in: **Vercel Dashboard > Project > Settings > Environment Variables**

Apply them to **Production** at minimum. Optionally also set them for Preview and Development environments.

| Variable | What it is | How to get it | Example |
|---|---|---|---|
| `DATABASE_URL` | Turso database URL | `turso db show <name> --url` | `libsql://magic-scraper-myorg.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso auth token (full access) | `turso db tokens create <name>` | `eyJhbGciOiJFZERTQSJ9...` |
| `COOKIE_SECRET` | HMAC key for session cookies — must be 32+ bytes | `openssl rand -hex 32` | `a1b2c3d4...` (64 hex chars) |
| `GROUP_PASSWORD` | Shared password all group members use to log in | Choose any string | `our-mtg-group-2024` |
| `ADMIN_PASSWORD` | Password for the admin panel (`/admin`) | Choose a strong string | `admin-strong-pass-xyz` |
| `CRON_SECRET` | Bearer token Vercel sends with cron requests — must match server check | `openssl rand -hex 32` | `f9e8d7c6...` (64 hex chars) |
| `CHROMIUM_REMOTE_EXEC_PATH` | URL to the chromium-min binary tarball used for browser scraping | Copy from releases page | `https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar` |

**Generate secrets locally:**
```bash
# COOKIE_SECRET
openssl rand -hex 32

# CRON_SECRET
openssl rand -hex 32
```

> **Security note:** Never commit `.env.local` to the repository. The `.gitignore` already excludes it.

---

## Database Migration (Production)

Prisma generates the client during the Vercel build step (via `prisma generate` in `postinstall`). However, schema changes must be pushed to the database **before** deploying or **immediately after** if deploying for the first time.

Run this locally against your production Turso database:

```bash
DATABASE_URL="libsql://magic-scraper-your-org.turso.io" \
DATABASE_AUTH_TOKEN="eyJhbGc..." \
npx prisma db push
```

This is safe to re-run — `prisma db push` is idempotent when the schema matches the database.

> **Note:** `prisma migrate deploy` does **not** work with Turso. Use `prisma db push` for schema application. If you need migration scripts, use `prisma migrate diff --script` and run SQL manually via `turso db shell`.

---

## Cron Job Setup

The cron job is already configured in `vercel.json` at the project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-collections",
      "schedule": "0 5 * * *"
    }
  ]
}
```

Vercel reads this file on every deploy and registers the cron job automatically — **no manual steps required**.

**What it does:** At 5:00 AM UTC (midnight EST) each day, Vercel calls `/api/cron/sync-collections`, which fetches the latest Moxfield collection data for every user and updates the database.

**Hobby tier timing variance:** On the Vercel Hobby plan, cron jobs are invoked within a ±59 minute window of the scheduled time. The job may run anywhere from 05:00 to 05:59 UTC. This is expected behavior.

**Authentication:** Vercel automatically sends an `Authorization: Bearer <CRON_SECRET>` header with each cron invocation. The `CRON_SECRET` env var must be set in Vercel for this to work.

**Verify setup:** After deploying, go to **Vercel Dashboard > Project > Cron Jobs** — the `sync-collections` job should appear with schedule `0 5 * * *`.

---

## Fluid Compute

The cron sync function is configured with a 300-second execution budget (`maxDuration = 300`). This requires **Fluid Compute** to be enabled on your Vercel project. Without it, serverless functions default to a 10-second timeout and multi-user collection syncs will time out.

**Enable Fluid Compute:**

1. Go to **Vercel Dashboard > Project > Settings > Functions**
2. Verify that **Fluid Compute** is enabled (it should be on by default for new projects)
3. If it is not enabled, toggle it on and redeploy

> This is the critical step from the known concern in the project docs. Without Fluid Compute, syncing more than 1-2 users will fail with a function timeout.

---

## First Deploy

```bash
# Push to main branch to trigger a Vercel deploy
git push origin main
```

Or trigger manually from **Vercel Dashboard > Deployments > Deploy**.

On first deploy:
1. Vercel installs dependencies and runs `prisma generate` via the build script
2. The app is deployed to `https://<your-project>.vercel.app`
3. The cron job from `vercel.json` is registered automatically

---

## Post-Deploy Verification

Run through this checklist after your first deploy:

- [ ] Visit `https://<your-app>.vercel.app/login` — login page loads
- [ ] Enter the group password — redirected to the main page
- [ ] Enter the admin password — redirected to `/admin` with admin access
- [ ] Admin panel shows an "Update All Collections" button
- [ ] Click "Update All Collections" — sync runs and returns without error (may take 10-60 seconds per user)
- [ ] Admin panel shows the user list (if users were seeded)
- [ ] Go to **Vercel Dashboard > Project > Cron Jobs** — `sync-collections` is listed with schedule `0 5 * * *`
- [ ] (Next morning) Check **Vercel Dashboard > Project > Logs** — confirm the cron ran and logged user update activity
- [ ] Go to **Vercel Dashboard > Project > Settings > Functions** — confirm Fluid Compute is enabled

---

## Seed Users

After the first deploy, add your group members through the admin panel:

1. Visit `https://<your-app>.vercel.app/admin` and log in with the admin password
2. Use the **Add User** form to add each group member:
   - **Name:** Their display name (e.g., "Alice")
   - **Moxfield Collection ID:** The alphanumeric ID from their Moxfield collection URL
3. Click **Update All Collections** to run an initial sync for all users

**How to find a Moxfield Collection ID:**

Go to the user's Moxfield collection page:
```
https://www.moxfield.com/collection/<COLLECTION_ID>
```
The `COLLECTION_ID` is the alphanumeric string at the end of the URL. Copy that value into the Add User form.

> **Note:** Each Moxfield Collection ID must be unique. If you see a `P2002` error when adding a user, the Collection ID is already registered to another user.

---

## Troubleshooting

**Cron shows green in Vercel dashboard but collection data is not updating**
- Check that `CRON_SECRET` in Vercel env vars matches exactly — no extra spaces or newlines
- Check Vercel Logs for the cron invocation to see any runtime errors
- Verify the proxy exclusion is in place: `/api/cron` routes should bypass any middleware auth checks

**Function timeout during sync**
- Enable Fluid Compute (see [Fluid Compute](#fluid-compute) section above)
- The cron route has `maxDuration = 300` — this only takes effect with Fluid Compute enabled

**`P2002` error when adding a user in the admin panel**
- The Moxfield Collection ID is already registered to another user
- Check the user list for a duplicate and remove the old entry first

**Login not working (group or admin password rejected)**
- Verify `GROUP_PASSWORD` and `ADMIN_PASSWORD` are set correctly in Vercel env vars
- Verify `COOKIE_SECRET` is set — without it, session cookies cannot be signed and auth will fail
- After changing env vars, redeploy (Vercel does not hot-reload env changes)

**`DATABASE_URL` or `DATABASE_AUTH_TOKEN` errors**
- Verify the Turso database URL format: `libsql://dbname-orgname.turso.io` (not `https://`)
- Turso tokens expire by default — create a new token if needed: `turso db tokens create <name>`

**Build fails with Prisma errors**
- Run `npx prisma generate` locally and commit any generated files if needed
- Ensure `DATABASE_URL` is set in Vercel env vars before the build runs
