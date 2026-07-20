# ADR-002: PostgreSQL-Backed Master Storage with Symbol-Level Dedup

## Status
**Amended** — Jul 17, 2026

**Key amendments**:
1. Latest Return column is now **#1 priority** (independent Phase 1, ships before master storage)
2. Mid-day market handling spec'd with graceful degradation
3. Kaizen principle applied: 3-phase chronological rollout (not big-bang)
4. Elite technical review findings (12 issues) all resolved in spec

## Date
2026-07-17 (Original) / 2026-07-17 (Amended)

## Context

### Phase 1 Context (Latest Return — Immediate Need)
Users need to see current market return vs. entry price in TradeLog. Currently:
- TradeLog shows 1w/1m/3m horizon returns (historical, fixed at exit dates)
- No column shows "what is this stock worth RIGHT NOW vs what I paid"
- No handling for mid-day runs (market open → stale latest price)
- No handling for yfinance API failures (missing price → crash or no data)

### Phase 2 Context (Master Storage — Production Need)
The backtester has ephemeral caching:
- FileHashCache (diskcache, 30d TTL): caches full report by file content hash. Survives restarts but not multi-instance.
- Row-hash cache (diskcache, 30d TTL): caches per-signal results by SHA-256 of (symbol|date|mode|duration).
- Symbol OHLC cache (diskcache, range-aware): caches per-symbol historical data with 24h-30d TTL.
- PostgreSQL persistence (write-only): stores uploads + signal_hashes after computation, but is NEVER read for cache hits.

Problems:
1. Same file re-upload within 30d → FileHashCache HIT → fast. After 30d → full yfinance re-fetch.
2. Different file, same symbols → full yfinance re-fetch for ALL symbols.
3. User B uploads same symbols as User A → full yfinance re-fetch. No cross-user dedup.
4. No user isolation — cache is global.
5. No partial cache hits — additive symbol sets not supported.

## Decision

### Phase 1 (Ship NOW): Latest Return Column
1. Implement `get_latest_prices_batch()` in DataProvider — fetches `period="5d"` daily closes
2. Add `latest_price`, `latest_price_date`, `latest_price_return` to SignalResult
3. Handle mid-day: use last COMPLETE daily bar (yfinance interval="1d" never returns partial data)
4. Handle yfinance failure: return None gracefully — frontend shows "N/A"
5. Frontend: add Latest Return column, remove Mode column, clean header, add disclaimer
6. Ships independently — no storage changes needed

**Rationale**: yfinance `period="5d"` at daily interval always returns complete daily bars. The last row is the most recent COMPLETE trading day's close. If market is open intraday, today's bar is not yet final so yesterday's close is returned. This naturally handles mid-day without timezone logic.

### Phase 2 (Ship Next): 3-Tier Cache Hierarchy

```
L1: FileHashCache (diskcache, 30d) — fast in-process
L2: PostgreSQL (file_upload_map + signal_results) — persistent, shared across instances
L3: Full backtest computation (yfinance) — fallback

System-wide dedup:
  - resolved_symbols: input → resolved (e.g., "RELIANCE" → "RELIANCE.NS")
  - symbol_data_freshness: OHLC range + latest price per symbol

Per-user:
  - signal_results: computed results keyed by (user_id, row_hash, duration)
  - file_upload_map: maps file_hash → upload for each user
```

### Key Design Decisions

1. **User isolation via `user_id` in PK** — All per-user queries include `AND user_id=$N`
2. **System-wide symbol caches** — `resolved_symbols` and `symbol_data_freshness` shared across users
3. **Thundering herd protection** — `UPDATE ... WHERE next_refresh_at < NOW() RETURNING *` with initial value `NOW() - 1 day`
4. **Partial cache hits** — Compare symbol_set_hash; only fetch uncached symbols
5. **Latest price refresh** — On re-upload, only fetch `period="5d"` for stale symbols
6. **Dual-write migration** — Phase 1: write both tables; Phase 2: switch reads; Phase 3: drop old
7. **Guest/anonymous mode** — No token → `user_id = "anonymous"` with L3-only access

### Changes from V1 (Technical Review Amendments)

| Finding | V1 Gap | V2 Fix |
|---------|--------|--------|
| B1 | No user_id in backtest pipeline | WS token → user_id threaded through `_handle_backtest` + `_persist_upload` |
| B2 | Anonymous users blocked | Guest mode with `user_id = "anonymous"` |
| B3 | 3s timeout kills batch inserts | `batch_upsert_signals` uses multi-row INSERT with `timeout=30` |
| B4 | L1 returns stale prices | L1 hit triggers background freshness check |
| M1 | Dual-write no atomicity | Transaction-wrapped writes documented |
| M2 | `next_refresh_at` NULL never matches | `DEFAULT NOW() - INTERVAL '1 day'` |
| M3 | Div by zero on `entry_price=0` | `if entry_price > 0` guard |
| M4 | `latest_price_date` ambiguity | Both trade-level AND report-level fields |
| M6 | No index on `next_refresh_at` | `CREATE INDEX idx_sdf_refresh` |
| M7 | `ingestion_log` no user_id | `user_id` param added to `log_ingestion()` |
| N5 | Mobile HTTP no auth | Authorization header added to mobile fallback |

## Alternatives Considered

### Pure Redis Cache
- Pros: Fast, shared across instances
- Cons: No queryability, no persistence guarantees, eviction under pressure
- Rejected for Phase 2 (need durable user data)

### Keep DiskCache Only, Increase TTL
- Pros: No code changes
- Cons: No cross-user dedup, no user isolation, no partial hits
- Rejected for Phase 2

### Use S3/Object Storage for Report JSONs
- Pros: Cheap, simple
- Cons: Can't query per-signal, can't update individual latest_price
- Rejected for Phase 2

## Consequences

### Phase 1 (Immediate)
- Users see "what is this stock worth NOW" in TradeLog
- Mid-day uploads automatically show yesterday's close (last complete bar)
- yfinance failures result in "N/A" — no crash, no confusion
- Cleaner UI: no Mode column, no noisy header text
- ~7h implementation, ships in 1–2 days

### Phase 2 (Follow-on)
- Cross-user dedup: User B gets User A's symbols at ZERO yfinance cost
- Same-file re-upload: <50ms (L1) or ~2s (L2 with price refresh)
- Partial additions: 5 new + 95 cached = 5 yfinance calls (not 100)
- Proper user isolation
- Complete audit trail in PostgreSQL
- ~22h implementation over days 3–7

### Risks (Updated for V2)

| Risk | Mitigation | Status |
|------|-----------|--------|
| yfinance rate limit at scale | Master storage minimizes calls; Phase 1 unaffected | ✅ Spec'd |
| Mid-day stale price confusion | Disclaimer shows `latest_price_date` | ✅ Spec'd |
| yfinance API failure on latest price | Graceful None → "N/A" display | ✅ Spec'd |
| Migration data loss | Dual-write, rollback at any phase | ✅ Spec'd |
| Partial crash stores incomplete data | L2 checks `uploads.status = 'completed'` | ✅ Spec'd |
| Cross-user data leakage | Every query includes `AND user_id=$N` | ✅ Spec'd |
| Thundering herd on symbol cache | `next_refresh_at` compare-and-swap | ✅ Spec'd |

## References
- SPEC_MASTER_STORAGE.md (V2) — Detailed technical specification with chronological ordering
- TASK_MASTER_STORAGE.md (V2) — Kaizen task breakdown with 3 phases
- VERIFICATION_MASTER_STORAGE.md (V2) — Verification plan with mid-day scenario
- Pre-mortem review (11 personas) — Consolidated risk register (Jul 17, 2026)
- Elite Technical Review (Jul 17, 2026) — 12 issues found, all resolved
