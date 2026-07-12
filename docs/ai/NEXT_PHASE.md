# Immediate Roadmap

## Active Phase: D1 Persistence Microservice

**Branch**: `feat/d1-persistence`

### Phase A (✅ Complete)
- `backend/persistence.py` — PersistenceBackend ABC, NullBackend, D1WorkerBackend, dataclasses, helpers
- `backend/tests/test_persistence.py` — 29 unit tests (mocked HTTP)
- `.ai/` — Architecture doc, SPEC, plan, visual build doc

### Phase B (⬅️ Next)
- `backend/config.py` — Add PERSISTENCE_ENABLED, WORKER_URL, PERSISTENCE_TIMEOUT
- `backend/main.py` — Import persistence, init backend, fire-and-forget hook after FileHashCache.set()

### Phase C
- `worker/src/index.js` — 5 endpoints (POST /api/uploads, POST /api/signals, GET /api/uploads, GET /api/quota, GET /api/health)
- `worker/migrations/001_init.sql` — 3 tables DDL
- `worker/wrangler.toml` — D1 binding

### Phase D
- `backend/tests/test_integration_d1.py` — E2E test with deployed Worker

---

## Deferred (After D1 Is Stable)

- **Dashboard Restructuring**: Break up Dashboard.jsx monolith into SummaryCards, PerformanceCharts, TradeLogTable.
- **AI Fundamentals Module**: New `/api/fundamental/{symbol}` endpoint using LLM.
- **User Auth / Sessions**: Login, JWT, protected routes.
- **Admin Panel**: Quota dashboard, export, clear D1.
