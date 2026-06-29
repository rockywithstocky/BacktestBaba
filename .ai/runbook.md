# runbook.md — BacktestBaba Operational Runbook

> **Produced by**: Principal Engineer + Senior Architect joint discovery  
> **Method**: Every file read. Nothing invented. Gaps explicitly stated.

---

## Startup Sequence

### Native (no Docker)

**Terminal 1 — Backend:**

```powershell
# Activate virtual environment
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1

# Install dependencies (first time only)
pip install -r requirements.txt

# Start the backend
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
**Evidence**: `README.md:57-72`, `DOCKER_SETUP.md:101-118`

**Terminal 2 — Frontend:**

```powershell
# Install dependencies (first time only)
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm install

# Start the dev server
npm run dev
```
**Evidence**: `README.md:82-89`, `frontend/package.json:7` — `"dev": "vite"`

### Docker (all services)

```powershell
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"

# Build all containers
docker-compose build

# Start all services (frontend, backend, cache)
docker-compose up -d

# View logs
docker-compose logs -f

# Start with development overrides (hot-reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```
**Evidence**: `DOCKER_SETUP.md:29-43`, `docker-compose.yml:1-72`, `docker-compose.dev.yml:1-21`

## Runtime Dependencies

| Dependency | Visibility | Required by |
|---|---|---|
| `backend/.cache/` directory | Always created by diskcache on first import | `data_provider.py:9` — `Cache(CACHE_DIR)` at module load |
| Internet access to Yahoo Finance | Required for all non-cached data fetches | `data_provider.py:27,44-52,69,93-94` |
| Port 8000 free | Required for uvicorn | `README.md:72` |
| Port 5173 or 5174 free | Required for Vite | Vite auto-selects next available port |
| Docker Engine 20.10+ | Required for Docker mode | `DOCKER_SETUP.md:23` |
| WSL2 + Docker Desktop | Required on Windows for Docker | `DOCKER_SETUP.md:25` |

## Health Checks

### Backend health endpoint
```
GET http://localhost:8000/
```
Returns: `{"message": "Stock Screener Backtester Pro API is running"}`

**Evidence**: `backend/main.py:72-74`

### Swagger docs
```
http://localhost:8000/docs
```
Returns: FastAPI Swagger UI — confirms FastAPI application is running.

### Docker health checks
All three services have HEALTHCHECK instructions:

| Service | Command | Interval |
|---|---|---|
| backend | `python -c "import requests; requests.get('http://localhost:8000/')"` | 10s |
| frontend | `wget --no-verbose --tries=1 --spider http://localhost:5174/` | 10s |
| cache | `redis-cli ping` | 10s |

**Evidence**: `Dockerfile.backend:20-21`, `Dockerfile.frontend:31-32`, `docker-compose.yml:19-44`

Check health status:
```powershell
docker-compose ps
# All services should show "Up (healthy)" or "Up"
```

## Operational Commands

### Testing

```powershell
# Unit tests (no internet required)
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m pytest backend/tests/test_backtester.py -v --asyncio-mode=auto

# All backend tests
python -m pytest backend/tests/ -v --asyncio-mode=auto

# Regression test (internet required)
python backend/tests/verify_regression.py
```
**Evidence**: `backend/tests/test_backtester.py:1-83`, `backend/tests/verify_regression.py:1-40`

### Docker commands

```powershell
# Shell access
docker-compose exec backend bash
docker-compose exec frontend sh
docker-compose exec cache redis-cli

# Run tests inside containers
docker-compose exec backend pytest backend/tests/ -v --asyncio-mode=auto
docker-compose exec frontend npm run lint

# View logs
docker-compose logs -f backend
docker-compose logs --tail=50 backend
```
**Evidence**: `DOCKER_SETUP.md:66-102`

### Cleanup

```powershell
# Stop all containers
docker-compose stop

# Stop and remove containers
docker-compose down

# Remove volumes (clear cache)
docker-compose down -v

# Remove all images
docker-compose down --rmi all
```
**Evidence**: `DOCKER_SETUP.md:106-118`

## Common Failure Modes

### 1. WebSocket disconnects mid-backtest (large files)
**Symptom**: Progress bar stops, browser shows error, backend continues processing.
**Cause**: Event loop blocked by synchronous yfinance calls if `asyncio.to_thread` is not wrapping them.
**Check**: `backend/core/backtester.py` lines 44, 85-86, 100, 157-158 — all yfinance calls must be wrapped.
**Fix**: Ensure every `yf.` call uses `await asyncio.to_thread(...)`.

### 2. All signals return "Symbol Not Found"
**Symptom**: Successful upload, but every trade shows `status: "Symbol Not Found"`.
**Cause**: Yahoo Finance unreachable OR symbol resolution fails.
**Check**: Test with `curl` to Yahoo Finance directly — `yf.download('RELIANCE.NS')` in a Python shell.
**Debug**: Add `print(f"[RESOLVE] {symbol} → {resolved}")` in `backtester.py` Phase A.
**Evidence**: `symbol_resolver.py:50-56`, `backtester.py:40-47`

### 3. CORS errors in browser console
**Symptom**: Browser console shows `Access to XMLHttpRequest has been blocked by CORS policy`. Frontend cannot reach backend.
**Cause**: `CORS_ORIGINS` env var does not include the frontend URL.
**Check**: Backend log at startup — the `CORS_ORIGINS` value is read once at import time. Verify it matches the browser's origin exactly.
**Fix**: Set `CORS_ORIGINS` when starting the backend, or update `backend/main.py:14-17`.
**Evidence**: `backend/main.py:14-25`

### 4. Backend crashes at startup
**Symptom**: `uvicorn` fails with `FileNotFoundError` or `PermissionError` during import.
**Cause**: `diskcache.Cache()` initialization fails because `backend/.cache/` is not writable.
**Check**: Does `backend/.cache/` exist? Is it writable by the Python process?
**Fix**: `mkdir backend/.cache` (creates automatically if parent is writable). On Docker, ensure volume mounts do not override the directory with read-only permissions.
**Evidence**: `data_provider.py:8-9` — module-level `Cache(CACHE_DIR)` with no try/except.

### 5. Frontend silently calls localhost in production
**Symptom**: Deployed frontend at Vercel URL shows UI but backtest returns errors.
**Cause**: `VITE_API_URL` or `VITE_WS_URL` not set in Vercel environment variables, or `.env.production` was not included in the build.
**Check**: Open browser DevTools → Network tab → inspect WebSocket URL. If it says `ws://localhost:8000/ws`, the production env vars are missing.
**Fix**: Set `VITE_API_URL=https://backtestbaba-api.onrender.com/api` and `VITE_WS_URL=wss://backtestbaba-api.onrender.com/ws` in Vercel dashboard.
**Evidence**: `api.js:3-4` — fallback to `http://localhost:8000`, `frontend/.env.production:1-2`

### 6. Render free tier cold starts
**Symptom**: First request after inactivity takes 30-60 seconds. Subsequent requests are fast.
**Cause**: Render free tier sleeps after 15 minutes of inactivity.
**Check**: Backend log at Render dashboard — first request shows a long gap.
**Mitigation**: Use a cron-job service (e.g., cron-job.org) to ping `https://backtestbaba-api.onrender.com/` every 14 minutes.
**Evidence**: `DEPLOYMENT.md:378-385` — documented limitation of Render free tier.

### 7. Bulk fetch returns empty DataFrame
**Symptom**: All trades use fallback fetch (each terminal line shows `[FALLBACK]`).
**Cause**: `yf.download()` may fail for large symbol lists due to Yahoo throttling.
**Check**: Backend terminal shows `[FALLBACK]` for every symbol.
**Impact**: Slower but correct — each symbol is fetched individually with caching (24h TTL).
**Evidence**: `backtester.py:154-162` — fallback path is always available.

### 8. Port 8000 already in use
**Symptom**: `uvicorn` reports `Address already in use`.
**Fix**: 
```powershell
# Find process using port
netstat -ano | findstr :8000

# Kill the process
taskkill /F /PID <PID>

# Or kill all Python processes
taskkill /F /IM python.exe
```
**Evidence**: `README.md:220-226`
