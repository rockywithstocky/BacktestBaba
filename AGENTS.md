# BacktestBaba — AI Agent Guide

**Stock Screener Backtester Pro**: Full-stack app for backtesting stock trading signals with real-time progress, charts, and analytics. Live at [chartchampion.vercel.app](https://chartchampion.vercel.app).

## Quick Start

**Backend** (FastAPI on port 8000):
```bash
cd backend
python -m venv venv; venv\Scripts\activate  # Windows: source venv/bin/activate on Mac/Linux
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
# Swagger docs: http://localhost:8000/docs
```

**Frontend** (Vite on port 5174):
```bash
cd frontend
npm install
npm run dev
```

## Testing

```bash
# All tests (asyncio mode auto)
pytest backend/tests/ -v --asyncio-mode=auto

# Single file / function
pytest backend/tests/test_backtester.py -v
pytest backend/tests/test_backtester.py::test_valid_signals -v

# Bulk fetch ≈ sequential fallback regression check
python backend/tests/verify_regression.py

# Horizons output verification (fetches real data)
python backend/verify_horizons.py

# Frontend lint only (no test runner configured)
cd frontend && npm run lint
```

## Architecture (3-Phase Backtester)

1. **Resolution** (0-50%): Deterministic symbol extraction → NSE/BSE ticker resolution via `SymbolResolver` (in-memory cache per request) → global date bounds
2. **Bulk Fetch** (50% mark): Single `yf.download(group_by='ticker')` → MultiIndex DataFrame (24h diskcache). Sequential fallback per symbol if bulk fetch fails
3. **Computation** (50-100%): Per-symbol slicing → return calc for 6 horizons (7/14/30/45/60/90d) → metadata enrichment (sector, marketCap, 7-day cache, Semaphore(10))

## Key Files

| File | Role |
|------|------|
| `backend/core/backtester.py` | Orchestrates all 3 phases; async I/O via `asyncio.to_thread` |
| `backend/core/data_provider.py` | Bulk/fallback ticker fetch, metadata, latest price; diskcache-based |
| `backend/core/symbol_resolver.py` | Resolves → `.NS` / `.BO`; in-memory cache per request |
| `backend/models/schemas.py` | `SignalResult` + `BacktestReport` Pydantic models |
| `backend/main.py` | FastAPI: `POST /api/backtest` (REST), `WS /ws/backtest` (WebSocket + progress), `GET /api/prices/{symbol}` (OHLCV data) |
| `backend/utils/date_utils.py` | `parse_date()` (7 formats), `get_next_trading_day()`, `get_future_trading_day()` |
| `frontend/src/services/api.js` | `runBacktestWS()` — WS with 10s timeout → HTTP fallback |
| `frontend/src/pages/BacktesterPage.jsx` | Orchestrates UploadCard + Dashboard; entry mode toggle |
| `frontend/src/components/Dashboard.jsx` | Charts, stats, paginated trade table (~525 lines) |
| `frontend/src/components/StockChartModal.jsx` | Area/Line/Bar/Candlestick chart modal per trade; candlestick uses lazy-loaded lightweight-charts |

## Frontend Routing (react-router-dom v7)

| Route | Component | Auth |
|-------|-----------|------|
| `/` | LandingPage | Public |
| `/login`, `/signup` | LoginPage, SignupPage | Public |
| `/dashboard` | DashboardHub | Protected |
| `/dashboard/backtester` | BacktesterPage | Protected |
| `/dashboard/fundamental/:symbol` | FundamentalAnalysis | Protected |

Auth is localStorage-based (`isLoggedIn === 'true'`), implemented via `ProtectedRoute` wrapper in `App.jsx`.

## Critical Pitfalls

### Async I/O — yfinance blocks the event loop
Every yfinance call **must** be wrapped with `asyncio.to_thread()`:
```python
df = await asyncio.to_thread(yf.download, symbols, start, end)
```
Without it, WebSocket pongs are blocked → browser disconnects after ~60s idle.

### MultiIndex slicing — `yf.download(group_by='ticker')`
```python
if isinstance(bulk_df.columns, pd.MultiIndex):
    if symbol in bulk_df.columns.get_level_values(0):
        df = bulk_df[symbol].dropna(how='all')
else:
    df = bulk_df.copy()
```
`group_by='ticker'` returns MultiIndex for n≥2 symbols but **flat index for n=1**.

### Graceful degradation — metadata must never crash backtest
```python
result = {"sector": None, "marketCap": None}  # safe default
try:
    info = yf.Ticker(symbol).info
    ...
    cache.set(key, result, expire=604800)  # 7 days
except Exception:
    pass  # don't cache failures → retry next time
```

### Date normalization — always `YYYY-MM-DD`
All `signal_date`, `entry_date`, `max_high_date`, `max_low_date` fields **must** be normalized to `YYYY-MM-DD` strings. Frontend does not parse dates. Use `backend/utils/date_utils.parse_date()` (handles 7 formats).

### Input columns — case-insensitive
Parser accepts:
- `symbol` or `Symbol` (for ticker)
- `date` or `signal_date` (for signal date)

### Env vars — use `VITE_*` in frontend
```javascript
const API_URL = import.meta.env.VITE_API_URL;  // ✓ correct
const API_URL = process.env.VITE_API_URL;       // ✗ undefined at runtime
```

Env files at `frontend/.env.development` and `frontend/.env.production` with VITE_API_URL + VITE_WS_URL.

### Entry mode — query param
`entry_mode` accepts `"next_close"` (default) or `"next_open"`. Passed as WS query param: `/ws/backtest?entry_mode=next_open`.

### Duration — hardcoded at 90 days
`run_backtest_async(duration=90)` capped to [7, 180]. Not exposed via API; controls fetch window and max_high/low period.

### WebSocket cleanup — always close on complete/error
```javascript
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "complete" || data.type === "error") {
        ws.close();  // essential — prevents stale connection on next run
    }
};
```

### Tailwind CSS v4
Uses Tailwind v4 with `@tailwindcss/postcss` plugin (not v3 `@tailwind` directives). CSS entry is `@import "tailwindcss"` in `index.css`. PostCSS config at `frontend/postcss.config.js`.

## Environment Setup

**Backend** `.env.local`:
```
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
PORT=8000
```

**Frontend** `.env.development` (already committed):
```
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
```

## Tech Stack

- **Backend**: Python 3.8+, FastAPI, yfinance 0.2.66, Pandas, diskcache, Pydantic v2 (uses `.dict()` for serialization), websockets
- **Frontend**: React 19, Vite 7, TailwindCSS v4, Recharts 3, Framer Motion, lucide-react, react-router-dom v7, Axios

## References

- [implementation_plan.md](implementation_plan.md) — Phased roadmap for known issues (concurrency, O(3n) API calls, persistence)
- [RESUME_WORK.md](RESUME_WORK.md) — Current session state and next tasks
- [docs/ai/CURRENT_STATE.md](docs/ai/CURRENT_STATE.md) — Detailed system architecture
- [DEPLOYMENT.md](DEPLOYMENT.md) — Render (backend) + Vercel (frontend) deployment
