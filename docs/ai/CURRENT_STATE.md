# Current System Architecture

## Core Tech Stack
- **Backend**: FastAPI (Python), `yfinance`, Pandas, `diskcache`, `pytest-asyncio`, `httpx`.
- **Frontend**: React 18, Vite, TailwindCSS, Recharts, Framer Motion.
- **Infrastructure**: Cloudflare Workers + D1 (persistence, feature branch), Render.com (backend hosting), Vercel (frontend).
- **Communication**: Dual-path (REST + WebSocket with progress streaming).

## System State
### 1. Calculation Engine (Backtester)
- **Horizons**: Fully supports and populates 6 distinct horizons: `[7, 14, 30, 45, 60, 90]`.
- **Concurrency**: `asyncio.to_thread` wraps all I/O bound `yfinance` network calls to prevent event-loop starvation and WebSocket dropouts.
- **Progress**: 2-phase progress bar (0-50% Resolution, 50-100% Computation). Granular per-symbol status messages via WebSocket.

### 2. Data Fetching Architecture (Batch Mode)
- **Phase A (Deterministic Resolution)**: Iterates signals to deterministically extract unique symbols and global date bounds. Caches symbol-to-ticker resolution in memory. `.NS` tried first, falls back to `.BO`.
- **Phase B (Bulk Fetch)**: Executes a single `yf.download(group_by='ticker')` request. Returns a `pd.MultiIndex` DataFrame **always** (even for a single symbol).
- **Phase C (Slicing & Fallback)**: MultiIndex DataFrame is sliced per symbol using `isinstance(columns, pd.MultiIndex)` check (not symbol count). Falls back to sequential `yf.Ticker().history()` if a symbol is missing from the bulk response.
- **Date Normalization**: All outgoing `signal_date` fields are normalized to `YYYY-MM-DD` in the backend, including failed/invalid signals. Frontend does not perform date parsing normalization.

### 3. Enrichment Layer (Metadata)
- **Fields**: Fetches `sector` and `marketCap`.
- **Strategy**: Concurrent `asyncio.gather` bounded by a Semaphore(10) during Phase B. 
- **Caching**: 7-Day TTL via `diskcache`.
- **Optionality**: Guaranteed non-blocking. Exceptions trigger structured `[ENRICHMENT ERROR]` logs and degrade gracefully to `null`.

### 4. Frontend Architecture
- **Navbar**: `sticky top-0` positioning (not `fixed`). Participates in document flow without hiding content.
- **Dashboard.jsx**: Monolith orchestrator (~500 lines). Owns all state, calculations, and derived data. 
- **StockChartModal**: 4 chart types (Area/Line/Bar via Recharts + Candlestick via lazy-loaded `lightweight-charts`). Hero return display, 4-card stats grid.
- **Backend**: `GET /api/prices/{symbol}` endpoint returns daily OHLCV data from diskcache-backed `get_ticker_data()`.
- **Summary Cards**: Dynamic coloring based on actual values. Win Rate cards glow green/red based on >= 50% threshold.
- **Stats Table**: Column labeled "Avg Profit/Trade" (not "Capital Return"). System is signal-level return analysis, not portfolio simulation.

### 5. Persistence Layer (D1 — Feature Branch)
- **Abstraction**: `PersistenceBackend` ABC with 5 methods (`save_upload`, `save_signals`, `list_uploads`, `get_quota`, `healthcheck`).
- **Implementations**: `NullBackend` (no-op, default when `PERSISTENCE_ENABLED=false`) and `D1WorkerBackend` (HTTP to Cloudflare Worker via `httpx.AsyncClient`, 3s timeout).
- **Dedup**: `compute_row_hash()` = SHA-256 of `symbol|signal_date|entry_mode`. Worker uses `INSERT OR IGNORE`.
- **Quota**: Worker tracks total writes against 1M-row limit, returns 429 at 95% capacity. Backend logs WARNING and drops.
- **Data Model**: `UploadRecord` (file_hash, filename, entry_mode, signal_count) and `TradeRecord` (row_hash, symbol, signal_date, entry_date, entry_price, entry_mode, status, results_json). `_build_results_json()` serializes 6-horizon returns as JSON blob.
- **Integration**: Fire-and-forget `asyncio.create_task` after WebSocket send. Config-gated: `PERSISTENCE_ENABLED` (default false), `WORKER_URL`, `PERSISTENCE_TIMEOUT`.
- **Config**: 3 env vars in `backend/config.py`. No circular imports (`persistence.py` imports only stdlib + httpx).
- **Testing**: 29 unit tests in `backend/tests/test_persistence.py` with mocked httpx. All pass.
