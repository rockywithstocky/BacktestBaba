# Current System Architecture

## Core Tech Stack
- **Backend**: FastAPI (Python), `yfinance`, Pandas, `diskcache`, `httpx`, `pytest-asyncio`.
- **Frontend**: React 18, Vite, TailwindCSS, Recharts, Framer Motion.
- **Persistence**: Cloudflare D1 (SQLite, 5GB free) via separate Worker microservice.
- **Communication**: Dual-path (REST + WebSocket with progress streaming). D1 persistence is fire-and-forget via background task.

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

### 5. D1 Persistence Layer (New — Phase A Complete)
- **Architecture**: Cloudflare Worker microservice at `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`. Python communicates via HTTP with 3s timeout.
- **Abstraction**: `PersistenceBackend` ABC with `D1WorkerBackend` (real) and `NullBackend` (no-op default).
- **Schema**: 3 tables — `uploads` (file metadata), `signal_hashes` (per-trade results with `results_json` TEXT blob), `quota` (write counter, hard block at 95%).
- **Dedup**: `row_hash = SHA256(symbol + "|" + date + "|" + entry_mode)` with UNIQUE constraint. INSERT OR IGNORE.
- **Graceful Degradation**: Backtest NEVER depends on D1. Persistence runs in `asyncio.create_task` AFTER WebSocket response is sent. Worker timeout/429/500 = log warning, skip persist, backtest result still delivered.
- **Config-Gated**: `PERSISTENCE_ENABLED=False` by default. Flip to `True` only after Worker is deployed and D1 bound.
- **Phase Status**: A (backend abstraction) committed. B (main.py integration) pending. C (Worker code) pending. D (E2E test) pending.

### 6. Frontend Architecture
- **Navbar**: `sticky top-0` positioning (not `fixed`). Participates in document flow without hiding content.
- **Dashboard.jsx**: Monolith orchestrator (~500 lines). Owns all state, calculations, and derived data. 
- **Extracted Components**: `StockChartModal.jsx` — enhanced with hero return, 4-card stats grid, and 4 chart types (Area/Line/Bar + Candlestick). Candlestick uses lazy-loaded `lightweight-charts` via dynamic import. Area/Line/Bar use Recharts (unchanged).
- **Backend**: `GET /api/prices/{symbol}` endpoint returns daily OHLCV data from diskcache-backed `get_ticker_data()`.
- **Summary Cards**: Dynamic coloring based on actual values. Win Rate cards glow green/red based on >= 50% threshold. Avg Return text colored by sign. Label says "data available" not "successful".
- **Stats Table**: Column labeled "Avg Profit/Trade" (not "Capital Return"). System is signal-level return analysis, not portfolio simulation.
