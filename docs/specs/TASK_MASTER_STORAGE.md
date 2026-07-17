# TASK: Chronological Implementation Plan (Kaizen)

## Kaizen Principle

Each phase is an independent value-delivery increment:
- **Phase 1** (Days 1–2): Latest Return feature → user-visible value in hours
- **Phase 2** (Days 3–6): Master Storage → infrastructure for scale
- **Phase 3** (Day 7): Polish + Verification → quality gate

Each phase includes its own test gate. No phase blocks another's deployment.

---

## Phase 1 (Days 1–2): Latest Return + TradeLog Cleanup

### Track 1: Backend Latest Price & Return (P0 — 4h)
**Goal**: `get_latest_prices_batch()`, model fields, mid-day handling

| ID | Task | File | Est. | Deps |
|----|------|------|------|------|
| 1.1 | Add `latest_price`, `latest_price_date`, `latest_price_return` to `SignalResult` | `schemas.py` | 10min | None |
| 1.2 | Add `latest_price_date`, `cache_source` to `BacktestReport` | `schemas.py` | 5min | None |
| 1.3 | Implement `get_latest_prices_batch(symbols) → dict[symbol, (price, date)]` | `data_provider.py` | 2h | None |
| 1.4 | Integrate latest price fetch AFTER Phase C in `run_backtest_async` | `backtester.py` | 1h | 1.1, 1.3 |
| 1.5 | Compute `latest_price_return` with null guards (`entry_price > 0`) | `backtester.py` | 30min | 1.4 |
| 1.6 | Set `BacktestReport.latest_price_date = max(trade.latest_price_date)` | `backtester.py` | 15min | 1.2 |
| 1.7 | Add background freshness check on L1 cache hit | `main.py` | 1h | 1.3 |
| 1.8 | Add `cache_source` tracking in `_handle_backtest` | `main.py` | 30min | None |
| 1.9 | Verify: pytest 59/59 pass + manual API test with mid-day data | — | 1h | 1.1–1.8 |

**Verification gate**: `pytest backend/tests/ -v` → 59 passed. API response includes `latest_price`, `latest_price_return`, `latest_price_date`.

### Track 2: Frontend Latest Return Column (P0 — 3h)
**Goal**: TradeLog shows Latest Return column, Mode removed, clean header

| ID | Task | File | Est. | Deps |
|----|------|------|------|------|
| 2.1 | Add "Latest Return" sortable column header after 3 Month Return | `Dashboard.jsx` header | 15min | 1.1 (model) |
| 2.2 | Add "Latest Return" column cell with `getColorClass` + `formatPercent` | `Dashboard.jsx` body | 15min | 2.1 |
| 2.3 | Null handling: `getColorClass(null)` → "" , `formatPercent(null)` → "N/A" | `Dashboard.jsx` | 10min | 2.2 |
| 2.4 | Remove "Mode" column header | `Dashboard.jsx` line 465-467 | 5min | None |
| 2.5 | Remove "Mode" column cell (mode badge block) | `Dashboard.jsx` line 493-497 | 5min | None |
| 2.6 | Simplify Trade Log header to plain text | `Dashboard.jsx` line ~422 | 5min | None |
| 2.7 | Add stale price disclaimer below pagination | `Dashboard.jsx` after line 537 | 15min | 1.2 (report field) |
| 2.8 | Verify: frontend test 7/7 + build + visual TradeLog check | — | 1.5h | 2.1–2.7 |

**Verification gate**: `npm run test` → 7 passed. `npm run build` → succeeds. TradeLog shows Latest Return, no Mode column.

**Phase 1 Gate**: Both tracks verified. Ship to production (frontend + backend).

---

## Phase 2 (Days 3–5): Master Storage Infrastructure

### Track 3: WS Auth Token Plumbing (P1 — 2h)
**Goal**: User identity threaded through WS/HTTP → backtest handler

| ID | Task | File | Est. | Deps |
|----|------|------|------|------|
| 3.1 | Parse `?token=` from WS query params in `websocket_endpoint` | `main.py` | 30min | None |
| 3.2 | Call `_validate_token(token)` → extract `user.id` on WS connect | `main.py` | 30min | 3.1 |
| 3.3 | Thread `user_id` through `_handle_backtest()` + `_persist_upload()` | `main.py` | 1h | 3.2 |
| 3.4 | Pass auth token in WS connection from frontend | `api.js` | 15min | None |
| 3.5 | Pass auth token in HTTP fallback + mobile fallback | `api.js` | 15min | None |
| 3.6 | Add anonymous guest mode (`user_id="anonymous"`) when no token | `main.py` | 30min | 3.3 |

**Verification gate**: WS connect with invalid token → 4001 close. WS connect with no token → anonymous mode. HTTP fallback passes `Authorization` header.

### Track 4: Master Storage Schema + Backend (P1 — 8h)
**Goal**: 4 new tables + 9 ABC methods across 4 backends

| ID | Task | File | Est. | Deps |
|----|------|------|------|------|
| 4.1 | Write schema: `resolved_symbols`, `symbol_data_freshness` (with idx_sdf_refresh), `file_upload_map`, `signal_results` | `schema.sql` | 2h | None |
| 4.2 | Add 9 abstract methods to `PersistenceBackend` ABC | `persistence.py` | 1h | 4.1 |
| 4.3 | Implement NullBackend stubs for 9 new methods | `persistence.py` | 30min | 4.2 |
| 4.4 | Implement D1WorkerBackend stubs for 9 new methods | `persistence.py` | 1h | 4.2 |
| 4.5 | Implement PostgresBackend methods (multi-row INSERT, timeout=30) | `persistence.py` | 3h | 4.1, 4.2 |
| 4.6 | Wire migration commands to startup lifespan | `main.py` | 30min | 4.1–4.5 |
| 4.7 | Add `user_id` param to `log_ingestion()` — update all 4 backends | `persistence.py` | 30min | None |

**Verification gate**: `pytest backend/tests/ -v` → new persistence tests pass. DB inspection shows 4 new tables with correct schema.

### Track 5: Cache Orchestration (P1 — 10h)
**Goal**: L2/L3 cache read paths, partial fetch, thundering herd, L1 invalidation

| ID | Task | File | Est. | Deps |
|----|------|------|------|------|
| 5.1 | Implement L2 cache check in `_handle_backtest` (DB read path) | `main.py` | 3h | 3.3, 4.5 |
| 5.2 | Implement L2 report reconstruction from `signal_results` | `main.py` | 2h | 4.5 |
| 5.3 | Implement L3 partial cache (check resolved_symbols + symbol_data_freshness) | `main.py` | 2h | 4.5 |
| 5.4 | Implement partial fetch (only new/stale symbols for OHLC) | `backtester.py` | 2h | 5.3 |
| 5.5 | Wire thundering herd prevention (`next_refresh_at` compare-and-swap) | `data_provider.py` | 1h | 4.1 |
| 5.6 | Wire L1 cache invalidation + rewrite after L2 rebuild | `storage.py` (+ `main.py`) | 30min | None |
| 5.7 | Add `FileHashCache.delete()` method to `storage.py` | `storage.py` | 5min | None |

**Verification gate**: All 7 verification scenarios (A–G) pass.

---

## Phase 3 (Days 6–7): Testing, Rollout & Kaizen Retro

### Track 6: Testing & Rollout (P1 — 6h)
**Goal**: Regression-proof all changes, close pre-mortem items

| ID | Task | File | Est. | Deps |
|----|------|------|------|------|
| 6.1 | Write Phase 1 tests: `test_latest_price_batch`, `test_latest_return_compute`, `test_mid_day_scenario` | `backend/tests/` | 1.5h | 1.1–1.9 |
| 6.2 | Write Phase 2 tests: `test_l2_cache_hit`, `test_l3_partial_cache`, `test_thundering_herd` | `backend/tests/` | 2h | 5.1–5.7 |
| 6.3 | Write migration test: dual-write parity (signal_hashes == signal_results) | `backend/tests/` | 1h | 4.5, 4.6 |
| 6.4 | Write frontend test for Latest Return column render + null state | `frontend/src/__tests__/` | 30min | 2.1–2.8 |
| 6.5 | Run full regression: pytest + frontend test + npm run build + verify_regression | — | 1h | 6.1–6.4 |
| 6.6 | Pre-mortem closure: verify all 10 🔴 items → ✅ | — | 30min | 6.5 |
| 6.7 | Update RESUME_WORK.md with completed items | `RESUME_WORK.md` | 15min | 6.6 |
| 6.8 | Kaizen retrospective: document lessons learned, update AGENTS.md | `AGENTS.md` | 30min | 6.7 |

**Verification gate**: Full regression suite passes. Pre-mortem checklist all green.

---

## Dependency Graph

```
Phase 1 (Days 1-2)
┌─────────────────────────────────────────────────────┐
│ Track 1: Backend (4h)          Track 2: Frontend (3h)│
│ 1.1 ─┐                         2.1 ─┐                │
│ 1.2 ─┤                         2.2 ─┤                │
│ 1.3 ─┤ 1.6 ─┐                  2.3 ─┤  2.8           │
│ 1.4 ─┤ 1.7 ─┤ 1.9               2.4 ─┤  ───┐         │
│ 1.5 ─┘ 1.8 ─┘ ───┐              2.5 ─┘     │         │
│                  │              2.6 ─┐     │         │
│                  │              2.7 ─┘     │         │
│                  └──────────┬──────────────┘         │
│                             │                        │
│                      [SHIP Phase 1]                  │
└─────────────────────────────────────────────────────┘

Phase 2 (Days 3-5)
┌─────────────────────────────────────────────────────┐
│ Track 3: Auth (2h)    Track 4: Schema (8h)          │
│ 3.1 ─┐                4.1 ─┐                        │
│ 3.2 ─┤ 3.5             4.2 ─┤ 4.6                   │
│ 3.3 ─┤ 3.6             4.3 ─┤ ───┐                  │
│ 3.4 ─┘                 4.4 ─┤     │                  │
│                         4.5 ─┘     │                  │
│                         4.7 ──┐    │                  │
│                               │    │                  │
│ Track 5: Orchestration (10h)  │    │                  │
│ 5.1 ─┐                        │    │                  │
│ 5.2 ─┤ 5.4 ─┐                 │    │                  │
│ 5.3 ─┤ 5.5 ─┤ 5.6 ─┐         │    │                  │
│ 5.7 ─┘       └──────┘         │    │                  │
│              └────────────────┼────┘                  │
│                               │                       │
│                       [SHIP Phase 2]                 │
└─────────────────────────────────────────────────────┘

Phase 3 (Days 6-7)
┌─────────────────────────────────────────────────────┐
│ Track 6: Testing (6h)                                │
│ 6.1 ─┐                                                │
│ 6.2 ─┤                                                │
│ 6.3 ─┤ 6.5 ─┐                                         │
│ 6.4 ─┘       │                                         │
│              ├── 6.6 ── 6.7 ── 6.8                     │
│ 6.5 ─────────┘                                         │
│                                                        │
│              [SHIP Phase 3 — FINAL]                    │
└─────────────────────────────────────────────────────┘
```

**Critical path**: 1.3 → 1.4 → 1.9 → 2.1 → 2.8 → SHIP (Phase 1) → 3.3 → 5.1 → 5.6 → 6.5 → 6.6 → DONE
**Total**: ~29h over 7 days (vs 34h in V1 — Kaizen reduced overhead by parallelizing)

---

## Timeline

```
Day 1 (6h)
┌──────────────────────────────┐
│ Track 1 (4h backend)         │
│ 1.1-1.5 Core implementation  │
│ 1.6-1.8 Integration          │
│ 1.9 Verify                   │
└──────────────────────────────┘

Day 2 (5h)
┌──────────────────────────────┐
│ Track 2 (3h frontend)        │
│ 2.1-2.3 Latest Return column │
│ 2.4-2.6 Mode removal + header│
│ 2.7 Disclaimer               │
│ 2.8 Verify + build           │
│                              │
│ ✓ SHIP PHASE 1               │
└──────────────────────────────┘

Day 3 (5h)
┌──────────────────────────────┐
│ Track 3 (2h auth)            │
│ 3.1-3.6 WS token + user_id   │
│                              │
│ Track 4 (3h schema)          │
│ 4.1-4.3 Tables + ABC + Null  │
└──────────────────────────────┘

Day 4 (6h)
┌──────────────────────────────┐
│ Track 4 cont'd (5h)          │
│ 4.4-4.7 D1 + PG + migration  │
│                              │
│ Track 5 (1h start)           │
│ 5.7 FileHashCache.delete()   │
└──────────────────────────────┘

Day 5 (6h)
┌──────────────────────────────┐
│ Track 5 (6h orchestration)   │
│ 5.1 L2 cache check           │
│ 5.2 L2 reconstruction        │
│ 5.3 L3 partial cache         │
└──────────────────────────────┘

Day 6 (5h)
┌──────────────────────────────┐
│ Track 5 cont'd (4h)          │
│ 5.4 Partial fetch            │
│ 5.5 Thundering herd          │
│ 5.6 L1 invalidation          │
│                              │
│ ✓ SHIP PHASE 2               │
└──────────────────────────────┘

Day 7 (6h)
┌──────────────────────────────┐
│ Track 6 (6h testing)         │
│ 6.1-6.4 Write tests          │
│ 6.5 Full regression          │
│ 6.6 Pre-mortem closure       │
│ 6.7 Update resume            │
│ 6.8 Kaizen retro             │
│                              │
│ ✓ SHIP PHASE 3 — COMPLETE    │
└──────────────────────────────┘

TOTAL: ~29h across 7 days
```
