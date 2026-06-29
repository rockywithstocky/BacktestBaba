# architecture.md — BacktestBaba Data Flow

> **Produced by**: Principal Engineer + Senior Architect joint discovery  
> **Method**: Every file read. Nothing invented. Gaps explicitly stated.

---

## PART A — Technical Discovery

### Where does processing begin in this application?

**Frontend path** (`frontend/src/main.jsx` → `App.jsx` → `BacktesterPage.jsx`):  
`main.jsx` bootstraps React with `BrowserRouter`. `App.jsx` defines routes and wraps protected routes in a `localStorage` auth check. The user lands on `/dashboard/backtester` → `BacktesterPage.jsx`, which renders `UploadCard.jsx`. On submit, `BacktesterPage.handleUpload()` calls `runBacktestWS()` from `services/api.js`.

**Backend path** (`backend/main.py`):  
The FastAPI application is instantiated at module level (`app = FastAPI(...)`). CORS middleware is added using the `CORS_ORIGINS` environment variable (defaulting to `http://localhost:5173,http://localhost:5174`). The two active entry points are:
- `@app.websocket("/ws/backtest")` — primary path; receives raw file bytes over a WebSocket.
- `@app.post("/api/backtest")` — secondary REST path; receives a multipart file upload.

### How does data move through the system step by step?

```
[Browser] User selects file
    ↓
[api.js:runBacktestWS] Opens WebSocket to ws://localhost:8000/ws/backtest
    ↓ (ArrayBuffer sent over WS)
[main.py:websocket_endpoint] Receives raw bytes via await websocket.receive_bytes()
    ↓
[main.py:parse_upload_data]
  - Checks file size (≤10MB) and non-empty
  - Tries pd.read_csv(); if fails, tries pd.read_excel()
  - Strips whitespace from column names
  - Validates 'symbol' and 'date' (or 'signal_date') columns exist
    ↓
[main.py] Converts DataFrame to list of dicts (signals)
    ↓
[core/backtester.py:Backtester.run_backtest_async]
  |
  |── PHASE A: Resolution & Bounds
  |   For each signal:
  |     - Extracts raw_symbol, date_str (checks both 'symbol'/'Symbol', 'date'/'Date' keys)
  |     - asyncio.to_thread → SymbolResolver.resolve(raw_symbol)
  |         → SymbolResolver._resolve_uncached:
  |             - If already has .NS/.BO suffix → verify via DataProvider.get_latest_price
  |             - Try "{symbol}.NS" → DataProvider.get_latest_price (diskcache 5min TTL)
  |             - Try "{symbol}.BO" → DataProvider.get_latest_price
  |             - Returns resolved ticker or None
  |     - parse_date(date_str) — tries 7 date formats
  |     - Computes start_date = signal_date, end_date = signal_date + duration + 10 days
  |     - Tracks global_start and global_end across all signals
  |     - Collects unique_resolved_symbols (deduplicated, order-preserving)
  |     - Progress callback: type="progress", phase 0→50% of bar
  |
  |── PHASE B: Bulk Fetch & Enrichment (parallel)
  |   Bulk OHLCV fetch:
  |     asyncio.to_thread → DataProvider.get_bulk_ticker_data(unique_resolved_symbols, global_start, global_end)
  |       → yf.download(tickers=symbols, group_by='ticker', auto_adjust=True, threads=True)
  |       → Returns pd.MultiIndex DataFrame (ticker, OHLCV_column) [never cached at bulk level]
  |
  |   Metadata enrichment (concurrent, bounded by Semaphore(10)):
  |     asyncio.gather → for each unique symbol:
  |       asyncio.to_thread → DataProvider.get_ticker_info(symbol)
  |         - diskcache check (key="{symbol}_info", 7-day TTL)
  |         - yf.Ticker(symbol).info → extracts sector, marketCap
  |         - Caches result; on exception: returns {"sector": null, "marketCap": null}, no re-raise
  |
  |── PHASE C: Calculation Loop
  |   For each parsed signal:
  |     If status != "Valid" → append SignalResult(status=error_code, entry_price=0.0)
  |
  |     Slice bulk_df for this symbol:
  |       - isinstance(bulk_df.columns, pd.MultiIndex) check
  |       - bulk_df[resolved_symbol].dropna(how='all')
  |       - If symbol missing from MultiIndex: log [SLICE MISS], df = None
  |
  |     Fallback (if df is None or empty):
  |       asyncio.to_thread → DataProvider.get_ticker_data(symbol, start, end)
  |         - diskcache check (key="{symbol}_{start}_{end}", 24hr TTL)
  |         - yf.Ticker(symbol).history(start, end, auto_adjust=True)
  |         - Caches result
  |
  |     If df still empty → SignalResult(status="No Data")
  |
  |     df.index = pd.to_datetime(df.index).tz_localize(None)
  |
  |     Entry date: get_next_trading_day(signal_date, df, max_lookahead=5)
  |       → Scans signal_date + 0..5 days for any date present in df.index
  |     If no entry date → SignalResult(status="No Entry Data")
  |
  |     entry_price = df.loc[entry_date]["Close"]
  |
  |     For each horizon h in [7,14,30,45,60,90] where h ≤ duration:
  |       target_date = entry_date + timedelta(days=h)
  |       exit_date = get_next_trading_day(target_date, df, max_lookahead=5)
  |       if exit_date:
  |         exit_price = df.loc[exit_date]["Close"]
  |         ret = ((exit_price - entry_price) / entry_price) * 100
  |         setattr(res, f"return_{h}d", round(ret, 2))
  |         setattr(res, f"exit_price_{h}d", round(exit_price, 2))
  |
  |     window_df = df[entry_date : entry_date + timedelta(days=duration)]
  |     res.max_high_90d = window_df["High"].max()   ← field name reused for arbitrary duration
  |     res.max_low_90d  = window_df["Low"].min()    ← field name reused for arbitrary duration
  |     res.max_high_date / res.max_low_date via idxmax/idxmin
  |
  |── Aggregate BacktestReport
      For each horizon: calc avg_return, win_rate over successful trades
      best_performer / worst_performer by return_30d
      ↓
[main.py:websocket_endpoint] Sends JSON: {"type": "complete", "report": report.dict()}
    ↓
[api.js:runBacktestWS onmessage] data.type === 'complete' → calls onComplete(data.report)
    ↓
[BacktesterPage.jsx] setReport(reportData) → renders <Dashboard report={report} />
    ↓
[Dashboard.jsx] Computes stats, enrichmentStats, holdingPeriodData via useMemo
    ↓
[Dashboard.jsx] Renders: stat cards, BarChart (holding period), BarChart (sector edge),
                BarChart (market-cap edge), stats table, paginated sortable trade log
    ↓
[StockChartModal.jsx] Rendered on cell click: shows entry/exit/max-high/max-low points
                      on Area/Line/Bar chart; links to /dashboard/fundamental/:symbol
```

### Where does data change shape or get transformed?

| Step | Transformation |
|------|---------------|
| `parse_upload_data` | Raw bytes → `pd.DataFrame` with stripped column headers |
| `df.to_dict(orient="records")` | DataFrame → list of plain Python dicts |
| `SymbolResolver.resolve` | Bare symbol (e.g. `RELIANCE`) → Yahoo Finance ticker (e.g. `RELIANCE.NS`) |
| `parse_date` | Date string in any of 7 formats → `datetime` object |
| `yf.download` | HTTP response → `pd.MultiIndex DataFrame` (ticker × OHLCV) |
| `bulk_df[symbol].dropna` | MultiIndex slice → single-ticker flat DataFrame |
| `df.index.tz_localize(None)` | Timezone-aware index → timezone-naive index |
| `((exit_price - entry_price) / entry_price) * 100` | Two float prices → percentage return |
| `round(ret, 2)` / `round(exit_price, 2)` | Full-precision float → 2-decimal-place float |
| `report.dict()` | Pydantic `BacktestReport` → JSON-serializable Python dict |
| `Dashboard.jsx useMemo stats` | Array of `return_Nd` floats → avg, median, highest, lowest, positiveCount, negativeCount, profitFactor, capitalReturn |
| `enrichmentStats useMemo` | Per-trade sector/marketCap + return_30d → aggregated list sorted by avg return |

### Where does the system hand off to something external?

1. `DataProvider.get_latest_price` / `DataProvider.get_ticker_data` / `DataProvider.get_bulk_ticker_data` / `DataProvider.get_ticker_info` — all make HTTP calls to Yahoo Finance via the `yfinance` library.
2. `diskcache.Cache` — all reads and writes go to `backend/.cache/` on the local filesystem.
3. WebSocket frame send in `main.py` — progress and completion packets travel back to the browser over the persistent WebSocket connection.
4. `Dashboard.jsx` "Save Report" button — triggers a browser download of `backtest_report.json` (purely client-side; no server call).
5. `StockChartModal` "Analyze Fundamentals" link — navigates to `/dashboard/fundamental/:symbol`, which renders `FundamentalAnalysis.jsx`. **That page uses entirely hardcoded mock data** — it does not call the backend. This is documented inline with a comment: `// Mock Data - In real app, fetch from backend (yfinance)`.

### Plain text flow diagram

```
FILE (CSV/XLSX, ≤10MB)
  │
  ▼
[BROWSER: UploadCard.jsx]
  │  ArrayBuffer over WebSocket
  ▼
[BACKEND: main.py/websocket_endpoint]
  │  parse & validate columns
  ▼
[BACKEND: Backtester.run_backtest_async]
  │
  ├─[Phase A] Resolve symbols ──────────── → Yahoo Finance (latest price, symbol check)
  │            Parse dates                   ↑ diskcache (5-min TTL)
  │            Compute date bounds
  │
  ├─[Phase B] Bulk OHLCV download ──────── → Yahoo Finance (yf.download, no cache)
  │            Concurrent metadata fetch ── → Yahoo Finance (.info endpoint)
  │                                           ↑ diskcache (7-day TTL)
  │
  └─[Phase C] Slice data per symbol
              Fallback fetch if needed ──── → Yahoo Finance (yf.Ticker.history)
              Calculate 6 return horizons    ↑ diskcache (24-hr TTL)
              Compute max high/low
              Aggregate report
  │
  ▼
[BACKEND: WebSocket send {"type":"complete", "report": {...}}]
  │
  ▼
[BROWSER: BacktesterPage.jsx → Dashboard.jsx]
  │  useMemo computations (stats, enrichmentStats, holdingPeriodData)
  ▼
[BROWSER: Charts + Trade Log rendered]
  │  User clicks return cell
  ▼
[BROWSER: StockChartModal.jsx] (no backend call — data already in report)
```

---

## If You Just Joined This Team

When a **CSV file upload** arrives, first `parse_upload_data` [the function in `main.py` that reads bytes and checks the file is valid CSV/Excel with the right columns] validates the file structure.

Then `Backtester.run_backtest_async` [the core engine in `backend/core/backtester.py` that orchestrates all three phases] takes over: first it calls `SymbolResolver.resolve` [the class in `symbol_resolver.py` that converts a bare stock name like `RELIANCE` into the Yahoo Finance format `RELIANCE.NS`] for each row, then it calls `DataProvider.get_bulk_ticker_data` [the class in `data_provider.py` that makes a single large download request to Yahoo Finance for all stocks at once] to fetch all historical prices in one shot, and simultaneously calls `DataProvider.get_ticker_info` [the method that fetches sector and market-cap labels] for each stock concurrently.

Then, for each original signal, it slices the big price DataFrame, finds the entry price on the next available trading day, and calculates how much the stock moved at 7, 14, 30, 45, 60, and 90 days, recording both the percentage return and exit price for each horizon.

Finally, the assembled `BacktestReport` [the Pydantic model in `models/schemas.py` that packages all per-trade results and aggregated statistics] is sent back through the WebSocket to the browser, which hands it to `Dashboard.jsx` [the 500-line React component that renders all charts, statistics, and the trade log table].

If the upload fails or Yahoo Finance cannot be reached, `BacktesterPage.jsx` [the page-level React component] displays an inline error message and nothing is written anywhere — all state lives in browser memory for the duration of the session.

---

## If You Are Setting Up To Test This

**Which step in the flow is the one I am most likely testing?**  
`Backtester.run_backtest_async` — it is the only step that has a `pytest` suite (`backend/tests/test_backtester.py`). That test mocks `DataProvider` and `SymbolResolver` to avoid real network calls.

**What enters the system at the start of this flow?**  
Raw file bytes of a CSV or Excel file. The minimum required content is two columns (`symbol` and `date`) and at least one data row. Maximum size is 10 MB.

**What exits the system at the end?**  
A `BacktestReport` JSON object delivered over a WebSocket message with `"type": "complete"`. It contains per-trade results in the `trades` array and aggregated statistics (avg_return, win_rate) for up to 6 holding periods.

**If my test fails, which step should I check first and why?**  
Check `SymbolResolver.resolve` first: if it returns `None` for your test symbol, the entire signal is marked `"Symbol Not Found"` and skipped — no price data is fetched, no returns are computed. This is the most common root cause of a completely empty result set when using real data. Print the `resolved_symbol` in Phase A to confirm the `.NS` or `.BO` suffix was correctly appended, then verify Yahoo Finance has data for that resolved ticker and date range.

---

## Quick Reference

| STEP | Component | What it does |
|---|---|---|
| 1 | `UploadCard.jsx` | User selects or drags a CSV/Excel file onto the drop zone |
| 2 | `api.js:runBacktestWS` | Opens a WebSocket to `/ws/backtest`; sends the file as an `ArrayBuffer` the moment the connection opens |
| 3 | `main.py:websocket_endpoint` | Receives raw bytes; passes them to `parse_upload_data` |
| 4 | `main.py:parse_upload_data` | Checks size ≤10MB; parses CSV then Excel; strips column whitespace; validates `symbol` and `date` columns exist |
| 5 | `Backtester` — Phase A (Resolve) | Iterates every row; calls `SymbolResolver.resolve` per symbol; parses each date string; builds global date bounds; sends 0–50% progress |
| 6 | `SymbolResolver.resolve` | Tries `{symbol}.NS` then `{symbol}.BO`; validates via `DataProvider.get_latest_price`; stores result in in-process memory cache |
| 7 | `Backtester` — Phase B (Bulk fetch) | Single `yf.download` for all unique symbols over the global date range; returns a `pd.MultiIndex DataFrame`; result is not cached |
| 8 | `Backtester` — Phase B (Metadata) | Concurrently fetches `sector` and `marketCap` per symbol via `DataProvider.get_ticker_info`; bounded by `asyncio.Semaphore(10)`; cached 7 days |
| 9 | `Backtester` — Phase C (Slice) | Slices bulk DataFrame per symbol using `isinstance(columns, pd.MultiIndex)` check; falls back to `yf.Ticker.history` if symbol is missing |
| 10 | `Backtester` — Phase C (Calculate) | Finds entry price via `get_next_trading_day(signal_date, df, max_lookahead=5)`; calculates 6 return horizons and max high/low over the duration window |
| 11 | `Backtester` — Aggregate | Computes `avg_return` and `win_rate` for each horizon; identifies `best_performer` and `worst_performer` by `return_30d` |
| 12 | `main.py:websocket_endpoint` | Sends `{"type":"complete","report":{...}}` over the WebSocket |
| 13 | `BacktesterPage.jsx` | Receives the report; replaces `UploadCard` with `Dashboard` |
| 14 | `Dashboard.jsx` | Computes all frontend stats via `useMemo`; renders stat cards, three bar charts, stats table, and paginated trade log |
| 15 | `StockChartModal.jsx` | Rendered on return-cell click; shows entry/exit/max-high/max-low as area, line, or bar chart; links to `/dashboard/fundamental/:symbol` |

---

## For Someone New

**Everyday analogy:** Think of BacktestBaba like a race results service for stock picks. You hand in a list of horses you backed (your stock signals) along with the date of each race. The service goes to the official race archive (Yahoo Finance), looks up how each horse actually finished at 1 week, 1 month, and 3 months after the race date, and hands you back a report showing your overall win rate, average gain, and which pick performed best. You never had to visit the archive yourself — the service did all the legwork and returned a clean summary to your browser.

**Plain English flow:**

1. The trader drops a CSV file onto the website. Each row has a stock name and a date — that is the signal they want to test.
2. The moment "Run Backtest" is clicked, the browser opens a live connection to the Python server and sends the file across it as raw data.
3. The server reads the file and checks it looks correct: the right column names are present, the file is not empty, and it is under 10MB.
4. For each row, the server figures out the correct Yahoo Finance name for the stock — for example, "RELIANCE" becomes "RELIANCE.NS" for the National Stock Exchange, or "RELIANCE.BO" for the Bombay Stock Exchange.
5. Once all stock names are resolved, the server makes a single large request to Yahoo Finance to download historical prices for all stocks at once, covering the full date range of the file — this is much faster than requesting each stock one by one.
6. While the price download is in progress, the server also quietly fetches background labels (sector like "Technology" or "Energy", and market size) for each stock, running up to 10 at a time to avoid overloading Yahoo Finance.
7. For each signal, the server finds the closing stock price on the first available trading day on or after the signal date, then finds it again at 7, 14, 30, 45, 60, and 90 calendar days later — calculating the percentage gain or loss for each horizon.
8. All results are packaged into a single report and sent back to the browser over the live connection.
9. The browser renders the report as summary cards, bar charts, a statistics breakdown table, and a full searchable trade log — entirely without any further contact with the server.
10. If the user clicks a return percentage in the trade log, a modal opens showing a mini chart of that stock's entry price, exit price, and highest and lowest point during the holding period.

