# PR #7 Remaining Fixes — Design Spec

**Date:** 2026-07-28
**Branch:** feat/d1-persistence
**Goal:** Fix 3 remaining PR #7 items with zero regression.

---

## 1. PR7.1 — Add `entry_price` to `compute_row_hash()`

### Problem
`compute_row_hash()` at `backend/persistence.py:16` generates a dedup hash from `symbol`, `signal_date`, `entry_mode`, `duration` — but excludes `entry_price`. Two uploads of the same symbol+date+mode with different entry prices (same-day re-upload where `next_close` price changed) produce identical hashes. The DB `ON CONFLICT DO NOTHING` silently skips the second upload, serving stale results.

### Design
Add `entry_price` (as string) to the hash formula:
```python
raw = f"{symbol}|{signal_date}|{entry_mode}|{duration}|{entry_price}"
```

### Changes
1. `backend/persistence.py:17` — add `entry_price` parameter to `compute_row_hash()` signature and formula
2. `backend/main.py:269` — pass `t.entry_price` as 4th positional arg to `compute_row_hash()`
3. `backend/main.py:292` — pass `entry_price` to `compute_row_hash()`
4. `backend/tests/test_persistence.py:20-45` — update test vectors: add `entry_price` param to all calls, add new test `test_different_entry_prices_differ`

### Regression Safety
- Additive change: old hashes remain valid in DB (just won't match new uploads)
- Old entries with incomplete hashes coexist with new entries — no crash path
- The inline hash in `backtester.py:324` is independent (per-row OHLCV cache, not dedup)

---

## 2. PR7.3 — Add Auth Tests

### Problem
Three auth endpoints (`POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`) plus `_validate_token()` have zero HTTP tests. Bugs here are security issues (blocked logins, stale token acceptance).

### Design
Create `backend/tests/test_auth.py` using FastAPI `TestClient`. Test both `PERSISTENCE_ENABLED=True` (via NullBackend stub) and `PERSISTENCE_ENABLED=False` modes.

### Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `PERSISTENCE_ENABLED=False` → POST signup | 501 Auth not configured |
| 2 | `PERSISTENCE_ENABLED=False` → POST login | 501 Auth not configured |
| 3 | `PERSISTENCE_ENABLED=False` → GET /me | 501 Auth not configured |
| 4 | POST signup with valid body → mock returns user | 201 + user data |
| 5 | POST signup → backend returns None | 502 Auth service unavailable |
| 6 | POST login with valid credentials | 200 + session token |
| 7 | POST login with wrong password | 401 Invalid credentials |
| 8 | GET /me with valid Bearer token | 200 + user object |
| 9 | GET /me with missing header | 401 Missing or invalid auth header |
| 10 | GET /me with expired/invalid token | 401 Invalid or expired session |
| 11 | GET /me with malformed header | 401 Missing or invalid auth header |
| 12 | `_validate_token()` with cached token | returns cached user (60s TTL) |

### Changes
1. New file: `backend/tests/test_auth.py` (~150 lines)
2. No production code changes

### Regression Safety
- Zero production code modifications
- TestClient is isolated, no shared state

---

## 3. PR7.4 — L1 Freshness Uses Timestamp Not Date

### Problem
`backend/main.py:345` compares `cached_latest_date < datetime.now().strftime("%Y-%m-%d")` — a calendar date comparison. A user who uploads at 2 PM and re-uploads at 4 PM the same day gets stale data because both are "2026-07-28".

### Design
Add a `latest_price_ts` field (float Unix timestamp) to the L1 cache report dict. Change the freshness comparison to use this timestamp with a 5-minute threshold. Do **not** change `latest_price_date` (frontend reads it as string).

### Freshness Check Logic
```python
cached_ts = cached.get("latest_price_ts")
if cached_ts is None or time.time() - cached_ts > 300:  # 5 minutes
    # refresh latest prices
    latest_dates = []
    for t in cached.get("trades", []):
        ...
    cached["latest_price_ts"] = time.time()   # NEW
    cached["latest_price_date"] = max(latest_dates)
    FileHashCache.set(...)
```

### All Cache Writes That Need `latest_price_ts`

| Location | What to add |
|----------|-------------|
| `main.py:370` (L1 refresh) | `cached["latest_price_ts"] = time.time()` |
| `main.py:474` (L2 reconstruct) | Add `latest_price_ts` to model or inject after `.model_dump()` |
| `main.py:537` (L3 complete) | Inject `latest_price_ts` into report_dict before `.set()` |

### Changes
1. `backend/main.py:345` — change freshness comparison
2. `backend/main.py:370` — set `cached["latest_price_ts"] = time.time()`
3. `backend/main.py:474` — after `model_dump()`, inject `latest_price_ts`
4. `backend/main.py:537` — inject `latest_price_ts` into report_dict

### Regression Safety
- Missing `latest_price_ts` on existing caches → treated as stale → triggers one-time refresh → populated for future checks
- `latest_price_date` unchanged — frontend unaffected
- `latest_price_ts` is cache-only (not in Pydantic model, not in DB)
- `BacktestReport` model unchanged (we inject before `.set()`, not into model)

---

## 4. Implementation Order

1. **PR7.3 first** (zero risk, adds safety net for subsequent changes)
2. **PR7.1 second** (low risk, localized change)
3. **PR7.4 third** (low-medium risk, needs backward-compat handling)
4. **Full test suite** — confirm 85/85 backend, 21/21 frontend, build OK

## 5. Verification

Each item is verified by:
- Its own tests pass
- All existing tests still pass (`pytest backend/tests/ -v --asyncio-mode=auto`)
- Frontend build succeeds (`npm run build`)
