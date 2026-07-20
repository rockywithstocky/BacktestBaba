# Current System Architecture (2026-07-18)

## Core Tech Stack
- **Backend**: FastAPI (Python 3.11), yfinance 0.2.66, Pandas, diskcache, asyncpg, Pydantic v2
- **Frontend**: React 19, Vite 7, TailwindCSS v4, Recharts 3, Framer Motion, lucide-react, lightweight-charts
- **Infrastructure**: Docker Compose (local dev) — PostgreSQL 16 + pgAdmin 4. Render.com (backend hosting) + Vercel (frontend) + Cloudflare Workers + D1 (production).
- **Communication**: REST (`POST /api/backtest`) + WebSocket (`WS /ws/backtest` with progress streaming). Entry mode via query param (`?entry_mode=next_open|next_close`).

---

## 1. Latest Price System (NEW — Jul 2026)

### Architecture
Three-layer cascade to populate `latest_price`, `latest_price_date`, `latest_price_return` on each trade:

```
Layer 1: Phase B seeding (fastest, bulk)
  persist_symbol_data(symbol, df)
    → seeds {sym}_latest_price diskcache (300s TTL) from OHLCV's last valid Close
    → guard: days_since_last ≤ 3 (covers Fri→Mon, avoids stale data)
    → runs BEFORE early return (line 64-75)

Layer 2: OHLCV cache fallback (medium, disk-only)
  get_latest_prices_batch(symbols)
    → {sym}_latest_price HIT → return instantly
    → MISS → check sd_{sym} + sr_{sym} OHLCV cache
      → if fresh (≤3 days) → seed {sym}_latest_price, return
      → if stale → fall through

Layer 3: yfinance (slowest, external)
  get_latest_prices_batch(symbols)
    → yf.download(period="5d", group_by='ticker') chunked by BULK_FETCH_CHUNK
    → per-symbol yf.Ticker().history(period="5d") if bulk fails
    → seeds {sym}_latest_price on success
```

### Entry Mode Interaction
`FileHashCache` key = `(file_hash, entry_mode)`. Different entry modes have separate caches:
- Old `next_close` cache (pre-fix) → L1 HIT → Phase B skipped → `{sym}_latest_price` never seeded
- New `next_open` cache (post-fix) → L1 MISS → Phase B runs → seeds work
- OHLCV fallback bridges this gap — reads cache written by either mode

### NaN Close Handling
yfinance may include non-trading days with NaN Close. All Close reads use `dropna().iloc[-1]` to skip invalid rows.

---

## 2. Calculation Engine (Backtester)
- **Phases**: Phase A (0-50% — symbol resolution), Phase B (50% mark — bulk OHLCV fetch), Phase C (50-100% — per-symbol return calc + metadata + latest_price).
- **Horizons**: 6 distinct windows: `[7, 14, 30, 45, 60, 90]` days.
- **Duration**: Hardcoded at 90 days (gives each horizon enough history to compute returns). Controls fetch window and max_high/low period.
- **Entry mode**: `next_close` (default) or `next_open` — determines which price column is used for entry_price.
- **Concurrency**: `asyncio.to_thread` wraps all yfinance calls to prevent event-loop starvation.
- **Progress**: Phase boundaries report to WebSocket. `PROGRESS_THROTTLE_EVERY_N` config.
- **Metadata**: Semaphore(10) limits concurrent `yf.Ticker().info` calls.

## 3. Data Fetching (Symbol Resolution + OHLCV)
- **SymbolResolver**: 2-layer cache (in-memory per request + diskcache 24h). `batch_resolve` handles pre-suffixed (`.NS`/`.BO`) and bare symbols.
- **Bulk Fetch**: `get_bulk_ticker_data()` — single `yf.download(group_by='ticker')` → MultiIndex for n≥2, flat for n=1. No diskcache for bulk blob. Retry via `_yf_retry` (3 attempts, exponential backoff).
- **Per-symbol caching**: `persist_symbol_data()` stores per-symbol OHLCV with range metadata. `get_ticker_data()` checks range cache first, fetches delta if needed.
- **Latest price**: `get_latest_prices_batch()` — chunked yf.download(period="5d") + diskcache + OHLCV fallback + per-symbol fallback. Every symbol guaranteed an entry `(price, date_str)` or `(None, None)`.

## 4. Enrichment Layer (Metadata)
- **Fields**: `sector` + `marketCap` from `yf.Ticker(symbol).info`.
- **Strategy**: Concurrent `asyncio.gather` bounded by Semaphore(10), 10s timeout.
- **Caching**: 7-day TTL diskcache. Failures not cached (retry next time).
- **Graceful degradation**: Exceptions logged, default to `{"sector": None, "marketCap": None}`.

## 5. Frontend Architecture
- **BacktesterPage.jsx**: Orchestrates UploadCard + Dashboard; entry mode toggle.
- **Dashboard.jsx** (~530 lines): 6 summary cards, 6-horizon stats table, paginated trade table with sort/search.
  - **Latest Return column**: After Entry, before Exit columns. Shows `(latest_price - entry_price) / entry_price * 100`.
  - **Tooltip**: Shows "Latest Price: ₹X (as of YYYY-MM-DD)".
- **StockChartModal**: 4 chart types (Area/Line/Bar via Recharts, Candlestick via lazy-loaded lightweight-charts).
- **api.js**: `runBacktestWS()` — WS with keepalive (watchdog resets on ping), 10s timeout → HTTP fallback.
- **Auth**: localStorage-based (`isLoggedIn === 'true'`). Admin check via `user?.is_admin === 1 || true`.

## 6. Cache Architecture
- **diskcache** (shared instance): One SQLite-backed cache for all caching needs.
  - `{sym}_latest_price` — 5min TTL (per-symbol latest close)
  - `sd_{version}_{sym}` — per-symbol OHLCV DataFrame (24h/30d TTL)
  - `sr_{version}_{sym}` — per-symbol date range metadata
  - `report_{file_hash}_{entry_mode}` — FileHashCache (30d TTL)
  - `{sym}_info` — ticker metadata (7d TTL)
  - `refreshing_{symbol}` — thundering herd guard (5min)
- **FileHashCache**: Layers L1 (diskcache) → L2 (DB) → L3 (compute). L1 returns cached report instantly, L1 freshness check refreshes `latest_price` if `latest_price_date < today`.

## 7. Persistence Layer (Optional — Disabled by Default)
- **ABC**: `PersistenceBackend` (17 methods). Implementations: `NullBackend`, `D1WorkerBackend`, `PostgresBackend`.
- **Default**: `PERSISTENCE_ENABLED=false` → `NullBackend` → all persistence ops return None/empty.
- **Production (Render)**: Uses `is_render()` → tries `D1WorkerBackend` if `WORKER_URL` set, else `NullBackend`.
- **Local**: `PostgresBackend` via asyncpg if `DATABASE_URL` set.
- **Tables**: 6 core (`users`, `sessions`, `ingestion_log`, `uploads`, `signal_hashes`, `quota`) + 4 master storage (`resolved_symbols`, `symbol_data_freshness`, `file_upload_map`, `signal_results`).

## 8. Testing
- **85 backend tests** across 5 files:
  | File | Tests | Coverage |
  |------|-------|----------|
  | `test_backtester.py` | 8 | Backtester orchestration, L1 cache, progress, HTTP path |
  | `test_integration.py` | 1 | Real yfinance data (INTC) |
  | `test_latest_price.py` | 16 | Latest price batch, OHLCV fallback, persist_symbol_data seeding, NaN Close, stale guard |
  | `test_master_storage.py` | 12 | All 9 new persistence methods |
  | `test_persistence.py` | 48 | Row hash, results JSON, NullBackend, D1WorkerBackend, PostgresBackend |
- **21 frontend tests**: 7 Dashboard + 9 Latest Return + 5 Dashboard Columns.
- Run: `docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto`
- Regression: `python backend/tests/verify_regression.py`
- Horizons: `python backend/verify_horizons.py`

## 9. Infrastructure (Docker Compose)

| Service | Image | Port | Healthcheck |
|---------|-------|------|-------------|
| postgres | postgres:16-alpine | 5432 | `pg_isready` |
| backend | Dockerfile.backend (python:3.11-slim) | 8000 | HTTP / |
| frontend | Dockerfile.frontend (node:18 → nginx:alpine) | 5174 | HTTP / |
| pgadmin | dpage/pgadmin4:latest | 8080 | — |
