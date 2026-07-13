# Operations Guide — BacktestBaba D1 Persistence

> **Audience**: Anyone who needs to keep the system running, check if things are working, or fix common problems. No coding experience required.
>
> **Last updated**: 2026-07-13

---

## Table of Contents

1. [How the System Works (Simple Explanation)](#1-how-the-system-works-simple-explanation)
2. [Architecture — The 3 Layers](#2-architecture--the-3-layers)
3. [Daily Checks — Is Everything Working?](#3-daily-checks--is-everything-working)
4. [Viewing Data in the Database](#4-viewing-data-in-the-database)
5. [Checking Storage Quota](#5-checking-storage-quota)
6. [Managing Users](#6-managing-users)
7. [Backing Up Data](#7-backing-up-data)
8. [Cleaning Up Old Data](#8-cleaning-up-old-data)
9. [Common Problems & Fixes](#9-common-problems--fixes)
10. [How to Redeploy the Worker](#10-how-to-redeploy-the-worker)
11. [How to Run a Database Migration](#11-how-to-run-a-database-migration)
12. [Quick Reference Card](#12-quick-reference-card)

---

## 1. How the System Works (Simple Explanation)

**What does this app do?**

A stock trader uploads a CSV file (like an Excel spreadsheet) containing a list of stock names and dates. The app checks whether those stocks actually made money after those dates by looking up real price history from Yahoo Finance. It then shows charts and tables with the results.

**Where does the database fit in?**

Before this database existed, results were shown in the browser and then disappeared when you closed the tab. Now the database saves:
- Who uploaded what file (for billing and limits)
- What the backtest results were (so you don't have to re-calculate)
- How many users there are (for the admin dashboard)

The database is **not required** for the app to work. If it's down, users still get their results — they just won't be saved for later.

---

## 2. Architecture — The 3 Layers

```
User's Browser (Frontend)
       ↕
   FastAPI Backend  ←── You interact with this when testing
       ↕
Cloudflare Worker   ←── The middleman that talks to the database
       ↕
   D1 Database      ←── Where data is actually stored
```

| Layer | What it is | Cost | Who manages it |
|-------|-----------|------|----------------|
| **Frontend** | React website on Vercel | Free tier | Vercel auto-deploys from GitHub |
| **Backend** | Python server on Render | Free tier (512MB RAM, sleeps after 15 min idle) | Render auto-deploys from GitHub |
| **Worker** | JavaScript on Cloudflare | Free tier (100k requests/day) | **You** deploy via `npx wrangler deploy` |
| **D1 Database** | SQLite database on Cloudflare | Free tier (5GB, 1M writes/month) | **You** manage via `npx wrangler d1` |

### Important: Data Flow

```
1. User uploads file → Backend checks if result is already cached
2. If NOT cached → Backend runs backtest (fetches Yahoo Finance prices)
3. Backend saves result to local disk cache (diskcache)
4. Backend saves result to D1 database via Worker (if PERSISTENCE_ENABLED=True)
5. User sees result in browser
```

**Key rule**: If steps 3 or 4 fail, the user still gets their results. The database is optional.

---

## 3. Daily Checks — Is Everything Working?

### Check 1: Worker health

```bash
curl https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/health
```

**Expected result** (it should look exactly like this):
```json
{"status":"ok","database":"backtestbaba","version":"1.0.0","tables":30}
```

**If you get "Hello World!" instead**: The Worker has the old default code. See Section 10.

**If you get an error** (connection refused, timeout): The Worker might be down. Wait 5 minutes and try again. If still down, redeploy (Section 10).

### Check 2: Storage quota

```bash
curl https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/quota
```

**Expected result**:
```json
{"total_writes":500,"write_limit":1000000,"percent_used":0.05,"soft_blocked":false}
```

Look at `percent_used`. If it's above **95%**, the database will stop accepting new data. See Section 5.

### Check 3: Can users sign up?

```bash
curl -X POST https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test123"}'
```

**Expected result**: Returns `{"user": {...}, "token": "..."}`. If it says "invalid credentials", the user doesn't exist yet — try signup instead:

```bash
curl -X POST https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test123","name":"Admin"}'
```

---

## 4. Viewing Data in the Database

You don't have a graphical dashboard for the D1 database. All commands run in your terminal.

### List all registered users

```bash
npx wrangler d1 execute backtestbaba --remote --command "SELECT id, email, name, plan, is_admin, max_signals, created_at FROM users ORDER BY created_at DESC"
```

This shows: user ID, email, name, plan tier (free/priority), admin flag, signal limit, and when they joined.

### List all uploads

```bash
npx wrangler d1 execute backtestbaba --remote --command "SELECT id, filename, entry_mode, signal_count, trade_count, status, created_at FROM uploads ORDER BY created_at DESC LIMIT 20"
```

This shows the 20 most recent file uploads, how many signals they had, and whether the persist succeeded.

### List recent failed uploads

```bash
npx wrangler d1 execute backtestbaba --remote --command "SELECT id, filename, file_size, status, created_at FROM ingestion_log WHERE status='failed' ORDER BY created_at DESC LIMIT 10"
```

This helps find uploads that didn't persist properly. A few failures are normal if the Worker was briefly down. Many failures in a row means something is broken.

### Count total signals stored

```bash
npx wrangler d1 execute backtestbaba --remote --command "SELECT COUNT(*) as total FROM signal_hashes"
```

---

## 5. Checking Storage Quota

The free Cloudflare D1 plan allows **1 million write operations per month**.

### View current usage

```bash
curl https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/quota
```

Look at these fields:
- `total_writes`: How many writes used so far this month
- `write_limit`: Maximum allowed (default 1,000,000)
- `percent_used`: Percentage used
- `soft_blocked`: If `true`, the database has stopped accepting new data

### What to do if quota is at 95% or more

The Worker automatically blocks writes at 95% to prevent surprise exhaustion. When blocked:

1. **Export existing data** (see Section 7)
2. **Reset the quota counter** (this does NOT delete data, just resets the counter):

```bash
npx wrangler d1 execute backtestbaba --remote --command "UPDATE quota SET total_writes = 0, updated_at = datetime('now') WHERE id = 1"
```

3. **Alternative**: Delete old data to free up space (see Section 8)

---

## 6. Managing Users

### Make a user an admin (so they can access the admin dashboard)

First, find their email from the users list (Section 4). Then run:

```bash
npx wrangler d1 execute backtestbaba --remote --command "UPDATE users SET is_admin = 1, plan = 'priority', max_signals = 5000, max_file_size_mb = 10 WHERE email = 'their@email.com'"
```

This gives them admin privileges, priority plan, and 5000 signal limit.

### Upgrade a user to priority plan

```bash
npx wrangler d1 execute backtestbaba --remote --command "UPDATE users SET plan = 'priority', max_signals = 5000, max_file_size_mb = 10 WHERE email = 'their@email.com'"
```

### Downgrade a user to free plan

```bash
npx wrangler d1 execute backtestbaba --remote --command "UPDATE users SET plan = 'free', max_signals = 100, max_file_size_mb = 2 WHERE email = 'their@email.com'"
```

### Force-logout a user (revoke all their sessions)

```bash
npx wrangler d1 execute backtestbaba --remote --command "UPDATE sessions SET revoked = 1 WHERE user_id = (SELECT id FROM users WHERE email = 'their@email.com')"
```

The user will need to log in again.

### Delete a user account

```bash
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'their@email.com')"
npx wrangler d1 execute backtestbaba --remote --command "UPDATE ingestion_log SET user_id = NULL WHERE user_id = (SELECT id FROM users WHERE email = 'their@email.com')"
npx wrangler d1 execute backtestbaba --remote --command "UPDATE uploads SET user_id = NULL WHERE user_id = (SELECT id FROM users WHERE email = 'their@email.com')"
npx wrangler d1 execute backtestbaba --remote --command "UPDATE signal_hashes SET user_id = NULL WHERE user_id = (SELECT id FROM users WHERE email = 'their@email.com')"
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM users WHERE email = 'their@email.com'"
```

(These commands run in sequence. The first one deletes sessions, the middle ones detach their data, the last one deletes the user.)

---

## 7. Backing Up Data

### Export the entire database

```bash
npx wrangler d1 execute backtestbaba --remote --command ".dump" > backtestbaba-backup-2026-07-13.sql
```

This creates a `.sql` file containing all the data and table structures. You can restore it later.

### Restore from backup

```bash
npx wrangler d1 execute backtestbaba --remote --file backtestbaba-backup-2026-07-13.sql
```

**Warning**: This overwrites existing data. Only restore if you want to replace everything.

### Export specific tables

```bash
npx wrangler d1 execute backtestbaba --remote --command "SELECT * FROM users" > users-export-2026-07-13.csv
npx wrangler d1 execute backtestbaba --remote --command "SELECT * FROM signal_hashes" > signals-export-2026-07-13.csv
```

---

## 8. Cleaning Up Old Data

### Delete ingestion logs older than 30 days

These are audit records. Deleting them frees up storage without affecting user data.

```bash
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM ingestion_log WHERE created_at < datetime('now', '-30 days') AND status IN ('completed', 'skipped')"
```

This only deletes logs that are completed or skipped. Failed logs are kept for debugging.

### Delete upload records older than 90 days

```bash
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM signal_hashes WHERE upload_id IN (SELECT id FROM uploads WHERE created_at < datetime('now', '-90 days'))"
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM uploads WHERE created_at < datetime('now', '-90 days')"
```

**Warning**: This permanently deletes backtest results older than 90 days. Users will lose their saved history.

### Delete a specific user's data

```bash
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM sessions WHERE user_id = 'USER_ID_HERE'"
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM signal_hashes WHERE user_id = 'USER_ID_HERE'"
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM uploads WHERE user_id = 'USER_ID_HERE'"
npx wrangler d1 execute backtestbaba --remote --command "DELETE FROM ingestion_log WHERE user_id = 'USER_ID_HERE'"
```

Get the `USER_ID_HERE` from the users list (Section 4).

---

## 9. Common Problems & Fixes

### Problem: "Hello World!" instead of API response

**Cause**: The Worker is running the default Cloudflare template, not our code.

**Fix**: Redeploy (see Section 10).

---

### Problem: `curl` returns `Connection refused` or timeout

**Cause**: The Worker might be temporarily down, or your internet is disconnected.

**Fix**: Wait 2 minutes and try again. If still failing, run `npx wrangler deploy` again (Section 10).

---

### Problem: Auth returns "Auth not configured" (HTTP 501)

**Cause**: The backend's `PERSISTENCE_ENABLED` flag is set to `false`.

**Fix**: Edit the backend's environment variables:
1. Open Render dashboard
2. Find the `backtestbaba-api` service
3. Environment → add `PERSISTENCE_ENABLED=true`
4. Environment → add `WORKER_URL=https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`
5. Redeploy or restart the service

For local development, edit `backend/.env.local`:
```
PERSISTENCE_ENABLED=true
WORKER_URL=https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev
```

---

### Problem: Database writes are blocked (soft_blocked=true)

**Cause**: The monthly write quota has exceeded 95%.

**Fix**: See Section 5 (reset quota counter or clean up old data).

---

### Problem: User can't log in

**Cause 1**: Wrong password. The passwords are hashed (scrambled), so even we can't see them. The user must reset their password.

**Cause 2**: Their session was revoked (admin forced them to log out). They just need to log in again.

**Cause 3**: The Worker is down. Check health (Section 3).

---

### Problem: Signup returns "email already registered" (HTTP 409)

**Cause**: Someone already signed up with that email.

**Fix**: If it's the same person, they should log in instead. If it's a different person wanting the same email, that's not allowed — each email must be unique.

---

### Problem: Backend crashes on startup after enabling persistence

**Cause 1**: `WORKER_URL` is missing or has a typo.

**Fix**: Check that `WORKER_URL` is set correctly in the environment variables:
```
WORKER_URL=https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev
```
(Note: `https://`, not `http://`, no trailing slash.)

**Cause 2**: The Worker isn't deployed.

**Fix**: Deploy the Worker (Section 10), then restart the backend.

---

### Problem: I changed the Worker code but it's not taking effect

**Fix**: Run `npx wrangler deploy` again. Cloudflare may take 30-60 seconds to propagate the new version globally.

---

### Problem: I need to reset the database completely (delete everything)

**⚠️ Warning**: This permanently deletes ALL data — users, uploads, signals, everything.

```bash
npx wrangler d1 execute backtestbaba --remote --command "DROP TABLE IF EXISTS users"
npx wrangler d1 execute backtestbaba --remote --command "DROP TABLE IF EXISTS sessions"
npx wrangler d1 execute backtestbaba --remote --command "DROP TABLE IF EXISTS ingestion_log"
npx wrangler d1 execute backtestbaba --remote --command "DROP TABLE IF EXISTS uploads"
npx wrangler d1 execute backtestbaba --remote --command "DROP TABLE IF EXISTS signal_hashes"
npx wrangler d1 execute backtestbaba --remote --command "DROP TABLE IF EXISTS quota"
```

Then re-apply the migration (Section 11). This recreates the tables empty.

---

## 10. How to Redeploy the Worker

Do this whenever you:
- Changed the Worker code in `worker/src/index.js`
- Changed `worker/wrangler.toml`
- Need to reset a broken Worker

**Step 1**: Open a terminal in the project folder:

```bash
cd D:\AI\Stock Market\ChartInk\BacktestBaba\worker
```

**Step 2**: Deploy:

```bash
npx wrangler deploy
```

Wait for the green "Published" message. It takes about 20 seconds.

**Step 3**: Verify:

```bash
curl https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/health
```

(If `curl` is not available, paste this URL in a browser.)

---

## 11. How to Run a Database Migration

Do this when:
- We add a new table
- We change an existing table structure
- You're setting up the database from scratch

**Step 1**: Navigate to the worker folder:

```bash
cd D:\AI\Stock Market\ChartInk\BacktestBaba\worker
```

**Step 2**: Apply all pending migrations:

```bash
npx wrangler d1 migrations apply backtestbaba --remote
```

**Step 3**: Verify tables were created:

```bash
npx wrangler d1 execute backtestbaba --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected tables: `d1_migrations`, `ingestion_log`, `quota`, `sessions`, `signal_hashes`, `uploads`, `users`

---

## 12. Quick Reference Card

### URLs

| What | URL |
|------|-----|
| Worker (API) | `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev` |
| Worker health | `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/health` |
| Quota check | `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/quota` |

### Key Terminal Commands

```bash
# Deploy Worker
cd worker && npx wrangler deploy

# Run SQL query
npx wrangler d1 execute backtestbaba --remote --command "YOUR SQL HERE"

# Run SQL file
npx wrangler d1 execute backtestbaba --remote --file my_file.sql

# Apply migrations
npx wrangler d1 migrations apply backtestbaba --remote

# Export database
npx wrangler d1 execute backtestbaba --remote --command ".dump" > backup.sql
```

### Where to Find Things

| File | Purpose | Location |
|------|---------|----------|
| Worker code | The API endpoints for D1 | `worker/src/index.js` |
| Database schema | Table definitions | `worker/migrations/001_init.sql` |
| Worker config | Database ID, env vars | `worker/wrangler.toml` |
| Backend config | Persistence toggle, Worker URL | `backend/config.py` |
| Backend persistence code | How backend talks to Worker | `backend/persistence.py` |
| Operations guide | This document | `docs/OPERATIONS_GUIDE.md` |

### Database Tables (6)

| Table | What it stores | How many rows (typical) |
|-------|---------------|------------------------|
| `users` | User accounts and plan tiers | Same as number of users |
| `sessions` | Login tokens (auto-expire after 7 days) | ~1 per active user |
| `ingestion_log` | Audit trail of every file upload | ~10-100 per day |
| `uploads` | Metadata about each backtest run | ~10-100 per day |
| `signal_hashes` | Individual trade results (the big one) | ~100x uploads |
| `quota` | Monthly write counter (single row) | Always 1 |

---

## Appendix: When to Call for Help

| Scenario | What to do |
|----------|-----------|
| Worker returns 500 errors | Check if the database is connected. Run `npx wrangler d1 execute backtestbaba --remote --command "SELECT 1"` — if that fails, the database is down. Contact Cloudflare support. |
| Backend won't start | Check Render logs. Look for "PERSISTENCE_ENABLED" in the logs. If it says "WORKER_URL is not set", add the env var. |
| User data lost | We have no backups by default. Set up a daily cron job for Section 7 if this matters. |
| Quota exhausted | Reset the counter (Section 5) or upgrade the D1 plan in Cloudflare dashboard. |
| Someone deleted the database | Recreate it: `npx wrangler d1 create backtestbaba`, update `database_id` in `wrangler.toml`, re-apply migrations. Data is lost — no recovery. |
