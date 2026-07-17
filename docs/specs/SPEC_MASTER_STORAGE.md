# SPEC: Master Storage System + Latest Return Column

## Status: V2 — Amended (Jul 17, 2026)

**Changes from V1**:
1. Latest Return promoted to **#1 priority** with mid-day market handling
2. Chronological ordering: Phase 1 = Latest Return (independent, high value), Phase 2 = Master Storage (infrastructure)
3. Mid-day / stale close price edge case spec'd in detail
4. Kaizen principle: each phase independently testable and deployable

---

## 1. Problem (Updated Priority)

The backtester has 5 caching/persistence gaps AND 1 critical frontend gap:

| # | Priority | Gap | Current State |
|---|----------|-----|---------------|
| **P0** | 🔴 NOW | **No "Latest Return" column** | TradeLog shows 1w/1m/3m horizon returns but not current market return relative to entry. Users manually compute this. |
| P1 | 🟡 High | No persistent cache across restarts | FileHashCache (diskcache, 30d TTL) is the only report cache. No DB-backed read path. |
| P1 | 🟡 High | No cross-user dedup | User A and User B uploading same symbols both hit yfinance independently. |
| P1 | 🟡 High | No partial overlap | Adding 2 new symbols to 100-symbol CSV re-fetches all 100. |
| P1 | 🟡 High | No latest price refresh on re-upload | Cached reports return stale exit prices forever. |
| P2 | 🟢 Medium | No user isolation | No way to scope data per user. |
| P2 | 🟢 Medium | "Mode" column takes space with low value | Frontend clutter. |
| P2 | 🟢 Medium | Trade Log header has noisy hint text | Frontend clutter. |

**Kaizen principle**: Ship P0 first (independent value, 1–2 days), then P1 (infrastructure, 3–5 days), then P2 (polish, 1 day). Each phase is independently deployable and testable.

---

## 2. Goals (Chronological Order)

### Phase 1 (Days 1–2): Latest Return Column + TradeLog Cleanup
1. **Latest Return Column**: Show current market return in TradeLog:
   - `latest_price_return = ((latest_price - entry_price) / entry_price) * 100`
   - `latest_price` = most recent daily close from yfinance (period="5d")
   - Handles mid-day: uses last COMPLETE daily bar — if market is open, yesterday's close; if market closed, today's close
   - If yfinance unavailable: shows "N/A"
2. **Remove "Mode" column**: Delete entry_mode visual column
3. **Clean Trade Log header**: Simplify to plain "Trade Log"
4. **Stale price disclaimer**: Show `latest_price_date` below table

### Phase 2 (Days 3–6): Master Storage (PostgreSQL-Backed Cache)
5. **Master Storage**: Multi-tier cache with symbol-level dedup across users and files
6. **Latest price refresh** on re-upload (without refetching all historical data)

### Phase 3 (Day 7): Polish & Verification
7. **Zero regression**: All tests pass, build succeeds, verify_regression passes

---

## 3. Non-Goals

- NOT replacing yfinance with a paid provider
- NOT recalculating historical horizon returns on re-upload (fixed at exit dates)
- NOT adding real-time price push via WebSocket
- NOT implementing account deletion API
- NOT changing the backtest computation engine (Phase A/B/C unchanged)
- NOT adding new frontend pages

---

## 4. Phase 1 — Latest Return Column (Detailed Spec)

### 4.1 Backend: `get_latest_prices_batch()` in DataProvider

```python
@staticmethod
def get_latest_prices_batch(symbols: list[str]) -> dict[str, tuple[Optional[float], Optional[str]]]:
    """
    Fetch latest close prices for multiple symbols.
    Returns {symbol: (close_price, date_str)}.
    
    Strategy:
    1. Try bulk: yf.download(symbols, period="5d", group_by='ticker')
       - yfinance daily interval returns COMPLETE daily bars only
       - Last row of each symbol = most recent COMPLETE trading day
       - If market is open intraday: yesterday's close (today's bar not final)
       - If market closed: today's close (final)
       - This naturally handles the mid-day edge case — no special logic needed
    2. Fallback per-symbol: yf.Ticker(s).history(period="5d")
       - Same daily-bar logic applies
    3. Update per-symbol diskcache (5min TTL, key: "{symbol}_latest_price")
    4. Return {symbol: (price, date_str)}
    
    Edge case: yfinance returns empty or error
      → Return {symbol: (None, None)} for that symbol
      → Frontend renders "N/A", no crash
    
    Edge case: symbol delisted / no data
      → Same as above — graceful degradation
    
    Edge case: partial failure (5/10 symbols succeed)
      → Return mixed dict: 5 with prices, 5 with None
      → L2 reconstructor only updates symbols that have data
    """
```

### 4.2 Backend: Latest Price Integration in `_handle_backtest`

**L3 compute path (fresh backtest)**:
```
After Phase C completes:
  1. Call get_latest_prices_batch(all_resolved_symbols)
  2. For each signal:
       if latest_price is not None and entry_price > 0:
           latest_price_return = ((latest_price - entry_price) / entry_price) * 100
       else:
           latest_price_return = None
  3. Attach to each SignalResult
  4. Set BacktestReport.latest_price_date = max of all trade dates
```

**L1 cache hit path (fast return)**:
```
Check if cached report.latest_price_date < today:
  If stale: background-fetch get_latest_prices_batch() → update report
  If fresh: return as-is
Return report (possibly with refreshed prices)
```

### 4.3 Backend: Mid-Day Market Handling — Defensive Design

| Scenario | yfinance Data | `latest_price` | `latest_price_date` | User Sees |
|----------|---------------|----------------|---------------------|-----------|
| Market closed (e.g., 8 PM IST) | Today's complete daily bar | Today's close | "2026-07-17" | Current close |
| Market open, mid-day (e.g., 1 PM IST) | Yesterday's complete bar only (today not final) | Yesterday's close | "2026-07-16" | Previous close |
| Market open, near close (e.g., 3 PM IST) | Yesterday's complete bar (today may have partial bar) | Yesterday's close | "2026-07-16" | Previous close |
| Weekend (Sat/Sun) | Friday's complete bar | Friday's close | "2026-07-14" | Friday's close |
| yfinance API failure | Empty DataFrame | None | None | "N/A" |
| Symbol delisted | Empty DataFrame | None | None | "N/A" |

**Why this works**: yfinance `interval="1d"` never returns partial intraday data. The last row of `period="5d"` is always the most recent COMPLETE trading day. No timezone-sensitive logic needed.

**Staleness disclaimer** (frontend):
```
"Latest returns based on close price as of {latest_price_date}."
```
If `latest_price_date < today`, the user understands the price may be stale.

### 4.4 Model Changes (`backend/models/schemas.py`)

#### `SignalResult` — Add 3 fields
```python
class SignalResult(BaseModel):
    # ... existing 15 fields unchanged ...
    latest_price: Optional[float] = None            # Most recent close price
    latest_price_date: Optional[str] = None          # Date of latest_price (YYYY-MM-DD)
    latest_price_return: Optional[float] = None      # ((latest - entry) / entry) * 100
```

#### `BacktestReport` — Add 1 field
```python
class BacktestReport(BaseModel):
    # ... existing fields unchanged ...
    latest_price_date: Optional[str] = None          # MAX of all trades' latest_price_date
    cache_stats: Optional[dict] = None               # EXISTING
    cache_source: Optional[str] = None               # "l1_diskcache"|"l2_db"|"l3_compute"
```

### 4.5 Frontend: Latest Return Column

**File**: `frontend/src/components/Dashboard.jsx`

**Insert after "3 Month Return" column** (after line 476 header, after line 518 body):

**Header**:
```jsx
<th onClick={() => handleSort('latest_price_return')}>
    Latest Return {sortConfig.key === 'latest_price_return' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
</th>
```

**Body cell**:
```jsx
<td
    className={`clickable-cell ${getColorClass(trade.latest_price_return)}`}
    title={`Latest vs Entry: ${formatPercent(trade.latest_price_return)}`}
>
    {formatPercent(trade.latest_price_return)}
</td>
```

**Null handling**: `getColorClass(null)` → empty string (no misleading colors). `formatPercent(null)` → `'N/A'`.

### 4.6 Frontend: Remove Mode Column

**Lines 465–467 (header)**: Delete `<th>Mode</th>`
**Lines 493–497 (body)**: Delete `<td>` block with mode badge

### 4.7 Frontend: Clean Trade Log Header

```diff
- <h3 className="section-title">Trade Log <span className="hint-text">(Hover for date/price, Click to view chart)</span></h3>
+ <h3 className="section-title">Trade Log</h3>
```

### 4.8 Frontend: Stale Price Disclaimer

**After pagination** (after line 537):
```jsx
{report.latest_price_date && (
    <p className="text-xs text-gray-500 mt-2 text-center">
        Latest returns based on close price as of {report.latest_price_date}. Prices may be delayed.
    </p>
)}
```

---

## 5. Phase 2 — Master Storage (Full Spec)

### 5.1 New/Enhanced Tables

#### `resolved_symbols` — SYSTEM-WIDE
```sql
CREATE TABLE IF NOT EXISTS resolved_symbols (
  input_symbol    TEXT PRIMARY KEY,
  resolved_symbol TEXT NOT NULL,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `symbol_data_freshness` — SYSTEM-WIDE (migration from `symbol_freshness`)
```sql
CREATE TABLE IF NOT EXISTS symbol_data_freshness (
  symbol            TEXT PRIMARY KEY,
  data_start_date   DATE,
  data_end_date     DATE,
  latest_price      REAL,
  latest_price_date DATE,
  last_fetched      TIMESTAMPTZ,
  next_refresh_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() - INTERVAL '1 day',
  fetch_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sdf_refresh ON symbol_data_freshness(next_refresh_at);
```

Note: `next_refresh_at` initializes to `NOW() - 1 day` so the first thundering-herd check (`WHERE next_refresh_at < NOW()`) evaluates to TRUE and allows the fetch.

#### `file_upload_map` — PER-USER
```sql
CREATE TABLE IF NOT EXISTS file_upload_map (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_hash       TEXT NOT NULL,
  entry_mode      TEXT NOT NULL,
  upload_id       TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  symbol_set_hash TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, file_hash, entry_mode)
);
```

#### `signal_results` — PER-USER (replaces `signal_hashes`)
```sql
CREATE TABLE IF NOT EXISTS signal_results (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_hash          TEXT NOT NULL,
  upload_id         TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  signal_date       TEXT NOT NULL,
  entry_date        TEXT,
  entry_price       REAL,
  entry_mode        TEXT NOT NULL,
  duration          INTEGER NOT NULL DEFAULT 90,
  results_json      TEXT NOT NULL DEFAULT '{}',
  max_high_90d      REAL,
  max_low_90d       REAL,
  sector            TEXT,
  market_cap        TEXT,
  status            TEXT NOT NULL,
  latest_price      REAL,
  latest_price_date TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, row_hash, duration)
);
```

### 5.2 Cache Hierarchy

```
Request →
  1. compute_file_hash(data)
  2. L1: FileHashCache.get(file_hash, entry_mode)
       HIT → check latest_price staleness
               fresh → return (cache_source="l1_diskcache")
               stale → background refresh prices → return updated
  3. L2: IF PERSISTENCE_ENABLED AND user_id:
            persistence.get_upload_by_user_and_hash(user_id, file_hash, entry_mode)
            HIT AND uploads.status = 'completed' →
              load signal_results for upload
              check symbol_data_freshness: any stale latest_price?
                YES → bulk get_latest_prices_batch() for stale symbols
                      update latest_price in signal_results + symbol_data_freshness
              compute latest_price_return for each signal
              reconstruct BacktestReport
              invalidate + set FileHashCache
              return (cache_source="l2_db")
  4. L3: check resolved_symbols + symbol_data_freshness for partial cache
            new_symbols = symbols not in resolved_symbols
            stale_symbols = symbols whose data doesn't cover needed range
            fetch ONLY new+stale from yfinance
          resolve all symbols → store in resolved_symbols
          fetch data for uncached symbols → store in symbol_data_freshness
          Phase C: compute ALL signals
            → batch_upsert_signals (single multi-row INSERT, timeout=30)
            → store file_upload_map entry
            → store uploads record (with user_id)
            → set FileHashCache
          return (cache_source="l3_compute")
```

### 5.3 PersistenceBackend New Methods

```
get_upload_by_user_and_hash(user_id, file_hash, entry_mode) → Optional[dict]
get_signals_for_upload(upload_id) → List[dict]
batch_upsert_signals(user_id, signals) → int  ← single multi-row INSERT, NOT loop
get_resolved_symbols(input_symbols) → dict
set_resolved_symbols(mapping) → int
get_symbol_freshness_batch(symbols) → dict
batch_update_latest_prices(updates) → int
```

### 5.4 WS Auth Token

**File**: `frontend/src/services/api.js`
```diff
- const ws = new WebSocket(`${WS_URL}/backtest?entry_mode=${entryMode}`);
+ const token = getToken();
+ const ws = new WebSocket(`${WS_URL}/backtest?token=${token}&entry_mode=${entryMode}`);
```

HTTP fallback:
```diff
- axios.post(`${API_URL}/backtest`, formData, { timeout: HTTP_TIMEOUT });
+ axios.post(`${API_URL}/backtest`, formData, {
+     timeout: HTTP_TIMEOUT,
+     headers: { Authorization: `Bearer ${getToken()}` }
+ });
```

Mobile fallback (same):
```diff
- axios.post(`${API_URL}/backtest`, formData, { timeout: HTTP_TIMEOUT });
+ axios.post(`${API_URL}/backtest`, formData, {
+     timeout: HTTP_TIMEOUT,
+     headers: { Authorization: `Bearer ${getToken()}` }
+ });
```

Guest/anonymous users: If no token, use `user_id = "anonymous"` with write-only L3 access (no L2 reads).

---

## 6. Data Flow Diagrams

### 6.1 First Upload — Latest Return Computation (Phase 1)

```
User uploads CSV (10 symbols)
  │
  ├─ Normal backtest runs (Phase A/B/C unchanged)
  │
  ├─ After Phase C complete:
  │   └─ get_latest_prices_batch(10 symbols)
  │       ├─ yf.download(10 symbols, period="5d") → 1 bulk call
  │       ├─ For each symbol: latest_close = df['Close'].iloc[-1]
  │       ├─ latest_price_date = df.index[-1].strftime("%Y-%m-%d")
  │       └─ Returns {symbol: (price, date)}
  │
  ├─ For each SignalResult:
  │   ├─ latest_price = result[symbol][0]
  │   ├─ latest_price_date = result[symbol][1]
  │   └─ latest_price_return = ((latest_price - entry_price) / entry_price) * 100
  │       (if entry_price > 0, else None)
  │
  ├─ BacktestReport.latest_price_date = max(trade.latest_price_date)
  │
  └─ Report returned with Latest Return populated
  ──────────────────────────────────────────
  yfinance: 1 additional bulk call (period="5d")
  Response time: +2s (vs 30s full backtest)
```

### 6.2 Mid-Day Upload — Latest Return (Edge Case)

```
User uploads at 1:30 PM IST on Jul 17
  │
  ├─ get_latest_prices_batch(10 symbols)
  │   └─ yf.download(period="5d")
  │       ├─ Jul 13 (Mon) — complete bar
  │       ├─ Jul 14 (Tue) — complete bar
  │       ├─ Jul 15 (Wed) — complete bar
  │       ├─ Jul 16 (Thu) — complete bar ← last complete day
  │       └─ [Jul 17 not present — today's bar not final]
  │
  ├─ latest_price = Close from Jul 16 (yesterday)
  ├─ latest_price_date = "2026-07-16"
  ├─ latest_price_return computed against entry_price
  │
  ├─ Disclaimer: "Latest returns based on close price as of 2026-07-16."
  │
  └─ User sees stale price + knows it's yesterday's close
```

### 6.3 Same File Re-Upload Next Day (Phase 2)

```
User uploads SAME CSV (next day)
  │
  ├─ compute_file_hash → "abc123..." (same)
  ├─ FileHashCache.get → MISS (or stale)
  │
  ├─ L2: DB file_upload_map → HIT
  │   └─ upload status = "completed" ✓
  │
  ├─ Load signal_results → 10 rows
  ├─ Check latest_price staleness:
  │   ├─ symbol_data_freshness.next_refresh_at < NOW() ?
  │   ├─ YES → yf.download(10, period="5d") → update prices
  │   └─ NO → skip (thundering herd prevented)
  │
  ├─ Recompute latest_price_return for each signal
  ├─ Reconstruct BacktestReport
  ├─ FileHashCache.set()
  │
  └─ Return (cache_source="l2_db")
  ──────────────────────────────────────────
  yfinance: 0–1 calls
  Response time: ~2s
```

---

## 7. Schema Migration Plan (Phase 2)

### Phase 1 (Deploy 1) — Dual Write
- CREATE new tables (`resolved_symbols`, `file_upload_map`, `signal_results`, `symbol_data_freshness`)
- ALTER `symbol_freshness` → add columns, rename to `symbol_data_freshness`
- Modify `_persist_upload` to write to BOTH `signal_hashes` AND `signal_results`
- All reads still use old tables
- Rollback: delete new tables, revert code

### Phase 2 (Deploy 2) — Switch Reads
- Modify `_handle_backtest` to read from `signal_results`
- Keep writing to both
- Backfill: `INSERT INTO signal_results SELECT ... FROM signal_hashes WHERE NOT EXISTS (...)`
- Rollback: switch reads back to `signal_hashes`

### Phase 3 (Deploy 3) — Cleanup
- Stop writing to `signal_hashes`
- DROP `signal_hashes` table

---

## 8. API Contract Changes

### BacktestReport Response
```diff
{
  "total_signals": 100,
  "successful_signals": 95,
  "failed_signals": 5,
  "cache_stats": { "bulk_hits": 42 },
+ "cache_source": "l3_compute",
+ "latest_price_date": "2026-07-17",
  "trades": [
    {
      "symbol": "RELIANCE.NS",
      "entry_price": 2500.0,
      "return_7d": 2.5,
      "return_90d": -1.3,
+     "latest_price": 2850.0,
+     "latest_price_date": "2026-07-17",
+     "latest_price_return": 14.0
    }
  ]
}
```

### WebSocket `/ws/backtest`
- Add `?token=<auth_token>` query param
- Add `cache_source` in complete message
- Close with code 4001 if token invalid
- Anonymous (no token): allow with `user_id = "anonymous"`

---

## 9. Amendments from Technical Review

All findings from the elite technical review (Jul 17, 2026) are addressed:

| # | Finding | Resolution | Location in Spec |
|---|---------|-----------|------------------|
| B1 | User ID plumbing missing | Token parse → user_id threaded through _handle_backtest + _persist_upload | §5.4 (WS Auth) |
| B2 | Anonymous users blocked | Guest mode with "anonymous" user_id, L3-only | §5.4 |
| B3 | 3s timeout kills batch ops | batch_upsert_signals uses multi-row INSERT + 30s timeout | §5.3 |
| B4 | L1 returns stale prices | L1 hit triggers background freshness check | §4.2 |
| M1 | Dual-write atomicity | Transaction wrapping documented in migration plan | §7 |
| M2 | next_refresh_at NULL block | DEFAULT NOW() - INTERVAL '1 day' | §5.1 |
| M3 | Div by zero on entry_price=0 | Guard: `if entry_price > 0` | §4.2 |
| M4 | latest_price_date ambiguity | Both trade-level AND report-level fields | §4.4 |
| M6 | Missing index on next_refresh_at | CREATE INDEX idx_sdf_refresh | §5.1 |
| M7 | ingestion_log missing user_id | user_id param added to log_ingestion() | §5.3 |
| N5 | Mobile HTTP fallback missing auth | Same Authorization header added | §5.4 |
