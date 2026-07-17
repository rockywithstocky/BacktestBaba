# BacktestBaba — Work State (2026-07-17)

**Branch:** `feat/pg-persistence`
**Status:** Latest Return (Phase 1) — COMPLETE AND VERIFIED
**Next:** Master Storage (Phase 2) — schema + cache orchestration ready, WS auth plumbed
**Test Count:** Backend 77/77, Frontend 16/16, verify_regression SUCCESS, Build OK

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

---

## 1. Completed This Session (Jul 17, 2026)

### 🔴 Phase 1: Latest Return Column (P0 — Shipped)

**Backend (`backend/`)**

| What | Files Changed | Detail |
|------|--------------|--------|
| `latest_price`, `latest_price_date`, `latest_price_return` on SignalResult | `models/schemas.py` | 3 new Optional[float/str] fields |
| `latest_price_date`, `cache_source` on BacktestReport | `models/schemas.py` | Report-level date aggregation + cache source tracking |
| `get_latest_prices_batch(symbols)` | `core/data_provider.py` | Bulk yf.download(period="5d") + per-symbol fallback + 5min diskcache |
| `check_and_set_refresh(symbol)` | `core/data_provider.py` | Diskcache-level thundering herd guard |
| Latest price integration after Phase C | `core/backtester.py` | Computes latest_price_return with `entry_price > 0` guard |
| L1 freshness check on cache hit | `main.py` | Background refresh if `latest_price_date < today` |
| `cache_source` tracking (`l1_diskcache` / `l2_db` / `l3_compute`) | `main.py` | Set at end of each cache path |
| `FileHashCache.delete()` | `storage.py` | New method for L2→L1 cache invalidation |

**Frontend (`frontend/src/`)**

| What | Files Changed | Detail |
|------|--------------|--------|
| "Latest Return" sortable column | `components/Dashboard.jsx` | After 3 Month Return, uses `getColorClass` + `formatPercent` |
| Removed "Mode" column | `components/Dashboard.jsx` | Header + body cell deleted |
| Clean "Trade Log" header | `components/Dashboard.jsx` | Removed hint text span |
| Stale price disclaimer | `components/Dashboard.jsx` | "Prices may be delayed" below pagination |
| WS token plumbing (`?token=xxx`) | `services/api.js` | getToken() added to WS URL, HTTP, mobile fallback |

**Master Storage Schema (Phase 2 ready)**

| What | Files Changed | Detail |
|------|--------------|--------|
| 4 new tables + 3 indexes | `schema.sql` | `resolved_symbols`, `symbol_data_freshness` (with `idx_sdf_refresh`), `file_upload_map`, `signal_results` |
| 9 new ABC methods | `persistence.py` | All 4 backends: `get_upload_by_user_and_hash`, `get_signals_for_upload`, `batch_upsert_signals` (multi-row INSERT, 30s timeout), `get_resolved_symbols`, `set_resolved_symbols`, `get_symbol_freshness_batch`, `batch_update_latest_prices`, `get_upload_status`, `set_ingestion_user` |

**Auth & User Plumbing**

| What | Detail |
|------|--------|
| WS token validation | `?token=` query param → `_validate_token()` → user.id → 4001 on invalid |
| HTTP token validation | `Authorization: Bearer` header → optional, falls back to anonymous |
| Anonymous guest mode | No token → `user_id = "anonymous"` → L3-only access |
| user_id threading | Through `_handle_backtest()` + `_persist_upload()` + dual-write to `signal_results` |

### Agent Delegation Log
- Agent A (Backend Core): schemas.py, data_provider.py, backtester.py, storage.py ✅
- Agent B (Frontend Dashboard): Dashboard.jsx ✅
- Agent C (Storage Schema): schema.sql, persistence.py ✅
- Agent D (Frontend Auth): api.js ✅
- Agent E (main.py orchestration): WS/HTTP auth, L1/L2/L3 cache, lifespan migration ✅
- Agent F (Test files): test_latest_price.py, test_master_storage.py, test_latest_return.test.js ✅

### Test Results
| Suite | Count | Status |
|-------|-------|--------|
| Backend pytest | 77/77 passed | ✅ |
| Frontend vitest | 16/16 passed (7 Dashboard + 9 Latest Return) | ✅ |
| Frontend build | `npm run build` succeeds | ✅ |
| verify_regression | "SUCCESS: Both methods produced exactly identical reports!" | ✅ |

### Spec Documents (Amended)
- `docs/decisions/ADR-002-master-storage.md` — V2: Phase 1/Phase 2 split, mid-day handling, review findings
- `docs/specs/SPEC_MASTER_STORAGE.md` — V2: Latest Return #1, mid-day edge case table, chronological ordering
- `docs/specs/TASK_MASTER_STORAGE.md` — V2: 3-phase Kaizen, 29h total, independent ship gates
- `docs/specs/VERIFICATION_MASTER_STORAGE.md` — V2: Scenario 2 (mid-day), Scenario 3 (yfinance failure)

---

## 2. Requirement Traceability Matrix

| Spec Requirement | Status | Code Location | Test |
|-----------------|--------|-------------|------|
| Latest Return column in TradeLog | ✅ | `Dashboard.jsx:475-477, 516-521` | `test_latest_return.test.js` |
| `latest_price_return = ((price - entry) / entry) * 100` | ✅ | `backtester.py:503-523` | `test_latest_price.py:test_latest_price_return_*` |
| Mid-day handling: last COMPLETE daily bar | ✅ | `data_provider.py:get_latest_prices_batch()` | `test_latest_price.py:test_mid_day_date_not_future` |
| yfinance failure → None (no crash) | ✅ | `data_provider.py:get_latest_prices_batch()` try/except | `test_latest_price.py:test_get_latest_prices_batch_nonexistent` |
| `entry_price=0` → no div by zero | ✅ | `backtester.py:latest_price_return` guard | `test_latest_price.py:test_latest_price_return_zero_entry` |
| `latest_price_date` on report + per-trade | ✅ | `schemas.py:46-48, 81-82` | `test_latest_price.py:test_report_latest_price_date` |
| `cache_source` tracking | ✅ | `main.py:_handle_backtest` all 3 paths | `test_latest_price.py:test_cache_source_field` |
| Remove Mode column | ✅ | `Dashboard.jsx:465-467, 493-497 deleted` | Visual |
| Clean "Trade Log" header | ✅ | `Dashboard.jsx:423` | Visual |
| Stale price disclaimer | ✅ | `Dashboard.jsx:541-545` | Visual |
| WS token auth | ✅ | `main.py:websocket_endpoint` | Manual: invalid token → 4001 |
| HTTP token auth | ✅ | `main.py:run_backtest_endpoint` | Manual |
| Anonymous guest mode | ✅ | `main.py:websocket_endpoint` user_id="anonymous" | Manual |
| 4 new DB tables | ✅ | `schema.sql:106-166` | N/A (schema) |
| 9 new persistence methods | ✅ | `persistence.py` all 4 classes | `test_master_storage.py` |
| `batch_upsert_signals` multi-row INSERT | ✅ | `persistence.py:PostgresBackend` | `test_master_storage.py` |
| `next_refresh_at` initialized to NOW()-1 day | ✅ | `schema.sql:121` | N/A (schema) |
| `idx_sdf_refresh` index | ✅ | `schema.sql:128` | N/A (schema) |
| `ingestion_log.user_id` linkage | ✅ | `persistence.py:set_ingestion_user` | `test_master_storage.py` |
| `FileHashCache.delete()` method | ✅ | `storage.py:49-55` | N/A (used by main.py) |
| `deepdiff` dependency | ✅ | `requirements.txt:52` | `verify_regression.py` |

---

## 3. Known Issues / Backlog (Remaining)

| ID | Issue | Location | Priority |
|----|-------|----------|----------|
| L3 | Copyright year hardcoded to 2024 in landing page footer | `LandingPage.jsx` | Low |
| P1 | Account deletion API (pre-mortem item) | Not implemented | Tracked |
| R5 | D1WorkerBackend stubs for 9 new methods | `persistence.py` | Must implement before Render deploy |

---

## 4. Next Steps (Phase 2 — Master Storage)

| Step | What | Est. |
|------|------|------|
| 1 | Deploy Phase 1 (Latest Return) to production | — |
| 2 | Implement L2 cache orchestration in `_handle_backtest` | Already wired (test with PG) |
| 3 | Implement L3 partial cache (resolved_symbols + symbol_data_freshness) | Already wired (test with PG) |
| 4 | Thundering herd E2E test via concurrent requests | 2h |
| 5 | Dual-write migration test (signal_hashes == signal_results) | 1h |
| 6 | Implement D1WorkerBackend real endpoints for 9 new methods | 4h |
| 7 | Pre-mortem closure (Scenario F concurrent, Scenario G partial crash) | 3h |

---

## 5. Quick Resume Commands

```powershell
# Rebuild + start (after code changes)
docker compose up -d --build

# Run all tests
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto

# Run frontend tests + build
cd frontend; npm run test; npm run build

# Verify regression
docker compose exec backend python backend/tests/verify_regression.py

# View backend logs
docker compose logs -f backend

# Access PostgreSQL
docker compose exec postgres psql -U backtest -d backtestbaba
```
