# BacktestBaba — Constitution
**Permanent standing rules. Binding on every session. Read this file first.**

> Evidence source: Every value below was read directly from source files in this repository.
> Nothing is invented. Where something was not found, that fact is stated explicitly.

---

## Section 1 — Service Identity

BacktestBaba is a full-stack web application that takes a CSV or Excel export of stock screening signals (symbol + date pairs) and uses Yahoo Finance historical price data to calculate how much each stock moved at 7, 14, 30, 45, 60, and 90 calendar days after the signal date — delivering win rates, average returns, sector-level edge, and market-cap-level edge as an interactive dashboard.

A trader uploads a file, the Python backend fetches real historical prices from Yahoo Finance in a three-phase batch process, and the browser displays the results as charts and a sortable trade log — no data is stored in any database; the results exist only in browser memory for the duration of the session.

---

## Section 2 — Confirmed Tech Stack

| Technology | Version if found | What it is used for |
|---|---|---|
| Python | 3.8+ (README) | Backend runtime |
| FastAPI | 0.121.3 | HTTP and WebSocket API server |
| Uvicorn | 0.38.0 | ASGI server — serves FastAPI over HTTP and WS |
| Pydantic | 2.12.4 | Request/response schema validation (`SignalResult`, `BacktestReport`) |
| pandas | 2.3.3 | Parsing CSV/Excel uploads; slicing MultiIndex DataFrames; return calculations |
| yfinance | 0.2.66 | Sole source of historical OHLCV data and ticker metadata from Yahoo Finance |
| diskcache | 5.6.3 | File-system cache at `backend/.cache/`; TTLs: 5 min (price check), 24 hr (OHLCV), 7 days (metadata) |
| curl_cffi | 0.13.0 | HTTP transport used internally by yfinance |
| openpyxl | 3.1.5 | Excel file parsing (`.xlsx`) inside `pd.read_excel` |
| pytest | 9.0.1 | Backend unit test runner |
| pytest-asyncio | ≥0.25.0 | Async test support for `Backtester.run_backtest_async` |
| React | 19.2.0 | Frontend UI library |
| Vite | 7.2.4 | Frontend build tool and dev server |
| react-router-dom | 7.9.6 | Client-side routing (`/`, `/login`, `/signup`, `/dashboard`, `/dashboard/backtester`, `/dashboard/fundamental/:symbol`) |
| recharts | 3.4.1 | Bar, area, line, and composed charts in `Dashboard.jsx` and `StockChartModal.jsx` |
| framer-motion | 12.23.24 | UI animations in `UploadCard`, `Dashboard`, `StockChartModal`, `DashboardHub` |
| axios | 1.13.2 | HTTP client for REST fallback endpoint (`/api/backtest`) |
| lucide-react | 0.554.0 | Icon library used across all components |
| TailwindCSS | 4.1.17 | Utility CSS (dev dependency); used alongside custom CSS files |
| Node.js | 16+ (README) | Frontend build and dev server runtime |
| Render.com | Free tier | Production backend hosting; sleeps after 15 min inactivity |
| Vercel | Free tier | Production frontend hosting (static build via `vercel.json`) |

---

## Section 3 — Confirmed External Connections

| System name | How service connects | What it is used for | What fails if unavailable |
|---|---|---|---|
| **Yahoo Finance** | `yfinance` Python library (`curl_cffi` transport); no API key; no auth | (1) Validate symbol exists via `yf.Ticker.history(period='1d')`. (2) Bulk OHLCV download via `yf.download(group_by='ticker')`. (3) Fallback per-symbol OHLCV via `yf.Ticker.history(start, end)`. (4) Metadata (sector, marketCap) via `yf.Ticker.info` | All signals return `"Symbol Not Found"` (if diskcache has no prior data) or return stale cached data within TTL. Core backtest still completes; `successful_signals` will be 0 with no cache. |
| **diskcache** (`backend/.cache/`) | Python file I/O via `diskcache.Cache`; initialised at module import in `data_provider.py` | Caches symbol resolution (5-min TTL), OHLCV data (24-hr TTL), and metadata (7-day TTL) to avoid repeat Yahoo Finance calls | If directory is unwritable: backend crashes at startup (no try/except on `Cache()` init). If directory is readable but not writeable after startup: first cache-write attempt raises, surfaces as 500. If cache is simply absent: all data is fetched live from Yahoo Finance (correct but slow and rate-limit-prone). |
| **Render.com** | Deployment only — Render injects `PORT` env var; `CORS_ORIGINS` must be set to Vercel URL | Production backend hosting | Not a runtime dependency — application works locally without Render |
| **Vercel** | Deployment only — static build via `@vercel/static-build`; `VITE_API_URL` and `VITE_WS_URL` set as env vars | Production frontend hosting | Not a runtime dependency — frontend works locally via `npm run dev` |

---

## Section 4 — Standing Rules

| Rule (Always / Never) | Who this matters to | What breaks if violated |
|---|---|---|
| **Always** ensure the uploaded CSV/Excel has columns named `symbol` and `date` (case-insensitive) | Tester | `parse_upload_data` raises `ValueError` and the entire file is rejected with an error envelope — no signals are processed |
| **Always** use the WebSocket path (`/ws/backtest`) for live backtest runs, not `/api/backtest` | Dev, Tester | REST endpoint has no progress callback — the browser blocks with no feedback until the full result returns |
| **Always** keep `CORS_ORIGINS` on the backend in sync with the actual frontend origin | Dev | All WebSocket and HTTP requests from the browser fail silently with a CORS error — no data is returned |
| **Always** wrap any new yfinance call inside `asyncio.to_thread(...)` | Dev | Blocking I/O on the event loop stalls WebSocket heartbeats → client disconnects mid-backtest on large files (ADR 001) |
| **Always** run `python -m pytest backend/tests/test_backtester.py -v` before deploying changes to `backtester.py` or `data_provider.py` | Dev | Regressions in return calculation, horizon population, or aggregate statistics go undetected |
| **Always** set `VITE_API_URL` and `VITE_WS_URL` in `.env.production` before building for Vercel | Dev | Production frontend silently calls `http://localhost:8000` — all API calls fail in production |
| **Never** delete or modify files inside `backend/.cache/` while the backend process is running | Dev, Tester | `diskcache` uses internal file locking; corruption causes the next cache read to raise an exception, surfacing as a 500 |
| **Never** change the `diskcache` TTL values without an explicit architecture decision | Dev | Reducing metadata TTL to 0 causes every backtest to hammer Yahoo Finance's `.info` endpoint → rate-limiting (ADR 003) |
| **Never** trust numbers shown on the `/dashboard/fundamental/:symbol` page as real data | Tester | That page displays hardcoded Reliance Industries data for every symbol — it is a mock placeholder (`FundamentalAnalysis.jsx` lines 13–36) |
| **Never** treat `return_Nd = null` as a trade failure | Dev, Tester | Null means no trading day was found within 5 days of the target exit date (holiday, weekend, or very recent signal) — the trade status remains `"Success"` |
| **Never** treat `max_high_90d` / `max_low_90d` as always representing a 90-day window | Dev, Tester | These field names are reused for whatever `duration` is configured (`backtester.py` lines 228–229); the default is 90 but this is not enforced by the schema |
| **Never** rely on frontend auth as a security boundary | Dev | `ProtectedRoute` in `App.jsx` checks only `localStorage.getItem('isLoggedIn') === 'true'`; any user can set this manually. There is no backend auth system |
| **Never** generate code from an incomplete or unreviewed spec | Dev | Changes to the calculation engine without verifying all 6 horizons will produce wrong aggregates silently |
| **Never** simulate test output — always run real commands and report real results | Dev, Tester | Simulated output hides real failures; ADR 002 regression test (`verify_regression.py`) exists precisely to catch this |

---

## Section 5 — Architectural Boundaries

| Component | What it owns | What it must never do |
|---|---|---|
| `main.py` | HTTP/WebSocket entry points; file parsing (`parse_upload_data`); CORS config; 10MB file size gate; error envelope format | Contain business logic or return calculation — delegate to `Backtester` |
| `Backtester` (`core/backtester.py`) | Three-phase orchestration (Resolve → Bulk Fetch → Calculate); progress callbacks; result aggregation into `BacktestReport` | Make direct yfinance calls — delegate all I/O to `DataProvider` |
| `DataProvider` (`core/data_provider.py`) | All yfinance calls; diskcache reads and writes; cache TTL enforcement | Know anything about signals, horizons, or return calculation |
| `SymbolResolver` (`core/symbol_resolver.py`) | In-memory resolution cache; NSE/BSE suffix probing; existence validation via `DataProvider.get_latest_price` | Call yfinance directly — always go through `DataProvider` |
| `date_utils.py` | Date string parsing (7 formats); next-trading-day lookup with 5-day lookahead | Be aware of any specific stock, symbol, or external API |
| `schemas.py` (`models/`) | Pydantic `SignalResult` and `BacktestReport` models; field definitions for all 6 horizons + metadata | Contain computation logic or transformation code |
| `Dashboard.jsx` | All client-side stat computation (`useMemo`); chart rendering; trade log pagination and sorting; capital analysis | Call the backend — it receives a complete `BacktestReport` and works entirely from that data |
| `StockChartModal.jsx` | Modal display of entry/exit/max-high/max-low points; chart type switching | Fetch data — it is purely presentational, receiving `stock` and `period` as props |
| `api.js` (services) | WebSocket lifecycle management; REST fallback call; URL configuration from `VITE_API_URL`/`VITE_WS_URL` env vars | Contain UI state or business logic |
| `BacktesterPage.jsx` | Page-level state (`report`, `isLoading`, `progress`, `error`); WebSocket lifecycle orchestration; conditional render of `UploadCard` vs `Dashboard` | Perform calculations or talk directly to the backend outside of `api.js` |
| `FundamentalAnalysis.jsx` | Route `/dashboard/fundamental/:symbol`; UI shell for future fundamental data | Be treated as a source of real data — it contains hardcoded mock values only |
| `backend/.cache/` | Disk-based diskcache store | Be committed to git (it is in `.gitignore`) or modified while the backend process is running |

---

## Section 6 — Local Environment

Run these steps in order. Both terminals must stay open simultaneously.

**Terminal 1 — Backend:**

```powershell
# Step 1: Activate the virtual environment
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
```
> If PowerShell blocks execution: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

```powershell
# Step 2: Install dependencies (safe to re-run)
pip install -r requirements.txt
```

```powershell
# Step 3: Start the backend server
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Confirmed start log line:**
```
INFO:     Application startup complete.
```
Secondary confirmation: `http://localhost:8000/` returns `{"message":"Stock Screener Backtester Pro API is running"}`

---

**Terminal 2 — Frontend:**

```powershell
# Step 4: Install Node dependencies (safe to re-run)
cd "d:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm install
```

```powershell
# Step 5: Start the dev server
npm run dev
```

**Confirmed start log line:**
```
VITE v7.x.x  ready in Xms
Local:   http://localhost:5173/
```

---

**Step 6: Unlock the dashboard (client-side auth bypass for testing)**

Open browser DevTools Console at `http://localhost:5173` and run:
```javascript
localStorage.setItem('isLoggedIn', 'true')
```
Then navigate to `http://localhost:5173/dashboard/backtester`

---

**Step 7: Run unit tests (no internet required)**

```powershell
cd "d:\AI\Stock Market\ChartInk\BacktestBaba"
python -m pytest backend/tests/test_backtester.py -v
```

**Confirmed pass line:**
```
2 passed in X.XXs
```

---

## Section 7 — Decisions Made

| Date | Decision | Why |
|---|---|---|---|
| 2026-07-06 | The Persistent Historical Data Store will use SQLite as its embedded database unless future requirements materially change (see `docs/adr/004-persistent-data-store.md`) | SQLite is embedded, zero-maintenance, and matches the application's read-dominated, single-writer access pattern without requiring new infrastructure |

---

## Section 8 — Phase Transition Gates

| From phase | To phase | Gate criteria |
|---|---|---|
| Start | Discover | Repository is accessible; agent mode is available to read all files |
| Discover | Constitute | `context.md`, `architecture.md`, `constraints.md`, and `infrastructure.md` all exist in `.ai/`; every value in them is evidenced from a real file and line number; no invented values |
| Constitute | Specify | `constitution.md` exists and has been read; no invented values present; all silent failure risks documented in Section 4 |
| Specify | Clarify | `spec.md` exists in `.ai/specs/[feature-name]/`; Section 5 open questions are explicitly listed |
| Clarify | Plan | Every open question from the spec is either resolved with an owner-confirmed answer or formally blocked with a named owner |
| Plan | Task | `plan.md` identifies every file that will change, every file that must not change, and the risk of each change |
| Task | Generate | `tasks.md` has atomic ordered steps; each step has an explicit verify action; no step touches more than one concern |
| Generate | Verify | All changed code compiles or runs without errors; branch exists with conventional commits; `pytest` suite passes |
| Verify | Ship | Unit tests pass; integration test passes with real Yahoo Finance data (`TCS`, `INFY`, known past date); E2E WebSocket flow completes in browser without CORS error; readiness confirmed by engineer |
| Ship | Next feature | PR created with ticket reference; reviewer approved; CI green (if configured); branch merged; Section 7 Decisions Made updated |

---

## Section 9 — Honesty Rules

These rules are non-negotiable and apply to every session on this repository.

1. **Never advance phase when gate criteria not met** — if a gate criterion is missing, state which criterion and stop.
2. **Never simulate test output** — run real commands (`pytest`, `uvicorn`, `npm run dev`) and report what the terminal actually shows.
3. **Never modify spec without explicit confirmation** — ask before changing any artifact that a previous session produced.
4. **Never generate code from incomplete spec** — if the spec has unresolved questions, resolve them first.
5. **Never skip a phase** — every phase gate exists because the next phase depends on its output.
6. **Always cite evidence from actual files** — every claim about how the system works must reference a file path and, where possible, a line number.
7. **Never invent values not found in codebase** — if a value, config, or behaviour is not confirmed by reading a real file, write: `Not found in codebase`.
8. **Always read this file before responding** — `constitution.md` is the single source of truth for this repository; no session begins without reading it.
9. **Always update Section 7 (Decisions Made) at the end of every session** — every architectural decision or deviation from the constitution must be recorded with a date and reason.
