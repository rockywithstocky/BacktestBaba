# BacktestBaba — Work State (2026-07-18)

**Branch:** `feat/d1-persistence` (ahead of origin by 2 commits)
**Status:** Latest Return N/A fix — COMPLETE AND VERIFIED
**Next:** Push to `main` → auto-deploy to Render + Vercel
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

## 1. Completed This Session (Jul 18, 2026)

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

## 4. Known Issues / Backlog

| ID | Issue | Location | Priority |
|----|-------|----------|----------|
| L3 | Copyright year hardcoded to 2024 in landing page footer | `LandingPage.jsx` | Low |
| P1 | Account deletion API (pre-mortem item) | Not implemented | Tracked |
| R5 | D1WorkerBackend stubs for 9 new methods | `persistence.py` | Must implement before Render deploy w/ persistence |

---

## 5. Quick Resume Commands

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
