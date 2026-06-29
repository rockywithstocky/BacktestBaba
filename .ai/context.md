# context.md — BacktestBaba Codebase Discovery

> **Produced by**: Principal Engineer + Senior Architect joint discovery  
> **Method**: Every file read. Nothing invented. Gaps explicitly stated.

---

## PART A — Technical Discovery

### What problem does this application solve?

Stock traders and quant analysts in India use screening tools (such as ChartInk) to generate lists of stock symbols and the dates on which a technical or fundamental signal fired. These lists are exported as CSV or Excel files. Without this application, a trader has no way to know statistically whether those signals actually led to profitable trades over 7, 14, 30, 45, 60, or 90 calendar days after the signal date. BacktestBaba closes that gap: it takes the screener export, fetches real historical price data from Yahoo Finance, and computes forward returns, win rates, sector-level edge, and market-cap-level edge for the full signal set.

### What triggers it to start working?

**Backend trigger**: A user opens a WebSocket connection to `ws://localhost:8000/ws/backtest` (or the production equivalent at `wss://backtestbaba-api.onrender.com/ws/backtest`) and immediately sends the raw bytes of a CSV or Excel file. An alternative REST endpoint exists at `POST /api/backtest` that accepts a multipart file upload, but it delivers no real-time progress — it is used for programmatic or testing access only.

**Frontend trigger**: The user navigates to `/dashboard/backtester`, selects or drag-drops a file onto `UploadCard`, and clicks "Run Backtest". The `BacktesterPage.jsx` calls `runBacktestWS()` from `api.js`, which opens the WebSocket and sends the file as an `ArrayBuffer`.

Authentication gate: `App.jsx` wraps `/dashboard` and all sub-routes in a `ProtectedRoute` component that checks `localStorage.getItem('isLoggedIn') === 'true'`. There is no backend authentication system — this is purely a client-side flag.

### What does it produce or deliver at the end?

The backend returns a `BacktestReport` JSON object (schema defined in `backend/models/schemas.py`). It contains:

- `total_signals`, `successful_signals`, `failed_signals` (integer counters)
- Aggregated stats for 6 holding periods: `avg_return_7d`, `win_rate_7d`, `avg_return_14d`, `win_rate_14d`, `avg_return_30d`, `win_rate_30d`, `avg_return_45d`, `win_rate_45d`, `avg_return_60d`, `win_rate_60d`, `avg_return_90d`, `win_rate_90d`
- `best_performer` and `worst_performer` (both based on `return_30d`)
- `trades`: a list of `SignalResult` objects, each containing: `symbol`, `signal_date`, `entry_price`, `return_Nd`, `exit_price_Nd` for each horizon, `max_high_90d`, `max_high_date`, `max_low_90d`, `max_low_date`, `sector`, `market_cap`, `status`

The frontend `Dashboard.jsx` renders this into summary stat cards, bar charts (optimal holding period, sector edge, market-cap edge), a statistics table, and a paginated trade log. A `StockChartModal` shows an area/line/bar mini-chart when any return cell is clicked. The full report can be downloaded as JSON via the "Save Report" button.

### What external systems does it depend on?

1. **Yahoo Finance via `yfinance` (v0.2.66)**: The sole source of all historical price data and metadata. Used in two modes:
   - `yf.download(tickers, group_by='ticker')` — bulk batch fetch of OHLCV data for all unique symbols in one request (Phase B).
   - `yf.Ticker(symbol).history(...)` — sequential fallback fetch for any symbol missing from the bulk response (Phase C fallback).
   - `yf.Ticker(symbol).info` — fetches `sector` and `marketCap` metadata for each unique symbol.
   - `yf.Ticker(symbol).history(period='1d')` — used by `SymbolResolver._check_exists()` to validate that a ticker is known to Yahoo Finance before resolving it.
   
2. **`diskcache` (v5.6.3)**: A local file-system cache stored at `backend/.cache/`. Used to cache:
   - Per-symbol sequential history fetches: 24-hour TTL (`cache_key = f"{symbol}_{start_date}_{end_date}"`).
   - Latest-price lookups (used by `SymbolResolver`): 5-minute TTL.
   - Metadata (sector, marketCap) fetches: 7-day TTL.
   - Bulk download results are **not** cached (due to highly variable date boundaries per upload).

3. **Render.com** (production backend hosting): Free-tier web service. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`. Production URL: `https://backtestbaba-api.onrender.com`. The Render free tier sleeps after 15 minutes of inactivity.

4. **Vercel** (production frontend hosting): Static build of the Vite React app. Configured via `vercel.json` at repo root. Production URL: implied by `.env.production` pattern.

### What would fail first if nothing external was running?

If Yahoo Finance is unreachable (network down, rate-limited, blocked):
1. `SymbolResolver._check_exists()` would return `False` for every symbol → every signal in the report would receive status `"Symbol Not Found"`. The backend would return a valid (but fully failed) `BacktestReport` with `successful_signals = 0`. No crash.
2. The metadata enrichment phase would silently return `{"sector": null, "marketCap": null}` for all symbols (the broad `try...except` in `DataProvider.get_ticker_info` catches all failures and does not re-raise).
3. Cached data (from previous runs within the TTL window) would be served instead — so partial degradation is possible before full failure.

If `diskcache` directory is missing or corrupt, `DataProvider` would fall back to making every network request without caching. Performance would degrade but correctness would be maintained.

If the backend is not running, the frontend WebSocket connection attempt would fail immediately and `BacktesterPage` would display an error message via its `onError` callback.

---

## If You Just Joined This Team

This service is a tool that helps stock traders check whether their buy signals from a screener actually made money — it takes a list of stocks and dates and tells them how much those stocks went up or down over the next 1 week, 1 month, and 3 months.

The service wakes up when a user uploads a CSV file (containing stock names and signal dates) through the website and clicks "Run Backtest" — at that point, a live connection opens between the browser and the Python server and the file bytes are sent across it.

The server reads the file, looks up each stock symbol on Yahoo Finance to get its real historical price data, calculates how much the stock moved at 7-, 14-, 30-, 45-, 60-, and 90-day marks after the signal date, and streams progress back to the browser in real time until a final results package is delivered.

The results are handed off entirely to the browser — they are rendered as charts and tables inside the `Dashboard` component, and can optionally be saved as a JSON file; no results are persisted in any database.

If this service stopped working, a trader would have no way to validate whether their stock screening strategy is actually profitable — they would be forced to manually look up prices and calculate returns in spreadsheets, which is error-prone and time-consuming at scale.

---

## If You Are Setting Up To Test This

**What environment do I need running before I can test?**
- Python 3.8+ with all packages from `backend/requirements.txt` installed (including `fastapi`, `uvicorn`, `yfinance`, `pandas`, `diskcache`).
- The backend server must be running: `python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000`.
- Internet access is required for `yfinance` to reach Yahoo Finance (unless `diskcache` already has the data from a previous run).
- For frontend testing: Node.js 16+ with `npm install` completed inside `frontend/`, then `npm run dev` running (serves at `http://localhost:5173` or `http://localhost:5174`).

**What do I send in to make this service do something?**
- A CSV or Excel file with at minimum two columns named `symbol` and `date` (case-insensitive). Example:
  ```
  symbol,date
  RELIANCE,2024-01-15
  TCS,2024-01-15
  ```
- For Indian stocks, symbols should be bare names (e.g., `RELIANCE`, `TCS`) — the backend automatically appends `.NS` (NSE) or `.BO` (BSE).
- File size must be ≤ 10 MB.
- Date formats accepted: `YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY/MM/DD`, `DD-Mon-YY`, `DD-Mon-YYYY`.

**Where do I look to see if it worked?**
- In the browser: a `Dashboard` component appears with summary stat cards and a trade log table.
- In the backend terminal: look for `[BATCH] Fetching N unique symbols...` then `[ENRICHMENT] Fetching metadata for N symbols...`. Each fallback fetch prints `[FALLBACK] Triggered sequential fetch for SYMBOL`.
- Via the REST endpoint: `curl -X POST http://localhost:8000/api/backtest -F "file=@your_file.csv"` — a valid JSON response with a `trades` array means success.

**What does success look like vs failure?**
- **Success**: `{"total_signals": N, "successful_signals": N, "failed_signals": 0, "trades": [...], "avg_return_7d": X, ...}`. Each trade has `"status": "Success"` and non-null `return_7d`, `return_30d`, `return_90d`.
- **Failure states**: `"status": "Symbol Not Found"` (Yahoo Finance doesn't know this ticker), `"status": "Invalid Date"` (date string couldn't be parsed), `"status": "No Data"` (ticker resolved but Yahoo returned no OHLCV rows), `"status": "No Entry Data"` (OHLCV data exists but no trading day was found within 5 days of the signal date), `"status": "Invalid Input"` (symbol or date field was null/empty in the CSV).

**What should I never change when testing?**
- Do not alter the `diskcache` TTL values — the 7-day metadata TTL is intentional (ADR 003). Changing it to 0 while testing will cause every metadata fetch to hammer Yahoo Finance's `.info` endpoint and trigger rate-limiting.
- Do not rename the column headers in your test CSV below to anything other than `symbol` and `date` — the validation in `main.py:parse_upload_data` is case-insensitive but requires exactly these two names.
- Do not change `CORS_ORIGINS` in the environment without also updating the frontend URL — a mismatch will silently block all WebSocket and HTTP requests from the browser.

---

## Quick Reference

| What | Where | Why |
|---|---|---|
| Stock screening signals (CSV/Excel) | Uploaded via `UploadCard.jsx` in the browser | The only input the system accepts — no other trigger exists |
| File validation | `main.py:parse_upload_data` | Guards size (≤10MB), format (CSV or Excel), and required columns before any data is fetched |
| WebSocket connection | `ws://localhost:8000/ws/backtest` (dev) / `wss://backtestbaba-api.onrender.com/ws/backtest` (prod) | Primary channel — streams real-time progress and delivers the final report |
| Symbol resolution | `core/symbol_resolver.py` | Converts bare stock names (e.g. `RELIANCE`) to Yahoo Finance tickers (e.g. `RELIANCE.NS`) |
| Historical price data | Yahoo Finance via `yfinance` library | Only external data source — no local price store exists |
| Disk cache | `backend/.cache/` via `diskcache` | Avoids repeat Yahoo Finance calls within TTL windows: 5 min (price check), 24 hr (OHLCV), 7 days (metadata) |
| BacktestReport JSON | Sent over WebSocket as `{"type":"complete","report":{...}}` | Final product — contains all per-trade results and aggregated statistics for 6 holding periods |
| Dashboard rendering | `Dashboard.jsx` in browser | Renders the report as charts and trade log; all stats computed client-side via `useMemo` — no second server call |
| Authentication gate | `App.jsx:ProtectedRoute` | Client-side only — checks `localStorage.getItem('isLoggedIn') === 'true'`; no backend auth exists |
| Fundamental Analysis page | `FundamentalAnalysis.jsx` at `/dashboard/fundamental/:symbol` | Contains hardcoded mock data for Reliance Industries only — not connected to any live data source |

---

## For Someone New

Indian stock traders use screening tools like ChartInk to find stocks that match a set of rules on a given date, but they have no way to know whether following those signals would actually have made them money — BacktestBaba solves exactly this problem by taking the screener's export file and comparing each signal against real historical prices.

The service wakes up the moment a trader uploads a CSV or Excel file containing stock names and signal dates and clicks "Run Backtest" — at that point a live connection opens between the browser and the Python server and the file travels across it as raw bytes.

The server validates the file, looks up each stock on Yahoo Finance to confirm it exists, fetches its real historical closing prices, and calculates how much each stock moved at 1 week, 2 weeks, 1 month, 1.5 months, 2 months, and 3 months after the signal date — streaming a progress bar back to the browser the whole time.

When the calculation finishes, the browser receives a complete results package and displays it as summary stat cards, return charts grouped by sector and market cap, a statistics breakdown table, and a full searchable and sortable trade log — nothing is saved to any database; the results live only in browser memory and disappear when the tab is closed.

If this service stopped working, a trader would have to manually look up every historical stock price and calculate returns in a spreadsheet — which is slow, error-prone, and impossible to do at any meaningful scale for hundreds of signals.

