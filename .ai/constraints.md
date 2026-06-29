# constraints.md — BacktestBaba Rules, Limits & Safety Nets

> **Produced by**: Principal Engineer + Senior Architect joint discovery  
> **Method**: Every file read. Nothing invented. Gaps explicitly stated.

---

## PART A — Technical Discovery

### Protective behaviors already in the code when things go wrong

| Protective behavior | Location | What it guards |
|---|---|---|
| File size cap: 10 MB hard limit | `main.py:parse_upload_data`, `MAX_FILE_SIZE = 10 * 1024 * 1024` | Prevents OOM on the backend from large uploads |
| Empty file check: `len(data) == 0` raises `ValueError` | `main.py:parse_upload_data` | Prevents downstream pandas crash on empty bytes |
| CSV parse fallback: tries `pd.read_csv` then `pd.read_excel` | `main.py:parse_upload_data` | Accepts both file types without requiring explicit format declaration |
| Explicit exception catching on CSV/Excel parse: `pd.errors.EmptyDataError`, `pd.errors.ParserError`, `UnicodeDecodeError` | `main.py:parse_upload_data` | Prevents unhandled 500 from malformed files |
| Required column validation (symbol + date/signal_date, case-insensitive) | `main.py:parse_upload_data` | Returns structured error with list of actual columns found |
| WebSocket error envelope: all errors sent as `{"type": "error", "message": "..."}` | `main.py:websocket_endpoint` | Prevents silent connection drops; client receives structured message |
| `WebSocketDisconnect` handler with silent swallow | `main.py:websocket_endpoint` | Prevents noisy traceback when user closes browser mid-backtest |
| `duration` clamped to `[7, 180]` days | `backtester.py:run_backtest_async`, line: `duration = min(max(duration, 7), 180)` | Prevents 0-day or multi-year fetch windows |
| Per-signal validation in Phase A: null symbol, null date → `"Invalid Input"` | `backtester.py` | Individual bad rows do not abort the entire run |
| `SymbolResolver._check_exists` returns `False` on exception | `symbol_resolver.py` | Yahoo Finance network errors during resolution don't crash the loop |
| In-memory symbol resolution cache (`SymbolResolver._cache`) with sentinel `_NOT_CACHED` | `symbol_resolver.py` | Avoids double network call for symbols appearing multiple times |
| Phase C fallback to `yf.Ticker.history` when symbol missing from bulk DataFrame | `backtester.py` | Batch fetch drop (throttling, API bug) → silent individual retry |
| `try/except` around MultiIndex slice with `[SLICE ERROR]` log | `backtester.py` | Unexpected pandas column type crash → logged, falls back |
| `get_next_trading_day` with `max_lookahead=5` | `date_utils.py` | Weekends and holidays → checks up to 5 days forward before giving up |
| If no entry date found → `SignalResult(status="No Entry Data")` | `backtester.py` | Does not assign a 0.0 return; marks the signal as failed |
| Metadata enrichment wrapped in `try/except Exception` | `data_provider.py:get_ticker_info` | Yahoo `.info` failure → `null` returned, core backtest continues |
| Metadata failures not cached | `data_provider.py:get_ticker_info` | Ensures transient failures get retried on next run |
| `asyncio.Semaphore(10)` on concurrent metadata fetches | `backtester.py` | Prevents connection flooding of Yahoo Finance `.info` endpoint |
| `asyncio.to_thread` wrapping all yfinance calls | `backtester.py`, `symbol_resolver.py` | Prevents FastAPI event loop starvation → WebSocket stays alive |
| CORS configured via `CORS_ORIGINS` env var with localhost default | `main.py` | Prevents frontend from being accidentally blocked in dev |

### What happens when input is incomplete, null, or unexpected?

| Input condition | Code location | What happens |
|---|---|---|
| `symbol` field is `None` or empty string | `backtester.py` Phase A | `p_sig["status"] = "Invalid Input"`, signal skipped |
| `date` field is `None` or empty string | `backtester.py` Phase A | `p_sig["status"] = "Invalid Input"`, signal skipped |
| Date string not parseable in any of 7 formats | `date_utils.py:parse_date` raises `ValueError` | Caught in Phase A → `"Invalid Date"` status |
| Symbol not found on Yahoo Finance (NSE nor BSE) | `symbol_resolver.py` returns `None` | `"Symbol Not Found"` status |
| Yahoo returns no OHLCV rows for a resolved symbol | `backtester.py` after slice/fallback | `"No Data"` status |
| No trading day found within 5 days of signal date | `date_utils.py:get_next_trading_day` returns `None` | `"No Entry Data"` status |
| `exit_date` not found for a specific horizon | `get_next_trading_day` returns `None` | `return_Nd` and `exit_price_Nd` remain `None` (not set) |
| Bulk DataFrame has flat index instead of MultiIndex | `backtester.py` Phase C | `[SLICE INFO]` logged, uses `bulk_df.copy()` directly |
| File > 10MB | `main.py:parse_upload_data` | `ValueError` → WebSocket `{"type":"error"}` message to browser |
| Empty file | `main.py:parse_upload_data` | `ValueError` → same |
| File missing required columns | `main.py:parse_upload_data` | `ValueError` with list of actual columns → same |

### What could silently produce wrong output without a visible error?

1. **`max_high_90d` / `max_low_90d` field name reuse**: The schema fields `max_high_90d` and `max_low_90d` are reused for whatever the `duration` parameter is set to. If `duration=60`, these fields actually represent max high/low over 60 days — but the frontend labels them based on `max_high_90d` with no caveat. The frontend `StockChartModal` always labels this "Max High" / "Max Low" without specifying the period. The discrepancy is silent. Evidence: `backtester.py` lines 228–229: comment says "Reusing field name for max high in period".

2. **`FundamentalAnalysis.jsx` displays hardcoded mock data**: Navigating to `/dashboard/fundamental/:symbol` shows fixed numbers for Reliance Industries (price: 2456.75, P/E: 24.5, etc.) regardless of which symbol is passed. The `setTimeout` simulates an API call but the values never change. A user reading these numbers will see wrong data for every stock that is not Reliance. Evidence: `FundamentalAnalysis.jsx` lines 13–36.

3. **Frontend auth is localStorage-only**: `App.jsx` guards `/dashboard` routes by checking `localStorage.getItem('isLoggedIn') === 'true'`. There is no corresponding backend authentication. Any user who sets this key manually gains full access. No token, no session, no expiry.

4. **`best_performer` / `worst_performer` based only on `return_30d`**: The `BacktestReport` fields `best_performer` and `worst_performer` are computed using `return_30d` as the sole metric. Signals that have no 30d data (because the signal was too recent) are excluded via the `if x.return_30d is not None else -999` guard. No warning is emitted when this exclusion occurs.

5. **Symbol resolution cached in-process memory for process lifetime**: `SymbolResolver._cache` is a class-level dict. In a production multi-worker Gunicorn setup, each worker has its own cache. A resolution that succeeds in one worker's memory will require another network call in a fresh worker. Not incorrect, but may appear inconsistent across requests.

6. **`duration` parameter defaults to 90 but is not exposed in the UI**: `Backtester.run_backtest_async` accepts a `duration` parameter. Both call sites in `main.py` invoke it without passing `duration`, so it always uses the default of 90. If a future caller passes a different value, the `max_high_90d` / `max_low_90d` fields will silently cover a different window.

### Configuration gaps that cause incorrect behavior without obvious errors

| Configuration | What happens if missing/wrong |
|---|---|
| `CORS_ORIGINS` env var omitted | Defaults to `http://localhost:5173,http://localhost:5174` — production frontend is blocked silently (WebSocket and HTTP both fail from browser) |
| `VITE_API_URL` / `VITE_WS_URL` not set in `.env.production` | Falls back to `http://localhost:8000/api` and `ws://localhost:8000/ws` — frontend will work in dev but silently call localhost in production build |
| `backend/.cache/` directory not writable | `diskcache` may raise on first write; not caught; would surface as a 500 on the first request that triggers a cache write |
| `diskcache` corrupted | Not found in codebase: no recovery or cache-invalidation path exists |

### Parts of this system with no safety net at all

1. **`diskcache` initialization failure** — `cache = Cache(CACHE_DIR)` at module load time in `data_provider.py`. If the directory is not writable, this raises at import time and crashes the entire backend process. No try/except.
2. **`FundamentalAnalysis.jsx`** — entirely mock; no error handling because no real API call is made. If connected to a real API, there is no loading error state.
3. **Login/Signup pages** — `LoginPage.jsx` and `SignupPage.jsx` exist in the codebase but were not fully read (outside the scope of the backtesting flow). Authentication backend: Not found in codebase.
4. **No rate-limit handling on yfinance calls in the fallback path** — if the bulk fetch fails and 100 signals all trigger the fallback, 100 sequential calls are made to Yahoo Finance with no backoff or retry logic.

---

## If You Just Joined This Team

**Always** validate that your CSV has columns named `symbol` and `date` (can be any case) before uploading, because the backend will reject the entire file with a clear error message if either column is missing — and no data will be processed.

**Always** use the WebSocket path (`runBacktestWS`) for real use, not the REST endpoint (`/api/backtest`), because only the WebSocket delivers real-time progress updates — the REST call blocks until the entire backtest completes with no feedback.

**Always** keep the backend `CORS_ORIGINS` environment variable in sync with the frontend URL, because a mismatch will silently block every request from the browser without any visible error in the browser console other than a generic CORS failure.

**Never** trust the numbers on the "Fundamental Analysis" page, because they are hardcoded placeholder data for Reliance Industries and do not reflect the actual stock you clicked on — this page is not connected to any live data source.

**Never** treat the `max_high_90d` / `max_low_90d` fields as always representing a 90-day window, because these field names are reused for whatever holding duration was configured — the actual window is labeled only in the backend comment, not in the API response or UI.

**Never** assume that a missing return (e.g., `return_30d = null`) means the trade failed — it means Yahoo Finance did not have a trading day within 5 days of the target exit date, which can happen for very recent signals or around market closures.

**Never** change or delete files inside `backend/.cache/` while the backend is running, because `diskcache` uses its own internal file locking and corruption of its files can crash the backend at the next cache read.

**Always** run the pytest suite (`pytest backend/`) before deploying changes to `backtester.py` or `data_provider.py`, because the mocked unit tests verify all 6 return horizons and aggregate statistics are correctly populated.

---

## If You Are Setting Up To Test This

**Rule**: File must have `symbol` and `date` columns.  
To verify: Upload a CSV with only a `ticker` column and no `date` column.  
Expect: WebSocket message `{"type":"error","message":"File must contain 'symbol' and 'date' columns. Found columns: [ticker]"}`.  
If you see the Dashboard render with zero results instead — the column validation rule has been removed.

**Rule**: File size ≤ 10MB.  
To verify: Upload a file of exactly 11MB.  
Expect: WebSocket message `{"type":"error","message":"File too large (11MB). Maximum is 10MB."}`.  
If you see the Dashboard render with any results — the size guard has been removed.

**Rule**: Invalid symbols get status "Symbol Not Found", not a crash.  
To verify: Upload a CSV with `symbol=FAKEXYZ999, date=2024-01-15`.  
Expect: `{"total_signals":1,"successful_signals":0,"failed_signals":1,"trades":[{"symbol":"FAKEXYZ999","status":"Symbol Not Found","entry_price":0.0}]}`.  
If you see a 500 error — the resolution fallback guard has been broken.

**Rule**: Metadata failure does not abort the backtest.  
To verify: Disconnect internet, then re-run a backtest with cached OHLCV data but non-cached `.info` data (clear only `*_info` keys from `.cache/`).  
Expect: All trades return `"sector": null, "market_cap": null` but `status: "Success"` with valid return values.  
If the backtest fails or returns a 500 — the enrichment error isolation has been broken.

**Rule**: `duration` is clamped to [7, 180].  
To verify: Call the REST endpoint directly with `duration=0` and `duration=999` in the request body (requires modifying `main.py` to pass through a duration param, as the UI does not expose it).  
Expect: The actual computation window is always at least 7 and at most 180 days.  
If you see a 0-day or multi-year window — the clamp has been removed.

**Rule**: `max_high_90d` / `max_low_90d` reflect the configured duration, not always 90 days.  
To verify: Modify `backtester.py` to call `run_backtest_async(signals, duration=30)`, then inspect `trades[0].max_high_90d`.  
Expect: The value reflects the maximum High price within 30 days of entry, not 90.  
If you see the value extend beyond 30 days — the window computation uses a hardcoded 90.

---

## Quick Reference

| Rule | What breaks | Where enforced |
|---|---|---|
| File must have `symbol` and `date` columns (case-insensitive) | Entire file rejected; no signals processed | `main.py:parse_upload_data` — raises `ValueError` with list of actual columns found |
| File must be ≤ 10MB | Entire file rejected | `main.py:parse_upload_data` — `MAX_FILE_SIZE = 10 * 1024 * 1024` |
| File must not be empty | Entire file rejected | `main.py:parse_upload_data` — `len(data) == 0` check |
| All yfinance calls must be wrapped in `asyncio.to_thread` | FastAPI event loop blocks; WebSocket disconnects mid-backtest on large files | `backtester.py` and `symbol_resolver.py` — every network call delegated via `asyncio.to_thread` |
| Individual bad signals must not abort the entire run | One bad row kills the entire backtest | `backtester.py` Phase A — per-signal status assignment (`"Invalid Input"`, `"Symbol Not Found"`, etc.) |
| `duration` must be clamped to [7, 180] days | 0-day window produces empty DataFrame; 999-day window triggers multi-year fetch | `backtester.py` — `duration = min(max(duration, 7), 180)` |
| Metadata failure must not abort the backtest | Backtest returns 500 when Yahoo `.info` rate-limits | `data_provider.py:get_ticker_info` — broad `try/except Exception`; returns `{"sector": null, "marketCap": null}` |
| Metadata failures must not be cached | Transient failure permanently cached; next run never retries | `data_provider.py:get_ticker_info` — `cache.set` called only on success path |
| Symbol resolution cache must use `_NOT_CACHED` sentinel | `None` result (symbol not found) indistinguishable from cache miss | `symbol_resolver.py` — `_NOT_CACHED = object()` sentinel pattern |
| Metadata fetches must be bounded by `Semaphore(10)` | Yahoo Finance `.info` endpoint flooded; rate-limiting triggered | `backtester.py` — `asyncio.Semaphore(10)` wraps each `fetch_meta` coroutine |
| `diskcache` must be initialised at module load | Every request fetches live from Yahoo Finance; performance degrades; rate-limiting likely | `data_provider.py` — module-level `cache = Cache(CACHE_DIR)` (no try/except — failure crashes the process) |
| `CORS_ORIGINS` must match the actual frontend origin | All browser requests silently fail with a CORS error | `main.py` — `CORSMiddleware` reads `CORS_ORIGINS` env var at startup |
| `max_high_90d` / `max_low_90d` field names cover the configured `duration`, not always 90 days | Frontend displays wrong holding-window label | `backtester.py` lines 228–229 — comment: "Reusing field name for max high in period" |
| `FundamentalAnalysis.jsx` must not be treated as a real data source | Trader makes decisions using Reliance Industries mock values for every stock | `FundamentalAnalysis.jsx` lines 13–36 — `setTimeout` simulates an API call but values never change |
| Frontend auth (`localStorage`) must not be treated as a security boundary | Any user who sets the flag gains full dashboard access | `App.jsx:ProtectedRoute` — `localStorage.getItem('isLoggedIn') === 'true'` only; no backend token |

---

## For Someone New

**Always** check that your CSV file has a column called `symbol` and a column called `date` before uploading — if either is missing, the server rejects the entire file and no signals are processed at all.

**Always** use the WebSocket path when running real backtests — it is the only way to see a live progress bar; the REST endpoint at `/api/backtest` blocks silently until the entire run completes.

**Always** keep the backend's CORS setting (the list of website addresses the server is allowed to respond to) in exact sync with the actual frontend address — a mismatch silently blocks all communication between browser and server with no obvious error message.

**Always** run the backend test suite (`pytest backend/tests/test_backtester.py -v`) before deploying any changes to the calculation engine — the tests verify all six return horizons and their aggregates are populated correctly.

**Never** change the diskcache TTL values (how long cached price data and metadata are kept) without a deliberate decision — reducing the metadata TTL to 0 causes Yahoo Finance to block the service due to too many requests hitting their `.info` endpoint.

**Never** delete or modify files inside `backend/.cache/` while the backend server is running — `diskcache` uses internal file locks, and corrupting those files mid-run causes the next cache read to crash the server.

**Never** trust the Fundamental Analysis page as real data — it shows hardcoded numbers for Reliance Industries regardless of which stock the user clicked on.

**Never** interpret a null return value (for example, `return_30d = null`) as a trade failure — it means no trading day was found within five calendar days of the target exit date, which happens around public holidays or for very recent signals that have not yet reached the exit horizon.

**Never** assume `max_high_90d` and `max_low_90d` always describe a 90-day window — those field names are reused for whatever holding-period duration is configured in `Backtester.run_backtest_async`; the default is 90 days but this is not enforced by the API schema.

**Never** treat the client-side login check as a security guarantee — it only reads a browser storage value that any user can set manually; there is no backend authentication system in this codebase.

