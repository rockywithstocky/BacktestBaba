# BacktestBaba — AI Agent Guide

**Stock Screener Backtester Pro**: Full-stack application for backtesting stock trading signals with real-time progress tracking, interactive charts, and comprehensive performance analytics.

## Quick Start

### Running the Application

**Backend** (FastAPI on port 8000):
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows: use source venv/bin/activate on Mac/Linux
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

### Testing

```bash
# All tests with asyncio support
pytest backend/tests/ -v --asyncio-mode=auto

# Regression test (ensures bulk fetch ≈ sequential fallback)
python backend/tests/verify_regression.py

# Lint
cd frontend && npm run lint
```

## Architecture Overview

**Tech Stack**:
- Backend: FastAPI, yfinance, Pandas, diskcache, WebSocket
- Frontend: React 18, Vite, TailwindCSS, Recharts, Framer Motion

**3-Phase Backtester**:
1. **Resolution** (0-50%): Deterministically extract unique symbols, resolve NSE/BSE tickers, compute global date bounds
2. **Bulk Fetch** (50% mark): Single `yf.download(group_by='ticker')` call → MultiIndex DataFrame
3. **Computation** (50-100%): Per-symbol slicing, return calculations, metadata enrichment (sector/marketCap)

**Key Files**:
- [backend/core/backtester.py](backend/core/backtester.py) — Orchestrates 3-phase pipeline; async I/O via `asyncio.to_thread`
- [backend/core/data_provider.py](backend/core/data_provider.py) — Bulk ticker data fetch (24h cache), metadata enrichment (7-day cache, concurrent with Semaphore(10))
- [backend/core/symbol_resolver.py](backend/core/symbol_resolver.py) — Resolves symbols to NSE/BSE tickers; in-memory cache per request
- [backend/models/schemas.py](backend/models/schemas.py) — SignalResult, BacktestReport Pydantic models
- [backend/main.py](backend/main.py) — FastAPI endpoints: `/api/backtest` (REST), `/ws/backtest` (WebSocket with progress)
- [frontend/src/components/Dashboard.jsx](frontend/src/components/Dashboard.jsx) — Main UI (~500 lines); monolith with state, charts, table
- [frontend/src/services/api.js](frontend/src/services/api.js) — HTTP + WebSocket client

## Critical Patterns & Pitfalls

### Backend: Async I/O (Non-Negotiable)

**Rule**: All yfinance calls must be wrapped with `asyncio.to_thread()` to prevent WebSocket disconnects on large backtests.

```python
# ✓ Correct
df = await asyncio.to_thread(yf.download, symbols, start, end)

# ✗ Wrong (blocks event loop → WebSocket hangs)
df = yf.download(symbols, start, end)
```

**Why**: yfinance uses sync `requests.get()` internally. Without `asyncio.to_thread`, the event loop is blocked, preventing WebSocket pong responses → browser closes after ~60s idle.

### Backend: MultiIndex DataFrame Slicing

**Rule**: Check `isinstance(bulk_df.columns, pd.MultiIndex)` before slicing—don't assume flat index.

```python
# ✓ Correct
if isinstance(bulk_df.columns, pd.MultiIndex):
    if symbol in bulk_df.columns.get_level_values(0):
        df = bulk_df[symbol].dropna(how='all')
else:
    df = bulk_df.copy()

# ✗ Wrong (crashes on single symbol)
df = bulk_df[symbol]  # KeyError when bulk has 1 column
```

**Why**: `yf.download(group_by='ticker')` returns MultiIndex for n≥2 symbols but flat index for n=1.

### Backend: Graceful Degradation

**Rule**: Metadata enrichment (sector, marketCap) must never crash the backtest. Return defaults, don't cache failures.

```python
def get_ticker_info(symbol: str) -> dict:
    result = {"sector": None, "marketCap": None}  # Safe default
    try:
        info = yf.Ticker(symbol).info
        if info:
            result.update({"sector": info.get("sector"), "marketCap": info.get("marketCap")})
        cache.set(key, result, expire=604800)  # 7-day cache
    except Exception as e:
        print(f"[ENRICHMENT ERROR] {symbol}: {e}")
        # Don't cache → retry next time
    return result
```

### Backend: Date Normalization

**Rule**: All outgoing `signal_date` fields must normalize to `YYYY-MM-DD` format. Frontend does not parse.

```python
# Use backend/utils/date_utils.py
from backend.utils.date_utils import parse_date
signal_date = parse_date(user_input)  # Handles 7 format patterns
```

### Frontend: WebSocket Cleanup

**Rule**: Always close WebSocket after complete/error; never leave it hanging.

```javascript
// ✓ Correct
const ws = new WebSocket(wsUrl);
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "complete" || data.type === "error") {
        ws.close();  // Essential cleanup
    }
};

// ✗ Wrong (memory leak; hangs on next run)
ws.onmessage = (event) => { /* process */ };  // Never close
```

### Frontend: Environment Variables

**Rule**: Use `import.meta.env.VITE_*` (not `process.env.*`).

```javascript
// ✓ Correct
const API_URL = import.meta.env.VITE_API_URL;

// ✗ Wrong (undefined in production)
const API_URL = process.env.VITE_API_URL;
```

## Known Architectural Issues

See [CURRENT_STATE.md](docs/ai/CURRENT_STATE.md) for system architecture details.

See [implementation_plan.md](implementation_plan.md) for phased improvements:

- **Phase 1**: Event loop starvation → concurrent I/O via worker pool + bounded Semaphore
- **Phase 2**: O(3n) API calls → batch resolution + bulk fetch, with cache-key optimization
- **Phase 3**: Ephemeral state → persistence layer (DB + user identity)
- **Phase 4**: Schema drift → horizons parameter-driven, schema unified across stack
- **Phase 5**: Monolithic frontend → component decomposition + virtualized table
- **Phase 6**: Zero observability → structured logging, Sentry, metrics

## Naming Conventions

**Python**: `snake_case` files, `PascalCase` classes, `snake_case` functions, `UPPER_SNAKE_CASE` constants

**JavaScript**: `PascalCase.jsx` components, `camelCase.js` utils, `camelCase` functions, `UPPER_SNAKE_CASE` constants

## Common Git Workflow

```bash
# Check status
git status

# See recent changes
git log --oneline -5

# Create feature branch
git checkout -b feature/descriptive-name

# Make changes, then
git add .
git commit -m "component: clear description of change"
git push origin feature/descriptive-name
```

## Running Specific Tests

```bash
# Single test file
pytest backend/tests/test_backtester.py -v

# Single test function
pytest backend/tests/test_backtester.py::test_valid_signals -v

# With print debugging
pytest backend/tests/test_backtester.py -v -s

# Specific symbol test
pytest -k "test_invalid_symbols" -v
```

## Debugging Tips

**Backend**:
- Print statements are logged: `print(f"[TAG] message")` (use `[BATCH]`, `[FALLBACK]`, `[ENRICHMENT ERROR]`)
- Uvicorn reload watches file changes; edit and save to re-run
- Check `localhost:8000/docs` to test endpoints interactively

**Frontend**:
- Open DevTools (F12) → Console for errors
- Network tab shows WebSocket frames
- React DevTools extension useful for component tree inspection

**yfinance**:
- Slow downloads? Check rate limits (Yahoo limits ~2000/hour)
- Test single symbol first: `yf.download('RELIANCE.NS', start='2024-01-01', end='2024-12-31')`
- Use `verify_regression.py` to ensure fallback logic works

## Documentation Map

- [README.md](README.md) — Quick start & features
- [docs/ai/CURRENT_STATE.md](docs/ai/CURRENT_STATE.md) — System architecture, 3-phase backtester, WebSocket protocol
- [implementation_plan.md](implementation_plan.md) — Known limitations & phased roadmap
- [DEPLOYMENT.md](DEPLOYMENT.md) — Render backend, Vercel frontend, env vars
- [LIVE_APP_GUIDE.md](LIVE_APP_GUIDE.md) — End-user walkthrough

## Environment Setup

**Local Dev** (`.env.local` in backend/ and frontend/):

Backend `.env.local`:
```
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
PORT=8000  # Optional; overridden by $PORT in production
```

Frontend `.env.local`:
```
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
```

**Production**: Environment variables set in Render (backend) and Vercel (frontend) dashboards.

## Questions or Changes?

- For architecture decisions, see [docs/adr/](docs/adr/) (Architecture Decision Records)
- For ongoing work, check [RESUME_WORK.md](RESUME_WORK.md)
- For AI context, see [docs/ai/](docs/ai/)
