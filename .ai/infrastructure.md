# infrastructure.md — BacktestBaba Infrastructure & Local Setup

> **Produced by**: Principal Engineer + Senior Architect joint discovery  
> **Method**: Every file read. Nothing invented. Gaps explicitly stated.

---

## PART A — Technical Discovery

### Every external service this application connects to

| Service | Role | How connected | Config |
|---|---|---|---|
| **Yahoo Finance** (via `yfinance` v0.2.66) | Stock OHLCV price history + metadata (sector, marketCap) + symbol validation | HTTP/HTTPS via `yfinance` Python library (`curl_cffi` transport). No API key required. | No env var — hardcoded dependency |
| **Render.com** | Production backend hosting | FastAPI served via `uvicorn`; start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` | `PORT` env var injected by Render; `CORS_ORIGINS` env var should be set to Vercel frontend URL |
| **Vercel** | Production frontend hosting | Static build via `@vercel/static-build`; configured in `vercel.json` | `VITE_API_URL` and `VITE_WS_URL` set as Vercel environment variables; values in `frontend/.env.production` |
| **Local filesystem** (`backend/.cache/`) | Disk-based response cache (diskcache v5.6.3) | File I/O via `diskcache.Cache` Python library | `CACHE_DIR` = `backend/.cache/` — hardcoded relative to `data_provider.py`'s parent directory |

### How the application connects to each service

**Yahoo Finance**:
- `DataProvider.get_bulk_ticker_data` → `yf.download(tickers, group_by='ticker', auto_adjust=True, threads=True)` — one HTTP request for all unique symbols covering the global date range.
- `DataProvider.get_ticker_data` → `yf.Ticker(symbol).history(start, end, auto_adjust=True)` — one HTTP request per symbol (fallback path or symbol resolution check).
- `DataProvider.get_ticker_info` → `yf.Ticker(symbol).info` — one HTTP request per unique symbol for metadata.
- `DataProvider.get_latest_price` → `yf.Ticker(symbol).history(period="1d")` — one HTTP request per unique symbol during resolution.
- All calls are made inside `asyncio.to_thread(...)` from the backtester so they do not block the FastAPI event loop.

**diskcache**:
- Initialized at module import: `cache = Cache(CACHE_DIR)` in `backend/core/data_provider.py`.
- Cache key format for OHLCV: `"{symbol}_{start_date}_{end_date}"`, TTL 86400s (24hr).
- Cache key format for metadata: `"{symbol}_info"`, TTL 604800s (7 days).
- Cache key format for latest price: `"{symbol}_latest"`, TTL 300s (5min).
- Bulk download is **never** cached.

**Vercel** and **Render**: Deployment-only; no runtime connection from the application code.

### What configuration controls each connection

| Config item | Location | Default (dev) | Production value |
|---|---|---|---|
| Backend API base URL | `frontend/.env.development` and `frontend/src/services/api.js` fallback | `http://localhost:8000/api` | `https://backtestbaba-api.onrender.com/api` (from `.env.production`) |
| Backend WebSocket URL | `frontend/.env.development` and `frontend/src/services/api.js` fallback | `ws://localhost:8000/ws` | `wss://backtestbaba-api.onrender.com/ws` (from `.env.production`) |
| CORS allowed origins | `CORS_ORIGINS` env var read in `main.py` | `http://localhost:5173,http://localhost:5174` | Must be set to Vercel frontend URL(s) on Render |
| Backend port | `PORT` env var (Render injects this) | `8000` (hardcoded in `uvicorn` dev command in README) | Dynamically assigned by Render |
| Cache directory | Hardcoded: `os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")` | `backend/.cache/` | `backend/.cache/` (ephemeral on Render free tier — resets on each deploy) |
| Yahoo Finance transport | `curl_cffi` (installed as `curl_cffi==0.13.0`) | No config | No config |

### What needs to be running locally before the app starts

1. **Python 3.8+** with virtualenv activated and all `backend/requirements.txt` packages installed.
2. **uvicorn** process serving `backend.main:app` on port 8000 (or whatever port the frontend is configured to reach).
3. **Node.js 16+** with `npm install` completed in `frontend/` directory.
4. **Internet access** — Yahoo Finance must be reachable. There is no local stub for Yahoo Finance data.
5. **`backend/.cache/` directory** writable by the Python process — `diskcache` creates it automatically if it does not exist.

### Docker-compose.yml assessment

**Not found in codebase.** The project has no `docker-compose.yml` or `Dockerfile`.

The only external runtime dependency is Yahoo Finance (a public HTTP API, no local service needed) and `diskcache` (local filesystem, no daemon). No database, no message queue, no cache daemon (Redis, Memcached), no auth service.

Therefore, a `docker-compose.yml` is not needed to run this specific application — the only services are the backend Python process and the frontend Vite dev server, both of which run directly on the host.

If future development adds a database or replaces `diskcache` with Redis, a `docker-compose.yml` would be required at that point.

---

## If You Just Joined This Team

This service needs **Yahoo Finance** (accessed automatically via the `yfinance` Python library) because without it the application has no source of historical stock prices — every signal would return "No Data" and no returns would ever be calculated.

This service needs **diskcache** (a local file-based cache stored in `backend/.cache/`) because without it the system would make a fresh HTTP request to Yahoo Finance for every single symbol on every single backtest run, which would be extremely slow and would quickly trigger Yahoo Finance rate-limiting.

This service needs **uvicorn** (the ASGI web server) because FastAPI cannot serve HTTP or WebSocket connections on its own — uvicorn is what listens on the port and hands requests to the FastAPI application.

This service needs **Vite dev server** (the frontend development server) because the React application is not a set of static files during development — Vite compiles it on the fly and serves it with hot-reload.

---

### Exact commands to start each dependency locally:

```bash
# 1. Start the backend
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
backend\venv\Scripts\activate
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# 2. Start the frontend (in a separate terminal)
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm run dev
```

---

## If You Are Setting Up To Test This

Follow these steps in order. Every command is copy-paste ready for Windows PowerShell.

---

**Step 1:**
```powershell
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
```
Confirms: Your terminal prompt changes to show `(venv)` at the start. If PowerShell blocks script execution, run first: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

---

**Step 2:**
```powershell
pip install -r requirements.txt
```
Confirms: The command completes with `Successfully installed ...` or `Requirement already satisfied` for all packages. Look specifically for `fastapi`, `uvicorn`, `yfinance`, `diskcache`, and `pandas` in the output.

---

**Step 3:**
```powershell
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
Confirms: Logs show `INFO:     Application startup complete.` and `INFO:     Uvicorn running on http://127.0.0.1:8000`. Open `http://localhost:8000/` in a browser — you should see `{"message":"Stock Screener Backtester Pro API is running"}`.

---

**Step 4:**
```powershell
# Open a NEW terminal window (keep the backend running)
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm install
```
Confirms: Completes without errors. The `node_modules/` directory is created/updated. A `package-lock.json` already exists in the repo so this is fast.

---

**Step 5:**
```powershell
npm run dev
```
Confirms: Logs show `VITE v7.x.x  ready in Xms` and `Local:   http://localhost:5173/` (or 5174 if 5173 is taken). Open that URL in the browser — you should see the BacktestBaba landing page with the Navbar.

---

**Step 6 (verify end-to-end):**

Create a test file `test_signals.csv` with this content:
```csv
symbol,date
TCS,2023-06-01
INFY,2023-06-01
```

Then:
1. Open `http://localhost:5173` in a browser.
2. Set `localStorage.setItem('isLoggedIn', 'true')` in the browser DevTools Console (this bypasses the client-side auth gate).
3. Navigate to `http://localhost:5173/dashboard/backtester`.
4. Upload `test_signals.csv` and click **Run Backtest**.
5. Watch the progress bar move (backend terminal shows `[BATCH] Fetching 2 unique symbols...` then `[ENRICHMENT] Fetching metadata for 2 symbols...`).

Confirms success: The Dashboard renders with summary cards showing non-zero values and the trade log shows `TCS.NS` and `INFY.NS` with `status: "Success"` and numeric return percentages.

Confirms failure (what to look for in logs):
- Backend terminal shows `[FALLBACK]` for both symbols → bulk fetch failed; individual fetch was used (slower but still correct).
- Backend terminal shows `[ENRICHMENT ERROR]` → Yahoo `.info` endpoint failed; `sector` and `market_cap` will be `null` in the dashboard, but trades still appear.
- Browser console shows `CORS error` → the backend `CORS_ORIGINS` does not include the frontend URL. Confirm the backend was started with `--host 127.0.0.1` and the frontend env file points to `http://localhost:8000`.

---

**Step 7 (run backend unit tests):**
```powershell
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m pytest backend/tests/test_backtester.py -v
```
Confirms: All tests pass with `PASSED` markers. No network call is made — `DataProvider` and `SymbolResolver` are fully mocked. Look for `2 passed` in the summary line. Any `FAILED` means a regression in the calculation engine.

---

## Quick Reference

| Dependency | Connection | Config key | What fails without it |
|---|---|---|---|
| **Yahoo Finance** | `yfinance` Python library over HTTPS; no API key required; `curl_cffi` transport | No env var — hardcoded library dependency | Symbol resolution fails for all symbols → all signals return `"Symbol Not Found"`; no prices fetched; no returns calculated |
| **diskcache** (`backend/.cache/`) | Python file I/O via `diskcache.Cache`; initialised at module import in `data_provider.py` | `CACHE_DIR` hardcoded as `os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache")` | Unwritable at startup → backend crashes (no try/except). Absent at runtime → all data fetched live (correct but slow and rate-limit-prone) |
| **uvicorn** | ASGI server process listening on port 8000 | Dev: port 8000 hardcoded in README; Prod: `PORT` env var injected by Render | FastAPI cannot serve any HTTP or WebSocket connections — backend is completely unreachable |
| **CORS configuration** | `CORSMiddleware` reads `CORS_ORIGINS` env var at FastAPI startup | `CORS_ORIGINS` — comma-separated list of allowed frontend origins | All browser requests blocked silently; WebSocket cannot connect; REST calls fail from browser with CORS error |
| **Vite dev server** | Node.js process via `npm run dev`; serves on port 5173 or 5174 | `VITE_API_URL`, `VITE_WS_URL` in `frontend/.env.development` | Frontend not served; no browser UI available during local development |
| **`VITE_API_URL` / `VITE_WS_URL`** | Read by `api.js` at runtime via Vite env injection (`import.meta.env`) | `frontend/.env.development` / `frontend/.env.production` | If wrong or absent: frontend silently calls `http://localhost:8000` even in production build — all production API calls fail |
| **Internet access** | Network-level requirement for all yfinance HTTP calls | No config — network-level dependency | All Yahoo Finance calls fail; only data previously cached within TTL windows is served |
| **Render.com** | Deployment only — injects `$PORT` env var; `CORS_ORIGINS` must be configured | `PORT` (Render-injected), `CORS_ORIGINS` (must be set to Vercel frontend URL) | Not a runtime dependency — application works locally without Render |
| **Vercel** | Deployment only — `@vercel/static-build` from `vercel.json`; `VITE_API_URL` and `VITE_WS_URL` as env vars | `VITE_API_URL`, `VITE_WS_URL` (set in Vercel dashboard) | Not a runtime dependency — frontend works locally via `npm run dev` |

---

## For Someone New

**Yahoo Finance** is the only source of stock price data in this entire system — without it, the tool has no way to know what any stock was worth on any given date, and every signal in every upload would come back as "No Data" with no returns calculated.

**diskcache** stores the results of Yahoo Finance requests on the server's hard disk so the system does not have to fetch the same data every time a user runs a backtest — without it, every run would be much slower and Yahoo Finance would quickly block the service for making too many requests in a short time.

**uvicorn** is the process that actually listens on port 8000 and hands incoming connections to the FastAPI application — without it running, no browser and no test tool can reach the backend at all, regardless of whether FastAPI is imported correctly.

**CORS configuration** (the `CORS_ORIGINS` environment variable) is the list of website addresses that the browser is allowed to contact this server from — if the list does not include the exact address of the frontend, the browser silently refuses to send any requests and nothing in the application works.

**Vite dev server** compiles the React frontend on the fly and serves it with hot-reload during development — without it running locally, there is no browser interface to interact with while building or testing the application.

**`VITE_API_URL` and `VITE_WS_URL`** tell the frontend where the backend server lives — if these are not set correctly for a production build, the deployed website will try to call a server on your local laptop instead of the live backend on Render, and every user request will fail silently.

**Internet access** is a silent runtime requirement that has no configuration switch — without an active internet connection, all Yahoo Finance price and metadata requests fail immediately, though data from a previous run may still be served from the disk cache within its TTL window.

