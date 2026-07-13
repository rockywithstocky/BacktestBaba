**Project:** BacktestBaba (ChartChampion)
**Branch:** `feat/d1-persistence`
**Status:** Phase D (local persistence + sync) + Phase E (row_hash cache) complete

Production URLs:
- Frontend: https://chartchampion.vercel.app
- Backend API: https://backtestbaba-api.onrender.com
- Worker: https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev
- Swagger: https://backtestbaba-api.onrender.com/docs

## 1. Start Local Environment
```powershell
# Terminal 1 (Backend)
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 (Frontend)
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm run dev
```

## 2. Completed Work

### Phase A: Persistence ABC (merged to main)
- `persistence.py` ABC 5→9 methods + NaN guard + 46 tests
- `NullBackend` (no-op) + `D1WorkerBackend` (HTTP to Worker)

### Phase B: Backend integration (merged to main)
- `config.py` (+6 module-level vars: PERSISTENCE_ENABLED, WORKER_URL, etc.)
- `main.py` (+192 lines: validated init, synchronous persist, auth, admin, ingestion after cache check)
- D1 Worker deployed — 15 endpoints, 6 D1 tables, batch chunked at 100

### Phase C: Frontend auth + admin (merged to main)
- `services/auth.js` — login/signup/validate/logout/isAdmin with token persistence
- `services/admin.js` — listUsers, setPlan, revokeSessions, getQuota
- `LoginPage.jsx`, `SignupPage.jsx`, `AdminPage.jsx` — real API, error display
- `App.jsx` — `/dashboard/admin` route, `ProtectedRoute`
- `Navbar.jsx` — admin shield link, proper logout
- `backend/main.py` — `/api/quota` proxy, auth endpoints, admin proxies

### Phase D: IndexedDB + client sync (current branch)
- `services/db.js` — IndexedDB wrapper: saveReport, getReport, listReports, deleteReport
- `services/sync.js` — IndexedDB save (D1 sync removed — backend already persists server-side)
- `api.js` — wires syncReport after WS complete + HTTP fallback
- `BacktesterPage.jsx` — Previous Reports list, confirm on back, refresh on backtest complete
- **Bugfix**: no auto-load report on nav (always shows upload page first)
- **Bugfix**: confirm dialog only for fresh runs (skipped for already-saved reports)

### Phase E: Row-hash cache (current branch)
- `backend/config.py` — `ROW_HASH_TTL = 2592000` (30d)
- `backend/core/data_provider.py` — `get_cached_result()` / `set_cached_result()` via diskcache
- `backend/core/backtester.py` — Phase C checks SHA256(symbol|date|entry_mode|duration) before yfinance call; caches result dict after computation. Re-running same CSV = instant.
- All 53 tests pass.

## 3. Files Changed (this branch)

| File | Change |
|------|--------|
| `.gitignore` | +Data/ChartInk/*.csv, +worker/node_modules/ |
| `backend/config.py:67` | +`ROW_HASH_TTL` |
| `backend/core/data_provider.py:182-188` | +get_cached_result / set_cached_result |
| `backend/core/backtester.py:4,304-420` | +row_hash check in Phase C |
| `frontend/src/services/db.js` | NEW — IndexedDB wrapper |
| `frontend/src/services/sync.js` | NEW — IndexedDB save (no D1 proxy) |
| `frontend/src/services/api.js` | +syncReport import + calls |
| `frontend/src/services/auth.js` | Better login error handling |
| `frontend/src/pages/BacktesterPage.jsx` | Previous Reports list, confirm dialog, refresh on complete |

## 4. Next Steps
1. Deploy branch to Vercel + Render for live testing
2. Phase F: Dual-stage row_hash for resolution phase (skip SymbolResolver for cached signals)
3. Phase G: Admin dashboard — signal usage stats, per-user quota management

## 5. Testing
```powershell
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
pytest tests/ -v --asyncio-mode=auto          # 53/53 pass

cd "D:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm run build                                  # Compiles clean
```

## 6. Pre-existing Issues
- `verify_regression.py` has 0.01 floating-point noise between bulk/sequential modes
- `test_integration.py` calls non-existent `Backtester.run_backtest` (should be `run_backtest_async`)
- Pydantic v2 `.dict()` deprecation warnings (pre-existing)
