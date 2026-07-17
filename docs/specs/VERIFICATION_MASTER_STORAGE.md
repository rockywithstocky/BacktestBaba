# VERIFICATION: Master Storage System — Test & Verification Plan

**Amended Jul 17, 2026**: Added Scenario H (Mid-Day Latest Return) + phased verification gates.

---

## Verification Philosophy (Kaizen)

Each phase has its own verification gate. When Phase 1 passes, we ship Phase 1.
We do NOT wait for Phase 2 to verify Phase 1.

```
Phase 1 Gate → SHIP → Phase 2 Gate → SHIP → Phase 3 Gate → FINAL
```

---

## Phase 1 Test Scenarios (Latest Return)

### Scenario 1: Latest Return — Normal (Market Closed)

**Setup**: Market closed. yfinance returns 5 complete daily bars.

**Steps**:
1. Upload CSV with 10 symbols
2. Backtest completes

**Expected**:
- Every `SignalResult` has `latest_price` (float), `latest_price_date` (str), `latest_price_return` (float)
- `latest_price_date` ≤ today
- `latest_price_return = ((latest_price - entry_price) / entry_price) * 100`
- `BacktestReport.latest_price_date` = max of all trade dates
- Entry_price=0 signals have `latest_price_return = None`

**Verify**:
```javascript
report.trades.forEach(t => {
  if (t.entry_price > 0) {
    assert(t.latest_price !== null, `${t.symbol}: latest_price should not be null`);
    assert(t.latest_price_date !== null, `${t.symbol}: latest_price_date should not be null`);
    assert(t.latest_price_return !== null, `${t.symbol}: latest_price_return should not be null`);
    assert(Math.abs(t.latest_price_return - ((t.latest_price - t.entry_price) / t.entry_price * 100)) < 0.01);
  }
});
assert(report.latest_price_date === max(t.latest_price_date), 'Report date equals max trade date');
```

### Scenario 2: Mid-Day Run (Market Open) — EDGE CASE

**Setup**: Market is open (e.g., 1:30 PM IST on a weekday). yfinance returns 4 complete daily bars — today's bar is NOT final.

**Steps**:
1. Upload CSV with 10 symbols at 1:30 PM IST
2. Wait for backtest to complete

**Expected**:
- `latest_price` = yesterday's close (last COMPLETE daily bar)
- `latest_price_date` = yesterday's date (e.g., "2026-07-16" if today is Jul 17)
- `latest_price_return` = valid percentage
- `BacktestReport.latest_price_date` = yesterday's date
- NO crash, NO NaN, NO division by zero

**Verify**:
```javascript
report.trades.forEach(t => {
  assert(t.latest_price_date < today, 'Mid-day: latest price should be from yesterday');
  assert(t.latest_price_return !== null || t.entry_price === 0, 'Mid-day: return should be valid');
});
```

### Scenario 3: yfinance API Failure — EDGE CASE

**Setup**: yfinance is down or rate-limited. `get_latest_prices_batch()` returns empty.

**Steps**:
1. Upload CSV
2. Backtest runs but latest price fetch fails

**Expected**:
- `latest_price = None` for all trades
- `latest_price_date = None`
- `latest_price_return = None`
- `BacktestReport.latest_price_date = None`
- Frontend: all show "N/A" for Latest Return
- NO crash, NO error thrown, NO retry loop

**Verify**:
```javascript
report.trades.forEach(t => {
  assert(t.latest_price === null, 'On yfinance failure: latest_price should be null');
  assert(t.latest_price_return === null, 'On yfinance failure: return should be null');
});
```

### Scenario 4: Latest Return Sort + Display

**Setup**: Backtest completed with Latest Return data.

**Steps**:
1. Click "Latest Return" column header in TradeLog
2. Verify sort direction toggles

**Expected**:
- Click → sort ascending by `latest_price_return`
- Click again → sort descending
- Green background for positive returns
- Red background for negative returns
- No background for null returns

**Verify**: Visual inspection + frontend unit tests.

### Scenario 5: Mode Column Removed

**Setup**: Backtest completed.

**Steps**: Visual inspection of TradeLog.

**Expected**:
- No "Mode" column header
- No mode badge (`Open`/`Close`) in rows
- Header is plain "Trade Log" (no hint text)
- Disclaimer text visible below pagination

**Verify**: Visual inspection.

### Phase 1 Gate Checklist
- [ ] All 5 scenarios pass
- [ ] `pytest backend/tests/ -v` — 59+ passed
- [ ] `npm run test` — 7+ passed
- [ ] `npm run build` — succeeds
- [ ] `verify_regression.py` — SUCCESS
- [ ] Frontend shows Latest Return, no Mode column, clean header, disclaimer

---

## Phase 2 Test Scenarios (Master Storage)

### Scenario A: Fresh Upload — "First time ever"

**Setup**: Clean database, no cached data for any symbol.

**Steps**:
1. Upload CSV with 10 symbols
2. Wait for backtest to complete

**Expected**:
- `cache_source = "l3_compute"`
- `signal_results` table has 10 rows for this user
- `resolved_symbols` table has 10 rows
- `symbol_data_freshness` has 10 rows with valid `data_start_date`/`data_end_date`
- `file_upload_map` has 1 row
- `uploads.status = "completed"`
- `ingestion_log` has `user_id` populated (not NULL)
- yfinance: 1 bulk call + up to 10 resolution calls

**Verify**:
```sql
SELECT count(*) FROM signal_results WHERE user_id='test-user-id';  → 10
SELECT count(*) FROM resolved_symbols;  → 10
SELECT status FROM uploads ORDER BY created_at DESC LIMIT 1;  → completed
SELECT user_id FROM ingestion_log ORDER BY created_at DESC LIMIT 1;  → 'test-user-id'
```

### Scenario B: Same File Re-Upload (Same User, Same Day) — L1 Hit

**Setup**: Scenario A completed. Same CSV file re-uploaded within 30s.

**Steps**:
1. Upload same CSV
2. Measure response time

**Expected**:
- `cache_source = "l1_diskcache"`
- Response time: <100ms
- ZERO yfinance calls
- `latest_price` and `latest_price_return` populated
- Disclaimer shows cached timestamp

**Verify**:
```javascript
report.cache_source === "l1_diskcache"
responseTime < 100
```

### Scenario C: Same File Re-Upload (Same User, Next Day) — L2 Hit

**Setup**: Scenario A completed yesterday. L1 cache cleared. Same CSV uploaded today.

**Steps**:
1. Clear diskcache (or restart backend)
2. Upload same CSV

**Expected**:
- `cache_source = "l2_db"`
- Response time: ~2s
- 1 yfinance call for latest prices (if stale)
- `latest_price` updated to today's market price (or yesterday's if mid-day)
- Historical `return_7d`, `return_30d` etc. UNCHANGED
- `latest_price_return` recomputed with new price

**Verify**:
```javascript
report.cache_source === "l2_db"
report.trades[0].latest_price !== previous_price
report.trades[0].return_7d === cached_value_from_yesterday  // unchanged
```

### Scenario D: Partial Overlap — "8 old + 2 new symbols"

**Setup**: Scenario A completed. Upload new CSV with 8 same symbols + 2 new.

**Steps**:
1. Upload CSV with 8 old + 2 new symbols
2. Wait for backtest

**Expected**:
- `cache_source = "l3_compute"`
- `resolved_symbols`: 8/10 HIT, 2/10 fetched
- `symbol_data_freshness`: 8/10 HIT, 2/10 fetched
- yfinance: 1 bulk for 2 new + 2 resolve = ~3 calls (NOT 10)
- All 10 signals computed and stored

**Verify**:
```python
from backend.core.data_provider import DataProvider
stats = DataProvider.get_cache_stats()
print(stats["bulk_hits"])  # ≥ 8 cache hits
```

### Scenario E: Cross-User Dedup — "User B uploads User A's symbols"

**Setup**: Scenario A completed as User A. User B logs in and uploads overlapping symbols.

**Steps**:
1. Login as User B
2. Upload CSV with 5 symbols from User A's set

**Expected**:
- `resolved_symbols`: 5/5 HIT
- `symbol_data_freshness`: 5/5 HIT
- yfinance: ZERO calls
- `signal_results` for User B: 5 new rows
- `file_upload_map` for User B: 1 new row
- User A's data untouched

**Verify**:
```sql
SELECT user_id, count(*) FROM signal_results GROUP BY user_id;
→ user_a_id: 10, user_b_id: 5
```

### Scenario F: Thundering Herd Prevention

**Setup**: Scenario A completed. Two concurrent requests for same symbols.

**Steps**:
1. Trigger 2 concurrent backtests from 2 browser tabs
2. Both reach L2 cache miss

**Expected**:
- Only ONE request fetches latest prices from yfinance
- Second sees `next_refresh_at > NOW()` → skips
- Both complete successfully
- `fetch_count` increments by exactly 1 per symbol

**Verify**:
```sql
SELECT symbol, fetch_count FROM symbol_data_freshness;
→ Each symbol: fetch_count = 1 (not 2)
```

### Scenario G: Partial Crash — "Backend dies mid-persist"

**Setup**: Backend crashes after writing 5/10 signals.

**Steps**:
1. Force-kill backend after 5 signals stored
2. Restart backend
3. Re-upload same file

**Expected**:
- `file_upload_map` MISS (upload never completed)
- L2: `uploads.status = 'pending'` → treated as MISS
- Full recompute (L3)
- No corrupted partial data served

**Verify**:
```javascript
report.cache_source === "l3_compute"
report.total_signals === 10
```

### Phase 2 Gate Checklist
- [ ] All 7 scenarios (A–G) pass
- [ ] `pytest backend/tests/ -v` — 66+ passed
- [ ] Dual-write parity verified
- [ ] Pre-mortem closure items all ✅

---

## Phase 3 Final Verification

### API Contract Checks
```
# L1 cache path (same file, same session)
POST /api/backtest → response.cache_source === "l1_diskcache"

# L2 cache path (after L1 cleared)
POST /api/backtest → response.cache_source === "l2_db"
response.trades[0].latest_price !== null
response.trades[0].latest_price_return !== null

# L3 compute path (first upload)
POST /api/backtest → response.cache_source === "l3_compute"
```

### Full Regression
```
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto
→ All tests passed

docker compose exec backend python backend/tests/verify_regression.py
→ SUCCESS: Both methods produced exactly identical reports!

cd frontend && npm run test
→ 7 passed (Dashboard tests)

cd frontend && npm run build
→ ✓ built successfully
```

### Pre-Mortem Closure Checklist

| ID | Risk | Verification | Status |
|----|------|-------------|--------|
| R1-1 | WS auth | WS without token → anonymous mode | ✅ |
| F1 | WS auth in mobile fallback | HTTP fallback passes `Authorization` header | ✅ |
| R1-2 | User isolation | signal_results queries include `AND user_id=$N` | ✅ |
| R2-4 / R3-1 | Thundering herd | Scenario F passes | ✅ |
| R3-2 | L1 cache stale | After L2 refresh, L1 returns fresh data | ✅ |
| R4-2 | Migration rollback | Dual-write parity verified | ✅ |
| R5-4 | Partial crash | Scenario G passes | ✅ |
| S1 | Cache source visibility | Response includes `cache_source` | ✅ |
| L5 | Stale price disclaimer | Dashboard shows date + disclaimer | ✅ |
| P1 | Account deletion | Deferred (tracked separately) | 📋 |
| NEW | Mid-day latest price | Scenario 2 passes (uses last complete bar) | ✅ |
| NEW | yfinance API failure | Scenario 3 passes (graceful None) | ✅ |

### Phase 3 Gate Checklist (FINAL)
- [ ] Phase 1 gate ✅
- [ ] Phase 2 gate ✅
- [ ] All regression tests pass
- [ ] Pre-mortem all ✅ or 📋
- [ ] `RESUME_WORK.md` updated
- [ ] `AGENTS.md` updated with Kaizen findings
- [ ] Production deploy green
