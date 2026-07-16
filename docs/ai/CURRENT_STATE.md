# Current System Architecture (2026-07-16)

## Core Tech Stack
- **Backend**: FastAPI (Python 3.11), yfinance 0.2.66, Pandas, diskcache, asyncpg, Pydantic v2
- **Frontend**: React 19, Vite 7, TailwindCSS v4, Recharts 3, Framer Motion, lucide-react, lightweight-charts
- **Infrastructure**: Docker Compose (local dev) — PostgreSQL 16 + pgAdmin 4. Render.com (backend hosting) + Vercel (frontend) + Cloudflare Workers + D1 (production).
- **Communication**: REST (`POST /api/backtest`) + WebSocket (`WS /ws/backtest` with progress streaming).

---

## 1. Calculation Engine (Backtester)
- **Horizons**: 6 distinct windows: `[7, 14, 30, 45, 60, 90]` days.
- **Concurrency**: `asyncio.to_thread` wraps all yfinance calls to prevent event-loop starvation.
- **Progress**: Phase A (0-50% — resolution), Phase B (50% mark — fetch), Phase C (50-100% — computation).
- **Throttling**: `PROGRESS_THROTTLE_EVERY_N` config to reduce WebSocket message flood.
- **Metadata Semaphore**: `asyncio.Semaphore(10)` with `asyncio.wait_for(..., timeout=10)` to prevent hangs.
- **Timedelta precomputed**: `timedelta(days=duration+10)` hoisted outside loops.

## 2. Data Fetching (Symbol Resolution + OHLCV)
- **Phase A (Resolution)**: `SymbolResolver` with 2-layer cache (in-memory per request + diskcache 24h). `batch_resolve` handles both pre-suffixed (`.NS`/`.BO`) and bare symbols. `_resolve_uncached` tries `.NS` → `.BO` fallback.
- **Phase B (Bulk Fetch)**: Single `yf.download(group_by='ticker')` → MultiIndex DataFrame (n≥2) or flat Index (n=1). Diskcache 24h for bulk results.
- **Phase C (Fallback)**: Per-symbol sequential `yf.Ticker().history()` if symbol missing from bulk response.

## 3. Enrichment Layer (Metadata)
- **Fields**: `sector` + `marketCap` from `yf.Ticker(symbol).info`.
- **Strategy**: Concurrent `asyncio.gather` bounded by Semaphore(10), 10s timeout.
- **Caching**: 7-day TTL diskcache. Failures not cached (retry next time).
- **Graceful degradation**: Exceptions logged as `[ENRICHMENT ERROR]`, default to `{"sector": None, "marketCap": None}`.

## 4. Frontend Architecture
- **Navbar**: `sticky top-0`, flex layout: brand → nav links (Dashboard, Admin if `is_admin`) → auth buttons.
- **Dashboard.jsx** (~530 lines): Owns all state (trades, stats, capital, pagination). 6 summary cards, 6-horizon stats table, paginated trade table with sort/search.
- **StockChartModal**: 4 chart types (Area/Line/Bar via Recharts, Candlestick via lazy-loaded lightweight-charts). Hero return + 4-card stats grid.
- **Backend**: `GET /api/prices/{symbol}` returns daily OHLCV from diskcache-backed `get_ticker_data()`.
- **Capital input**: localStorage-persisted, starts empty (placeholder shown), auto-fills ₹1,00,000 on blur if empty. NaN-guarded onChange.

## 5. Persistence Layer (PostgreSQL + D1)

### Local Dev (Docker)
- **Backend**: `PostgresBackend` via asyncpg pool (min=1, max=5).
- **Database**: PostgreSQL 16 Alpine with 6 tables: `users`, `sessions`, `ingestion_log`, `uploads`, `signal_hashes`, `quota`.
- **Circuit breaker**: 3 consecutive failures → NullBackend for 60s. `statement_timeout=3000` on all queries.
- **Schema init**: Mounted to `docker-entrypoint-initdb.d/` for first-run auto-bootstrap.
- **Adminer GUI**: pgAdmin 4 at http://localhost:8080.

### Production (Render / Cloudflare)
- **Backend**: `D1WorkerBackend` — HTTP proxy to Cloudflare Worker via `httpx.AsyncClient`, 3s timeout.
- **Database**: Cloudflare D1 (SQLite-compatible). Same schema ported to D1 migrations.
- **Switch**: `is_render()` from config — `True` → D1WorkerBackend, `False` → PostgresBackend.

### Auth & Admin
- **Auth**: UUID session tokens stored in `sessions` table (7-day expiry). SHA-256 password hashing with static salt. No email verification.
- **Admin**: Manual DB grant (`UPDATE users SET is_admin=TRUE`). Panel at `/dashboard/admin` — list users, toggle plan (free/priority), revoke sessions.
- **ProtectedRoute**: Checks `localStorage.isLoggedIn === 'true'`. No server-side token validation on navigation.

### Common
- **ABC**: `PersistenceBackend` with 17 abstract methods. Implementations: `NullBackend` (no-op), `D1WorkerBackend` (HTTP), `PostgresBackend` (asyncpg).
- **Row hash dedup**: `compute_row_hash()` = SHA-256 of `symbol|signal_date|entry_mode|duration`.
- **FileHashCache**: diskcache-based report cache, 30d TTL. Used for HTTP path cache hits.
- **IndexedDB**: Frontend saves completed reports locally for offline/history access.

## 6. Infrastructure (Docker Compose)

| Service | Image | Port | Healthcheck |
|---------|-------|------|-------------|
| postgres | postgres:16-alpine | 5432 | `pg_isready` |
| backend | Dockerfile.backend (python:3.11-slim) | 8000 | HTTP / |
| frontend | Dockerfile.frontend (node:18 → nginx:alpine) | 5174 | HTTP / |
| pgadmin | dpage/pgadmin4:latest | 8080 | — |

## 7. Testing
- **59 test functions** across 3 files: `test_backtester.py` (7), `test_integration.py` (1), `test_persistence.py` (51).
- Run: `pytest backend/tests/ -v --asyncio-mode=auto`
- Regression: `python backend/tests/verify_regression.py`
- Horizons: `python backend/verify_horizons.py`
