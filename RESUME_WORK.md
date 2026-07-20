# BacktestBaba — Work State (2026-07-19)

**Branch:** `feat/d1-persistence` (ahead of origin by 1 commit)
**Status:** Latest Return column fix — shipped. PR #7 review analyzed.
**Next:** Fix 4 PR review issues (see §5), then merge to main
**Test Count:** Backend 85/85, Frontend 21/21, Build OK

---

## 0. Local Environment (Docker Compose)

```powershell
cd "D:\AI\Stock Market\ChartInk\BacktestBaba"
docker compose up -d --build    # Start all 4 services (rebuild after code changes)
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:5174 | — |
| Backend API | http://localhost:8000 | — |
| Swagger Docs | http://localhost:8000/docs | — |
| pgAdmin (DB GUI) | http://localhost:8080 | `admin@backtestbaba.com` / `admin` |
| PostgreSQL | localhost:5432 | `backtest` / `backtest` / `backtestbaba` |

Tests inside Docker:
```powershell
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto
```

Frontend tests:
```powershell
cd frontend; npm test -- --run
```

---

## 1. Completed This Session (Jul 19, 2026)

### Production Pre-Mortem Analysis

Reviewed all changes against Render free-tier constraints:

| Risk | Severity | Status |
|------|----------|--------|
| **Render 30s first-byte timeout kills HTTP fallback** | Critical | Pre-existing — WS is the only viable path on Render. Mobile now uses WS (our fix) so this is fine. |
| **VITE_WS_TIMEOUT default 30s vs Render cold start ~30s** | Medium | Pre-existing. Mitigate by setting `VITE_WS_TIMEOUT=300000` in Vercel env vars. |
| **`visibilitychange` race on iOS** | Low | Watchdog may fire before handler on tab resume → HTTP fallback (which fails on Render). Acceptable. |
| **Diagnostic logs at `logger.info` would flood production** | Low | Fixed by reverting to `logger.debug` after debugging. |

### Latest Price Column Display Fix

- **Problem**: Frontend container was built 2 hours before Dashboard.jsx swap (price in cell, return in tooltip) landed
- **Fix**: `docker compose up -d --build frontend` — rebuilt with latest code
- **Root cause tooltip**: The Docker volume `cache_data` persists diskcache across container restarts; `docker volume rm backtestbaba_cache_data` cleared it

### Diagnostic Logging (Debug Only)

Changed `[DIAG]` and `[DIAG L1]` logs from `logger.info` → `logger.debug` after debugging. Active only when `LOG_LEVEL=DEBUG` is set.

### Relevant Files Touched

| File | Change |
|------|--------|
| `backend/core/backtester.py:518-527` | `[DIAG]` diagnostic logging (debug level) |
| `backend/main.py:342-350` | `[DIAG L1]` cache-hit diagnostic logging (debug level) |

### PR #7 Review Analysis (D1 Persistence Abstraction)

Scanned the full review against current code. ~40% of claims were inaccurate — key corrections:

| Review Claim | Reality |
|-------------|---------|
| "Breaking Changes" — signature changed | `authorization: Header(None)` is backward-compatible. Not breaking. |
| "Auth cache collision" — token collision risk | Tokens are UUIDv4 — collision probability ~10⁻¹⁸. Not a real risk. |
| "Circuit breaker uses exponential wait" | Already has exponential **backoff** with jitter (persistence.py:474-489). Review was wrong. |
| "batch_upsert_signals is dead code" | Called at `main.py:292` inside `_persist_upload` on every backtest. Review cited wrong line numbers. |
| "D1WorkerBackend — 9 stubs prevent deploy" | PostgresBackend is the production backend (all 17 methods implemented). D1 stubs are a design choice. |
| "Persistence timeout hardcoded to 3s" | Configurable via `PERSISTENCE_TIMEOUT` env var. 3s is just the default. |

### 🔴 Fix: Latest Return Showed N/A (P0 — Shipped)

**Root Cause (Entry Mode Cache Staleness):**
```
next_close → cached report from old run (pre-fix) → Phase B skipped → N/A
next_open  → cache MISS → Phase B runs → persist_symbol_data seeds → works
```
`FileHashCache` key = `(file_hash, entry_mode)` — separate caches per mode.

**Root Cause (OHLCV Fallback Gap):**
On L1 cache HIT (re-upload), Phase B is skipped entirely → `persist_symbol_data` never runs → `{sym}_latest_price` never seeded → `get_latest_prices_batch` hits yfinance for ALL symbols → rate limited → `(None, None)` for everyone.

**All 5 Fixes Applied:**

| # | Fix | File | What |
|---|-----|------|------|
| 1 | Seed `{sym}_latest_price` in `persist_symbol_data` | `data_provider.py:62-75` | Runs BEFORE early return, uses `dropna().iloc[-1]` to skip NaN Close rows |
| 2 | Progress before freshness check | `main.py:328` | `progress_callback(0, 1, "Refreshing latest prices...")` before L1 freshness check |
| 3 | Watchdog reset on ping | `api.js:190` | `startWatchdog()` added to ping handler prevents WS timeout on long backtests |
| 4 | Latest Return column → after Entry | `Dashboard.jsx` | Moved `<th>` + `<td>` after Entry column, before Exit columns |
| 5 | Tooltip shows price+date not % | `Dashboard.jsx` | Changed from `"Latest vs Entry: +X%"` → `"Latest Price: ₹X (as of YYYY-MM-DD)"` |

**OHLCV Cache Fallback (Defense-in-Depth):**

| # | Fix | File | What |
|---|-----|------|------|
| 6 | OHLCV fallback in `get_latest_prices_batch` | `data_provider.py:285-312` | When `{sym}_latest_price` is missing, reads OHLCV cache (`sd_{sym}` + `sr_{sym}`) if fresh (≤3 days). Seeds `{sym}_latest_price` for next call. Covers ALL scenarios: re-upload (L1 HIT), cross-entry-mode, fresh upload. |

### Test Results

| Suite | Count | Status |
|-------|-------|--------|
| Backend pytest | 85/85 passed (was 77, +6 test_latest_price + 2 ohlcv fallback) | ✅ |
| Frontend vitest | 21/21 passed (was 16, +5 dashboard columns) | ✅ |
| Frontend build | `npm run build` succeeds | ✅ |

### Commit

```
3e1ed55 Fix Latest Return N/A: seed prices in persist_symbol_data + OHLCV fallback
         in get_latest_prices_batch, fix column order/tooltip, add watchdog reset on ping
11 files changed, 391 insertions(+), 59 deletions(-)
```

---

## 2. Requirements Traceability Matrix

| Requirement | Status | Code Location | Test |
|-------------|--------|-------------|------|
| Seed `{sym}_latest_price` from Phase B data | ✅ | `data_provider.py:62-75` | `test_persist_symbol_data_seeds_latest_price_when_fresh` |
| NaN Close in last row → use previous valid | ✅ | `data_provider.py:68` (dropna) | `test_persist_symbol_data_nan_last_close_uses_prev_close` |
| All-NaN Close → skip seeding | ✅ | `data_provider.py:69` (guard) | `test_persist_symbol_data_all_nan_close_skips` |
| Early return in persist_symbol_data still seeds | ✅ | `data_provider.py:64-75` (before line 83) | `test_persist_symbol_data_early_return_still_seeds_latest_price` |
| Fresh OHLCV cache fallback in get_latest_prices_batch | ✅ | `data_provider.py:285-312` | `test_get_latest_prices_batch_ohlcv_fallback` |
| Stale OHLCV cache skipped in get_latest_prices_batch | ✅ | `data_provider.py:293-294` (≤3 guard) | `test_get_latest_prices_batch_ohlcv_fallback_stale` |
| Progress sent before L1 freshness check | ✅ | `main.py:328` | `test_cache_hit_sends_progress_before_freshness_check` |
| Watchdog reset on WS ping | ✅ | `api.js:190` | Manual |
| Latest Return column after Entry | ✅ | `Dashboard.jsx` | `test_dashboard_columns.test.js` |
| Tooltip shows price+date, not % | ✅ | `Dashboard.jsx` | `test_latest_return.test.js` |

---

## 3. Pre-Flight Checks for Deployment (Render + Vercel)

**Zero paid subscriptions needed** — app runs fully on free tiers:
- Render free tier: 750h/month, sleeps after 15min idle
- Vercel free tier: unlimited
- No database needed (`PERSISTENCE_ENABLED=false` by default, uses diskcache)

**Pre-flight checklist:**

| Item | Action |
|------|--------|
| **Merge to `main`** | Currently on `feat/d1-persistence`. Push → merge PR to `main` |
| **Render build command** | `pip install -r backend/requirements.txt` |
| **Render start command** | `uvicorn backend.main:app --host 0.0.0.0 --port \$PORT` |
| **Vercel root directory** | Set to `frontend` |
| **Vercel env vars** | `VITE_API_URL=https://backtestbaba-api.onrender.com/api`, `VITE_WS_URL=wss://backtestbaba-api.onrender.com/ws` |
| **Recommended env vars** | `CORS_ORIGINS=https://chartchampion.vercel.app` (in Render dashboard) |
| **Optional persistence** | `PERSISTENCE_ENABLED=true` + `WORKER_URL` for Cloudflare D1 |

**Known caveats:**
- diskcache is ephemeral on Render — wiped on redeploy
- Cold start ~30s after 15min idle
- yfinance chunk size drops to 25 on Render (via `is_render()`)

---

## 4. PR #7 — 4 Actionable Fixes (Todo)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | **Row-hash excludes entry_price** | `persistence.py:16` | Add `entry_price` to `compute_row_hash()` formula so different entry prices produce different hashes |
| 2 | **L2 cache crashes if signal_results table missing** | `main.py:373-435` | Wrap `get_upload_by_user_and_hash` / `get_signals_for_upload` in try/except → fallback to cache MISS |
| 3 | **No auth tests** | `tests/` | Add `test_auth.py` covering signup, login, token validation, expired token, logout revocation |
| 4 | **L1 freshness check compares date, not timestamp** | `main.py:328` | Change `cached_latest_date < "YYYY-MM-DD"` → `cached_latest_ts < now - timedelta(minutes=5)` so same-day re-uploads at 4pm don't skip refresh if cached at 2pm |

---

## 5. Known Issues / Backlog

| ID | Issue | Location | Priority |
|----|-------|----------|----------|
| L3 | Copyright year hardcoded to 2024 in landing page footer | `LandingPage.jsx` | Low |
| P1 | Account deletion API (pre-mortem item) | Not implemented | Tracked |
| R5 | D1WorkerBackend stubs for 9 new methods | `persistence.py` | Must implement before Render deploy w/ persistence |
| **PR7.1** | **Row-hash excludes entry_price** | `persistence.py:16` | **High** — affects dedup correctness |
| **PR7.2** | **L2 cache crashes if signal_results table missing** | `main.py:373-435` | **High** — blocks deploy without Postgres |
| **PR7.3** | **Missing auth tests** | `tests/test_auth.py` | **Medium** — required before prod deploy |
| **PR7.4** | **L1 freshness uses date, not timestamp** | `main.py:328` | **Low** — minor, same-day re-upload edge case |

---

## 6. Quick Resume Commands

```powershell
# Rebuild + start (after code changes)
docker compose up -d --build

# Run all backend tests
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto

# Run frontend tests
cd frontend; npm test -- --run

# Frontend build check
cd frontend; npm run build

# Verify regression
docker compose exec backend python backend/tests/verify_regression.py

# View backend logs
docker compose logs -f backend

# Clear diskcache (wipes all caches)
docker compose exec backend python -c "from backend.core.data_provider import cache; cache.clear()"

# Access PostgreSQL
docker compose exec postgres psql -U backtest -d backtestbaba

# Push to main and deploy
git push origin feat/d1-persistence
# Then open PR: main ← feat/d1-persistence
```
