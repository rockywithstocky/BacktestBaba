# BacktestBaba — Work State (2026-07-16)

**Branch:** `feat/pg-persistence`  
**Status:** PostgreSQL persistence — COMPLETE AND VERIFIED  
**Next:** Frontend polish + backlog items below

---

## 0. Local Environment (Docker Compose)

```powershell
cd "D:\AI\Stock Market\ChartInk\BacktestBaba"
docker compose up -d --build    # Start all 4 services
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

## 1. Completed This Session (Jul 16, 2026)

### Infrastructure (Docker Compose)
- [x] PostgreSQL 16 service with healthcheck, persistent `pg_data` volume
- [x] `schema.sql` mount to `/docker-entrypoint-initdb.d/01-schema.sql` for auto-init
- [x] pgAdmin 4 GUI on port 8080 with `pgadmin_data` volume
- [x] Backend connects to `postgres` hostname via Docker network (`DATABASE_URL`)
- [x] `PERSISTENCE_ENABLED=true` in compose env
- [x] Compose config parses cleanly, all containers healthy

### Backend Fixes
- [x] **`batch_resolve` bug** (`symbol_resolver.py`): Pre-suffixed symbols (`.NS`/`.BO`) were appended with another suffix (e.g. `RELIANCE.NS.NS`). Split resolution path: pre-suffixed → check as-is, bare → try `.NS` then `.BO`.
- [x] **`schema.sql` seed data** (`schema.sql`): `INSERT INTO quota` specified `id` on `GENERATED ALWAYS AS IDENTITY` column. Removed explicit `id` from insert, uses `SELECT 0, 1000000 WHERE NOT EXISTS`.
- [x] **PostgresBackend circuit breaker operational**: 3 failures → NullBackend for 60s.
- [x] **Backend logs**: "PostgreSQL persistence backend initialized (pool: 1–5)"

### Frontend Fixes
- [x] **Capital input frozen at 0** (`Dashboard.jsx`):
  - Changed `useState(0)` → `useState('')` (shows placeholder "Capital")
  - Added `isNaN` guard in onChange handler
  - Added `localStorage` persistence (`backtest_capital` key)
  - `onBlur` auto-fills ₹1,00,000 if left empty

### Admin Setup
- [x] Account `test@test.com` / `TestPass123!` registered and promoted to admin
- [x] Admin panel at `/dashboard/admin` (users table, plan toggle, session revoke)

### E2E Verification
- [x] API login works: `POST /api/auth/login` returns token with `is_admin: true`
- [x] Backtest via API: 2/2 success (RELIANCE.NS, TCS.NS)
- [x] PostgreSQL persistence: `ingestion_log` (1), `uploads` (1), `signal_hashes` (2 records)
- [x] All 59/59 tests pass

---

## 2. Known Issues / Backlog

### High Priority
| ID | Issue | Location | Est. Effort |
|----|-------|----------|-------------|
| B1 | Auth component doesn't refresh `is_admin` after promotion — requires re-login | Frontend `auth.js` / `localStorage` | 1h |
| B2 | `uploads.status` stays `pending` after signals saved — should be `completed` | `backend/main.py:_persist_upload()` | 30m |
| B3 | No frontend unit test runner configured — can't verify Dashboard calculations | Frontend infra | 4h |
| B4 | `verify_regression.py` has 0.01 floating-point noise between bulk/sequential | `backend/tests/verify_regression.py` | 1h |

### Medium Priority
| ID | Issue | Location | Est. Effort |
|----|-------|----------|-------------|
| M1 | Pydantic v2 `.dict()` deprecation warnings across models | `backend/models/schemas.py` + usage | 2h |
| M2 | `capitalReturn` column in Dashboard stats table still labeled "Avg Profit/Trade" (confusing) | `frontend/src/components/Dashboard.jsx` | 30m |
| M3 | No `symbol_freshness` table queried — gapfill readiness column exists but unused | `backend/persistence.py` | 2h |
| M4 | Cache info (`bulk_hits`, `row_hash_misses`) not exposed in API response yet | `backend/core/backtester.py` + models | 3h |

### Low Priority
| ID | Issue | Location | Est. Effort |
|----|-------|----------|-------------|
| L1 | Node 18 in Dockerfile — Vite 7 requires Node 20.19+; build warns but succeeds | `Dockerfile.frontend` | 30m |
| L2 | Chrome console: `[WS] Closed: 1005` after backtest complete (benign) | Frontend `api.js` | 1h |
| L3 | Copyright year hardcoded to 2024 in landing page footer | `LandingPage.jsx` | 5m |
| L4 | Console logs remaining in `api.js` (WS connection) and `sync.js` (IndexedDB) | `frontend/src/services/` | 15m |

---

## 3. Architecture Decisions

| Decision | Detail |
|----------|--------|
| **Docker-only for local dev** | 4 containers: postgres, backend, frontend, pgadmin. Native `npm run dev`/`uvicorn` still works with `PERSISTENCE_ENABLED=false` |
| **PostgresBackend over D1WorkerBackend** | Local dev uses PostgreSQL; Render production would use D1WorkerBackend if `is_render()` returns True |
| **App/infra separation** | `schema.sql` init via Docker entrypoint, not app code. Backend connects via `DATABASE_URL` env var |
| **pgAdmin over Adminer** | Full-featured GUI with tree view, ERD, query builder. 200MB vs 5MB, but better UX |
| **Circuit breaker pattern** | 3 consecutive PG failures → silence for 60s. `statement_timeout=3000` on every query |

---

## 4. Quick Resume Commands

```powershell
# Start everything
docker compose up -d --build

# Run tests inside backend container
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto

# View backend logs
docker compose logs -f backend

# Access PostgreSQL
docker compose exec postgres psql -U backtest -d backtestbaba

# Promote a user to admin
docker compose exec postgres psql -U backtest -d backtestbaba -c "UPDATE users SET is_admin=TRUE, plan='priority', max_signals=5000, max_file_size_mb=10 WHERE email='user@email.com';"

# Rebuild just one service
docker compose up -d --build frontend
```
