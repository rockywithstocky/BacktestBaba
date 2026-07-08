# 000 — Premortem Analysis: Existing Application Failure Modes

**Date**: 2026-07-01
**Scope**: Full-stack — backend (FastAPI) + frontend (React/Vite)
**Analysis Depth**: Exhaustive code review of all 12 source files

---

## CRITICAL (Will crash / data loss)

| # | File:Line | Issue | Impact |
|---|-----------|-------|--------|
| C1 | `backtester.py:85-90` | `yf.download` inside `asyncio.to_thread` with **zero try/catch**. Network error, rate limit, or Yahoo downtime kills the entire backtest — all progress lost, user sees error | Every run risks total failure |
| C2 | `backtester.py:175` | `tz_localize(None)` on already timezone-aware index raises `TypeError`. yfinance can return tz-aware datetimes depending on Yahoo's response | App crashes on first symbol with tz-aware data |
| C3 | `data_provider.py:8-9` | `Cache(CACHE_DIR)` at **module import time** fails on read-only filesystem (serverless, some Docker configs) | `PermissionError` at startup — app never starts |
| C4 | `main.py:81,123` | WebSocket + HTTP endpoints read entire file into memory **before** size check in `parse_upload_data`. 500MB upload = OOM crash | Attacker or accidental large file kills server |
| C5 | `api.js:14-16` | HTTP fallback sets `Content-Type: multipart/form-data` manually — **omits required boundary parameter**. Server cannot parse the multipart body | HTTP fallback ALWAYS fails — entire redundancy layer is broken |
| C6 | `data_provider.py:27,44,94` | All yfinance calls have **no timeout**. `requests` default timeout is infinite. Slow Yahoo response blocks thread forever | Event loop hangs, no new backtests accepted |

---

## HIGH (Wrong results / silent corruption)

| # | File:Line | Issue | Impact |
|---|-----------|-------|--------|
| H1 | `backtester.py:34` | Parser accepts `signal_date` column (line 61 of main.py) but backtester only reads `date`/`Date`. Signals with `signal_date` column → all-empty dates → all "Invalid Date" | Users naming column `signal_date` get zero results |
| H2 | `backtester.py:242-250` | `max_high_90d` / `max_low_90d` fields reused for **actual** duration (e.g. 45 days) but field name says `90d`. If `duration=45`, the table shows "90d Max High" but data is 45-day | Metrics labeled wrong — user makes decisions on incorrect data |
| H3 | `backtester.py:268` | `getattr(r, f"return_{horizon}d")` without default. Non-standard horizon → `AttributeError` crash on stats calculation | Backtest crashes during aggregation for custom durations |
| H4 | `backtester.py:157-162` | Sequential fallback `get_ticker_data` has **no try/catch**. If fallback fails, exception propagates and kills entire backtest | Redundancy path itself isn't redundant |
| H5 | `data_provider.py:27,44` | **No retry** on any yfinance call. Transient 429 rate limit or connection reset = immediate failure | Every transient network issue kills the run |
| H6 | `main.py:89` | `df.to_dict(orient="records")` doubles memory for large files. 50MB CSV → 100MB RAM for dict alone | OOM on large uploads |
| H7 | `api.js:35,75` | HTTP fallback can be called **twice** (from WS timeout AND WS error). Two concurrent HTTP requests, results race | Unpredictable which result wins, confusing state |
| H8 | `Dashboard.jsx:168` | `getExitDate` only handles `7d/30d/90d` but called for any period (14d, 45d, 60d). Falls through to 90 days silently | Wrong exit date shown in chart tooltip for non-standard periods |
| H9 | `StockChartModal.jsx:130` | `returnValue?.toFixed(2)` + `{returnValue > 0 ? '+' : ''}` — if `returnValue` is null, display shows `undefined%` | UI shows "undefined%" instead of "N/A" |
| H10 | `BacktesterPage.jsx:15-37` | **No double-submit guard**. Clicking Run Backtest twice creates two concurrent WebSocket connections, results arrive in random order | Two backtests race — user sees wrong report |

---

## MEDIUM

| # | File:Line | Issue |
|---|-----------|-------|
| M1 | `backtester.py:44` | `SymbolResolver._cache` is class-level dict, no lock. Two concurrent requests for same symbol → duplicate API calls (wastes rate limit) |
| M2 | `backtester.py:196` | `df.loc[entry_date]["Open"]` — if Open price is NaN, `entry_price` becomes NaN, propagates to all returns silently |
| M3 | `backtester.py:234-236` | Custom `duration` values (e.g. 120) — returns are computed but only stored for 7/14/30/45/60/90. Data fetched but silently discarded |
| M4 | `backtester.py:210` | `metadata_map.get(sym, {}).get("sector")` — if metadata_map value is None (cache corruption), `None.get(...)` crashes |
| M5 | `data_provider.py:44-52` | `yf.download(group_by='ticker')` for single symbol returns flat DF (not MultiIndex). Comment in backtester.py says "always MultiIndex" — wrong |
| M6 | `data_provider.py:8-9` | DiskCache directory grows unbounded. No eviction beyond per-key TTL. Can grow to gigabytes |
| M7 | `symbol_resolver.py:8,25` | In-memory `_cache` never cleared for process lifetime. No TTL. Ticker delisted → stale cache persists until server restart |
| M8 | `date_utils.py:30-31` | `"%d-%m-%Y"` parsed before `"%m/%d/%Y"`. Ambiguous dates (01-02-2024) parse as Feb 1 (DD-MM). Correct for India, wrong for US users |
| M9 | `main.py:56` | `c.strip()` on non-string column name (CSV without header → integer column names) crashes with `AttributeError` |
| M10 | `main.py:81` | WebSocket `receive_bytes()` has no timeout. Malicious client connects but never sends → connection slot consumed forever |
| M11 | `api.js:56` | `JSON.parse(event.data)` without try/catch. Malformed backend JSON (rare bug or proxy corruption) crashes WS handler |
| M12 | `Dashboard.jsx:142-143` | `new Date(undefined).getTime()` = NaN, which in sort leads to implementation-defined ordering |
| M13 | `Dashboard.jsx:162` | `formatCurrency(0)` returns `'N/A'` because `0` is falsy. Price of ₹0 shows as N/A |
| M14 | `UploadCard.jsx:41` | `progress.total === 0` → `Infinity%` progress display |

---

## LOW

| # | File:Line | Issue |
|---|-----------|-------|
| L1 | `backtester.py:33` | Dead code — `signal.get("Symbol")` and `signal.get("Date")` never match after column normalization |
| L2 | `backtester.py:85-90` | `asyncio.to_thread` symbols not sanitized. `../.env` or `^NSEI` accepted silently |
| L3 | `backtester.py:85-90` | No cancellation mechanism for long runs (10,000 signals). Runs for minutes with no stop button |
| L4 | `data_provider.py:33` | 24h cache — intraday stock split causes wrong prices for rest of trading day |
| L5 | `data_provider.py:76` | 7-day metadata cache — company sector change not reflected for a week |
| L6 | `main.py:59` | Duplicate column names (e.g. "Symbol" and "SYMBOL") — one silently overwrites the other in validation dict |
| L7 | `main.py:114-117` | WebSocket error send — if connection already closed, `except Exception: pass` silences it. User gets no feedback |
| L8 | `api.js:28` | `entryMode` not URL-encoded in WebSocket URL — low risk since value is controlled, not user input |
| L9 | `Dashboard.css:375-381` | Duplicate `font-size` declarations (0.875rem → later 1.25rem wins). Subtext is 20px instead of 14px |
| L10 | `Dashboard.css:698` | `.clickable-cell:hover::after { content: '📊' }` shifts column width on hover — visual jitter |
| L11 | `symbol_resolver.py:55` | `except Exception: return False` — catches `KeyboardInterrupt`, `SystemExit`. Overly broad |
| L12 | `StockChartModal.jsx:48-58` | Max High / Max Low on same date → overlapping chart markers. Rare edge case |
| L13 | `StockChartModal.jsx:62` | `new Date('N/A')` = Invalid Date → `NaN` in sort. Dates fallback to signal_date, not real max_high_date |
| L14 | `main.py:77` | Unrecognized `entry_mode` value silently treated as `next_close` (no validation, no warning) |

---

## Cross-Cutting Systemic Issues

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| S1 | No yfinance timeout anywhere | CRITICAL | Any slow Yahoo response hangs app forever |
| S2 | No file size validation before buffer | CRITICAL | OOM on large upload |
| S3 | HTTP fallback broken (missing boundary) | CRITICAL | Entire redundancy path non-functional |
| S4 | No retry on any external API call | HIGH | Every transient failure kills the operation |
| S5 | No request deduplication / double-submit guard | HIGH | Concurrent backtests race |
| S6 | Schema drift — field names misrepresent data | HIGH | User sees wrong metric labels |
| S7 | No lock on shared caches | MEDIUM | Duplicate API calls under concurrency |
| S8 | No cancellation / timeout for long operations | MEDIUM | User cannot stop a stuck backtest |
| S9 | No frontend error boundary | MEDIUM | A render crash shows white screen (no React error boundary) |

---

## Recommended Remediation Order

1. **C5** — Fix HTTP fallback Content-Type boundary (1 line fix)
2. **C1, C6** — Add try/catch + timeout around all yfinance calls
3. **C2** — Fix tz_localize to handle already-aware indices
4. **C4** — Add file size check BEFORE reading into memory
5. **H10** — Add double-submit guard in BacktesterPage
6. **H1** — Fix backtester to also read `signal_date` column
7. **H2** — Rename or document `max_high_90d` → `max_high` field
8. **H8, H9** — Fix Dashboard + Modal period handling
9. **S5, S7** — Add deduplication + cache locking
10. **Remaining M/L** items as time permits
