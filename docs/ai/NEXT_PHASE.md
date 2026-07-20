# Immediate Roadmap

## Active Phase: D1 Persistence Microservice

**Branch**: `feat/d1-persistence`. All work on feature branch; never commit directly to `main`.

### Phase A: Abstraction Layer ✅ Done
- `backend/persistence.py` — 177 lines: ABC, NullBackend, D1WorkerBackend, dataclasses, `compute_row_hash()`, `_build_results_json()`
- `backend/tests/test_persistence.py` — 29 unit tests (all pass)
- Zero existing code changed, no import cycles

### Phase B: Integration in main.py ⏳ Next
| Task | File | Change |
|------|------|--------|
| B-01 | `backend/config.py` | Add `PERSISTENCE_ENABLED`, `WORKER_URL`, `PERSISTENCE_TIMEOUT` |
| B-02 | `backend/main.py` | Import persistence classes, init backend based on config |
| B-03 | `backend/main.py` | Add `_persist_upload()` helper + fire-and-forget `asyncio.create_task` hook after WS send |

**Gate**: `pytest backend/tests/ -v --asyncio-mode=auto` passes. Manual: backtest via WS returns normally, no D1 calls when `PERSISTENCE_ENABLED=false` (default).

**Rollback**: Set `PERSISTENCE_ENABLED=False` — backtest continues without D1. Zero impact.

### Phase C: Cloudflare Worker Code ❌ Not Started
| Task | File | Description |
|------|------|-------------|
| C-01 | `worker/src/index.js` | Request router + CORS + error handler |
| C-02 | `worker/src/index.js` | `POST /api/uploads` handler |
| C-03 | `worker/src/index.js` | `POST /api/signals` with dedup + quota check |
| C-04 | `worker/src/index.js` | `GET /api/uploads`, `GET /api/quota`, `GET /api/health` |
| C-05 | `worker/migrations/001_init.sql` | DDL for 3 tables (uploads, signal_hashes, quota) |
| C-06 | `worker/wrangler.toml` | D1 binding config |
| C-07 | `worker/package.json` | Minimal package.json |

**Prerequisites** (must be done by owner before verification):
```bash
mkdir worker && cd worker && npm init -y
npx wrangler d1 migrations apply backtestbaba --remote
npx wrangler deploy
```

### Phase D: End-to-End Integration ❌ Not Started
- `backend/tests/test_integration_d1.py` — automated integration test with deployed Worker
- Manual: upload CSV via frontend with `PERSISTENCE_ENABLED=True` → verify D1 shows rows

---

## Future Work (Post-D1)
- Dashboard restructuring (decompose 500-line `Dashboard.jsx` monolith)
- AI Fundamentals module (`GET /api/fundamental/{symbol}` via Gemini)
- Intraday resolution support
