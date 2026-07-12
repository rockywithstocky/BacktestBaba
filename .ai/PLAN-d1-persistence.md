# Implementation Plan: D1 Persistence Microservice

**Worker URL**: `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`

**Branch**: All work on feature branch `feat/d1-persistence`. Never commit directly to `main`.

---

## Prerequisites — You Must Do (Before Phase C)

These steps are yours. I cannot do them from here.

```bash
# 1. Create feature branch in repo
git checkout -b feat/d1-persistence

# 2. Create worker directory (once)
mkdir worker && cd worker && npm init -y

# 3. After I write the Worker code, apply schema and deploy:
npx wrangler d1 migrations apply backtestbaba --remote
npx wrangler deploy

# 4. Verify Worker responds:
curl https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev/api/health
# Expected: {"status":"ok","database":"backtestbaba","version":"1.0.0"}
```

---

## Execution Order

Each phase is independently verifiable. No phase depends on a later phase. Phases can be paused and resumed without code rot.

---

## Phase A: Abstraction Layer (Backend Only)

**Goal**: Define the contract. Zero external dependencies. Zero existing code changed.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|---|
| A-01 | `backend/persistence.py` | Write `PersistenceBackend` ABC | ~30 | `python -c "from backend.persistence import PersistenceBackend; print('OK')"` |
| A-02 | `backend/persistence.py` | Write `UploadRecord` and `TradeRecord` dataclasses, `compute_row_hash()` | ~25 | Import works, hash deterministic |
| A-03 | `backend/persistence.py` | Write `NullBackend` | ~15 | `b=NullBackend(); assert b.healthcheck() == False` |
| A-04 | `backend/persistence.py` | Write `D1WorkerBackend` — full implementation | ~80 | Unit tests with mocked httpx |
| A-05 | `backend/tests/test_persistence.py` | 6 unit tests | ~80 | `pytest -v --asyncio-mode=auto` → 6/6 pass |

> ⚠️ **Status of A-01 through A-05**: Code written (pending approval). Tests: 28/29 pass (1 test has a known bug: `test_all_none_returns_empty_object` needs max_high_date/max_low_date to be None'd explicitly). Ready for commit after branch creation.

**Gate A**: `pytest backend/tests/test_persistence.py -v --asyncio-mode=auto` → 29/29 pass.  
Regression: `pytest backend/tests/ -v --asyncio-mode=auto` → all existing tests pass unchanged.

---

## Phase B: Integration in `main.py` (Gated by Config)

**Goal**: Wire persistence into the backtest flow with a disabled-by-default config flag.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| B-01 | `backend/config.py` | Add `PERSISTENCE_ENABLED`, `WORKER_URL`, `PERSISTENCE_TIMEOUT` | ~8 | Import works |
| B-02 | `backend/main.py` | Import persistence classes, init backend based on config | ~10 | App starts without error |
| B-03 | `backend/main.py` | Add `_persist_upload()` helper + fire-and-forget hook | ~20 | Backtest flow unchanged when disabled |
| B-04 | `backend/requirements.txt` | `httpx` already in deps (`httpx==0.28.1`, line 17). No change needed. | 0 | Already present |

**Gate B**: `pytest backend/tests/ -v --asyncio-mode=auto` → all pass.  
Manual: start server, run backtest via WS — report returns normally, no D1 calls.

---

## Phase C: Cloudflare Worker Code

**Goal**: Write the Worker code that implements the API contract. Infra already deployed by you.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| C-01 | `worker/src/index.js` | Request router + CORS + error handler | ~30 | `npx wrangler deploy` succeeds |
| C-02 | `worker/src/index.js` | `POST /api/uploads` handler | ~40 | `curl -X POST .../api/uploads` → 201 |
| C-03 | `worker/src/index.js` | `POST /api/signals` handler with dedup + quota | ~60 | `curl -X POST .../api/signals` → {inserted, skipped} |
| C-04 | `worker/src/index.js` | `GET /api/uploads`, `GET /api/quota`, `GET /api/health` | ~30 | curl → correct JSON |
| C-05 | `worker/migrations/001_init.sql` | DDL for all 3 tables | ~40 | `wrangler d1 migrations apply` succeeds |
| C-06 | `worker/wrangler.toml` | D1 binding | ~10 | Deploy succeeds |
| C-07 | `worker/package.json` | Minimal package.json | ~5 | `npm install` succeeds |

**Gate C**: All Worker endpoints respond correctly. Duplicate row_hash returns `skipped > 0`.

---

## Phase D: End-to-End Integration Test

**Goal**: Prove full pipeline works — backtest → Worker → D1.

| Task | File | Action | Verification |
|---|---|---|---|
| D-01 | `backend/tests/test_integration_d1.py` | Integration test with deployed Worker | `pytest -v --asyncio-mode=auto` → passes |
| D-02 | Manual | Upload CSV via frontend with PERSISTENCE_ENABLED=True | D1 shows upload + signal rows |

**Gate D**: Full pipeline verified end-to-end.

---

## File Inventory

| File | Phase | Status |
|---|---|---|
| `backend/persistence.py` | A | NEW |
| `backend/tests/test_persistence.py` | A | NEW |
| `backend/config.py` | B | MODIFIED (+8 lines) |
| `backend/main.py` | B | MODIFIED (+30 lines) |
| `backend/requirements.txt` | B | NOT MODIFIED (httpx already present) |
| `worker/src/index.js` | C | NEW |
| `worker/migrations/001_init.sql` | C | NEW |
| `worker/wrangler.toml` | C | NEW |
| `worker/package.json` | C | NEW |
| `backend/tests/test_integration_d1.py` | D | NEW |

---

## Rollback Plan

| Scenario | Action | Impact |
|---|---|---|
| B-03 causes WS timeout | Remove hook lines, set `PERSISTENCE_ENABLED=False` | Zero — 30 sec rollback |
| C-03 SQL error | Fix Worker, `npx wrangler deploy` again | Zero downtime |
| D1 exhausted | Set `PERSISTENCE_ENABLED=False`, archive manually | Zero — backtest continues without D1 |
