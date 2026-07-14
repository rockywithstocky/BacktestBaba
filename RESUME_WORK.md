**Project:** BacktestBaba (ChartChampion)
**Branch:** `feat/d1-persistence` → `feat/pg-persistence` (new)
**Status:** Planning complete for Phase 1 — PostgreSQL persistence. See `docs/ai/PHASE1_PLAN.md`.

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

### Previously done (Phases A-E)
- Phase A: Persistence ABC (5→9 methods) + NullBackend + D1WorkerBackend
- Phase B: Backend integration (config, main.py wiring, auth, admin, ingestion)
- Phase C: Frontend auth + admin (login, signup, admin, Navbar)
- Phase D: IndexedDB + client-side report sync
- Phase E: Row-hash cache (diskcache per-signal dedup)
- All 53+ tests pass.

### Current session (Jul 14, 2026)
- Analyzed existing caching architecture (3 layers: FileHashCache, diskcache per-symbol, row-hash)
- Identified FileHashCache limitation: 30d TTL, no smart refresh on re-upload
- Designed gapfill architecture for Phase 2 (bulk yfinance + append to diskcache)
- Fixed ABC return type for `list_uploads`: `list[dict]` → `dict` with `{results, total}`
- Identified 7 `isinstance` guards in `main.py` needing polymorphic replacement
- Documented full Phase 1 plan: 10 tasks with verification steps
- **No code developed** — planning only

## 3. Active Plan: Phase 1 — PostgreSQL Persistence

See [`docs/ai/PHASE1_PLAN.md`](docs/ai/PHASE1_PLAN.md) for full task list with verification steps.

**Summary (10 tasks):**

| # | Task | Verification |
|---|------|-------------|
| 1 | Commit 4 Docker fixes | `docker compose up --build` starts clean |
| 2 | Fix ABC return types (`list_uploads`) | All pytest pass |
| 3 | Add 6 auth/admin ABC methods | New NullBackend tests pass |
| 4 | Replace 7 `isinstance` guards with polymorphic calls | Auth + admin endpoints work |
| 5 | Create `backend/schema.sql` (PG port of D1 schema) | SQL parses in psql |
| 6 | Add `DATABASE_URL` + `is_render()` selection logic | Correct backend selected per env |
| 7 | Create `PostgresBackend` class with all 17 methods | All persistence tests pass |
| 8 | Add PostgreSQL service to Docker Compose | `pg_isready` returns OK |
| 9 | Update `.env.local` | Backend logs "PostgreSQL initialized" |
| 10 | Verify end-to-end (pytest + Docker smoke test + upload history + auth) | Full integration green |

**Phase 2 (deferred):** Smart refresh — kill cross-session FileHashCache, add `bulk_gapfill` to DataProvider, add `get_report_by_hash`/`update_signal` to persistence.

## 4. How to Check Work Status
Ask: "check workstatus" → I'll show the task table above with completion status.

## 5. Architecture Decisions (Recorded)

| Decision | Detail |
|----------|--------|
| Gapfill lives in DataProvider | Not a separate file — 2 new static methods, ~50 LOC |
| `is_render()` is the switch | `True` → D1WorkerBackend (Render), `False` → PostgresBackend (local Docker) |
| No `version: '3.8'` in compose | Already removed; schema version implicit in Compose v2+ |
| FileHashCache stays in Phase 1 | Smart refresh is Phase 2 work |
| Auth cache stays in-memory | 60s TTL dict in `main.py`; uses `auth_validate` ABC call |

## 6. Testing
```powershell
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
pytest tests/ -v --asyncio-mode=auto

cd "D:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm run build
```

## 7. Pre-existing Issues
- `verify_regression.py` has 0.01 floating-point noise between bulk/sequential modes
- `test_integration.py` calls non-existent `Backtester.run_backtest` (should be `run_backtest_async`)
- Pydantic v2 `.dict()` deprecation warnings (pre-existing)
