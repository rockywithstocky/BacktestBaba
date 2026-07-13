# What We Build — D1 Persistence (Full Scope)

---

## 1. Shopping List (20 Files)

| # | File | Action | Phase |
|---|------|--------|-------|
| 1 | `backend/persistence.py` | ✅ **New** — committed | A |
| 2 | `backend/tests/test_persistence.py` | ✅ **New** — committed | A |
| 3 | `backend/config.py` | 📝 **Edit** — +4 env vars | B |
| 4 | `backend/main.py` | 📝 **Edit** — +160 lines (import, init, ingestion, auth, admin, persist) | B |
| 5 | `backend/tests/test_auth.py` | ✨ **New** — auth unit tests | B |
| 6 | `backend/tests/test_ingestion.py` | ✨ **New** — ingestion log tests | B |
| 7 | `worker/migrations/001_init.sql` | ✨ **New** — DDL: 6 tables | C |
| 8 | `worker/src/index.js` | ✨ **New** — Worker: 15 endpoints | C |
| 9 | `worker/wrangler.toml` | ✨ **New** — D1 binding + PASSWORD_SALT | C |
| 10 | `worker/package.json` | ✨ **New** — minimal package | C |
| 11 | `frontend/src/services/db.js` | ✨ **New** — IndexedDB wrapper | D |
| 12 | `frontend/src/services/sync.js` | ✨ **New** — exponential backoff retry | D |
| 13 | `frontend/src/services/auth.js` | ✨ **New** — login, signup, session | D |
| 14 | `frontend/src/pages/LoginPage.jsx` | ✨ **New** — auth UI | D |
| 15 | `frontend/src/pages/AdminPage.jsx` | ✨ **New** — admin dashboard | D |
| 16 | `frontend/src/services/api.js` | 📝 **Edit** — auth token, sync trigger | D |
| 17 | `frontend/src/components/Dashboard.jsx` | 📝 **Edit** — load from IndexedDB | D |
| 18 | `frontend/src/App.jsx` | 📝 **Edit** — auth routes + protected routes | D |
| 19 | `backend/core/backtester.py` | 📝 **Edit** — dual-stage lookup (+35 lines) | E |
| 20 | `backend/tests/test_dual_stage.py` | ✨ **New** — dual-stage tests | E |

---

## 2. Files That Do NOT Change

| File | Reason |
|------|--------|
| `backend/core/data_provider.py` | Data fetching unchanged |
| `backend/core/symbol_resolver.py` | Symbol resolution unchanged |
| `backend/models/schemas.py` | Same report model |
| `backend/storage.py` | FileHashCache/JobStorage unchanged |
| `backend/requirements.txt` | httpx already present |

---

## 3. D1 Schema — 6 Tables vs Original 3

| Original (3 tables) | Final (6 tables) | What changed |
|---|---|---|
| `uploads` | `uploads` + `user_id FK` | Added user_id for multi-tenant |
| `signal_hashes` | `signal_hashes` + `user_id FK` | Added user_id for multi-tenant |
| `quota` | `quota` | Unchanged |
| — | `users` | **New** — identity, plan, admin flag |
| — | `sessions` | **New** — token auth, revocable |
| — | `ingestion_log` | **New** — immediate audit trail |

---

## 4. Worker Endpoints — 5 vs 15

| Domain | Endpoints | Pillar |
|---|---|---|
| Health | `GET /api/health` | 1 |
| Auth | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/validate` | 2 |
| Ingestion | `POST /api/ingestion`, `PATCH /api/ingestion` | 3 |
| Uploads | `POST /api/uploads`, `GET /api/uploads` | 1 |
| Signals | `POST /api/signals`, `POST /api/signals/lookup` | 1, 4 |
| Quota | `GET /api/quota` | 1 |
| Admin | `GET /api/admin/users`, `POST /api/admin/users/plan`, `POST /api/admin/sessions/revoke` | 2 |

---

## 5. Config Env Vars — Before vs After

| Before | After |
|---|---|
| (not present) | `PERSISTENCE_ENABLED=false` |
| (not present) | `WORKER_URL=https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev` |
| (not present) | `PERSISTENCE_TIMEOUT=3` |

---

## 6. Data Flow — Before vs After

| Step | Before | After |
|---|---|---|
| File arrives | SHA-256 → FileHashCache | SHA-256 → **write ingestion_log** → FileHashCache |
| CSV parsed | row_hashes not computed | row_hashes computed, **D1 bulk lookup** for existing |
| yfinance called | ALL symbols | **Only net-new symbols** after D1 dedup |
| Report delivered | WS → sessionStorage | WS → **IndexedDB** + sessionStorage |
| Persistence | None | **Synchronous persist to D1** via Worker (before WS `complete` message) |
| Auth | None | **Token-based** signup/login/session |
| Admin | None | **Dashboard route** for user mgmt |

---

## 7. Fallback Scenarios

| What breaks | Backend behavior | User sees |
|---|---|---|
| Worker unreachable | 3s timeout → log warning | Normal report, "save unavailable" badge |
| Quota at 95% | Worker 429 → log | Normal report, "storage full" badge |
| D1 lookup timeout | Log warning, fetch ALL from yfinance | Normal report (slightly slower) |
| Auth token expired | Worker 401 → backend 401 | Login page |
| IndexedDB full | Catch error, fall back to sessionStorage | Normal report, "offline cache full" badge |
| Everything works | <200ms Worker response | Report + "saved" badge |
