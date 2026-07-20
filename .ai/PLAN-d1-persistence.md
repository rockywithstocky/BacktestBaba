# Implementation Plan: D1 Persistence Microservice

**Worker URL**: `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`

**Branch**: `feat/d1-persistence` — never commit directly to `main`.

---

## Architecture — 3 Layers, 4 Pillars

```
FRONTEND (Vercel, serverless)
├── IndexedDB (L2 cache — persists across tabs)
├── sessionStorage (L1 cache — current session)
├── Client-Mediated Sync (exponential backoff 1s→2s→4s→...→16s)
├── Auth UI (LoginPage)
└── Admin Dashboard (hidden route /dashboard/admin)

BACKEND (Render, stateless container)
├── Phase A ✅  persistence.py (ABC + NullBackend + D1WorkerBackend)
├── Phase B     config.py + main.py hooks
├── Pillar 3    ingestion_log immediate write (BEFORE processing)
├── Pillar 2    Auth endpoints + session validation + admin proxies
├── Pillar 4    Dual-stage: D1 row_hash lookup BEFORE yfinance
└── Pillar 2    Multi-tenant WHERE user_id = ? on all queries

WORKER (Cloudflare, D1 gateway)
├── 15 endpoints across 6 domains:
│   ├── /api/health
│   ├── /api/auth/*        (signup, login, validate)
│   ├── /api/ingestion     (log + update status)
│   ├── /api/uploads       (create, list)
│   ├── /api/signals       (batch insert, bulk lookup)
│   ├── /api/signals/lookup (Pillar 4 — dual-stage pre-filter)
│   ├── /api/quota
│   └── /api/admin/*       (list users, upgrade plan, revoke sessions)
└── D1: 6 tables (users, sessions, ingestion_log, uploads, signal_hashes, quota)
```

---

## Prerequisites — You Must Do

```bash
git checkout -b feat/d1-persistence    # already done
mkdir worker && cd worker && npm init -y   # if not done
npx wrangler d1 migrations apply backtestbaba --remote
npx wrangler deploy
```

---

## Phase A ✅ Complete (Backend Abstraction Layer)

| File | Status |
|---|---|
| `backend/persistence.py` | Committed — ABC, NullBackend, D1WorkerBackend, dataclasses, helpers |
| `backend/tests/test_persistence.py` | Committed — 29 tests, all passing |

**Gate A**: `pytest backend/tests/test_persistence.py -v --asyncio-mode=auto` → 29/29 pass.

---

## Phase B (Backend Integration — Config + Hooks + Auth)

**Goal**: Wire persistence, ingestion, auth, and dual-stage lookup into the existing backend. All gated by `PERSISTENCE_ENABLED=False` by default.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| B-01 | `backend/config.py` | Add `PERSISTENCE_ENABLED`, `WORKER_URL`, `PERSISTENCE_TIMEOUT` (module-level vars, not a class) | +6 | Import works |
| B-02 | `backend/main.py` | Import persistence classes + config vars. Init `persistence_backend` with validated config (logs warnings if WORKER_URL is missing/malformed). Lifespan shutdown handler. | +15 | App starts with `NullBackend` by default, logs which backend is active |
| B-03 | `backend/main.py` | **Pillar 3**: Add `ingestion_log` write AFTER cache check (cache hits skip ingestion log entirely). Log written before CSV parsing. | +15 | Cache hits skip log. Cache misses write log. |
| B-04 | `backend/main.py` | **Pillar 2**: Add auth endpoints — `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | +60 | curl signup → returns user + token |
| B-05 | `backend/main.py` | **Pillar 2**: Add auth middleware — validate session token on protected endpoints | +20 | Invalid token returns 401 |
| B-06 | `backend/main.py` | **Pillars 1+4**: Add `_persist_upload()` — synchronous call after `FileHashCache.set()`. Creates UploadRecord + TradeRecords, saves via persistence_backend, updates ingestion status. Own try/except — never crashes backtest. | +35 | Persistence completes before WS complete message is sent |
| B-08 | `backend/main.py` | **Pillar 2**: Add admin proxy endpoints — `GET /api/admin/users`, `POST /api/admin/users/plan`, `POST /api/admin/sessions/revoke` | +20 | Requires admin session token |
| B-09 | `backend/tests/test_auth.py` | Test signup, login, session validation, invalid credentials | +60 | `pytest -v --asyncio-mode=auto` → pass |
| B-10 | `backend/tests/test_ingestion.py` | Test ingestion log write, filename isolation | +30 | `pytest -v --asyncio-mode=auto` → pass |

**Gate B**: `pytest backend/tests/ -v --asyncio-mode=auto` → all tests pass (both old and new). Auth endpoints return correct responses with mocked Worker.

---

## Phase C (Worker — Cloudflare Edge Code)

**Goal**: Deploy the Worker with all 15 endpoints across 6 domains. You deploy — I write.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| C-01 | `worker/migrations/001_init.sql` | **Pillar 1-4**: DDL for all 6 tables | +75 | `npx wrangler d1 migrations apply` succeeds |
| C-02 | `worker/wrangler.toml` | D1 binding + PASSWORD_SALT vars | +12 | `npx wrangler deploy` succeeds |
| C-03 | `worker/package.json` | Minimal — `"private": true` | +7 | `npm install` succeeds |
| C-04 | `worker/src/index.js` | **Pillar 1**: `GET /api/health`, `GET /api/quota` | +20 | curl returns correct JSON |
| C-05 | `worker/src/index.js` | **Pillar 2**: `POST /api/auth/signup` — hash password, create user + session | +25 | curl signup → 201 with user + token |
| C-06 | `worker/src/index.js` | **Pillar 2**: `POST /api/auth/login` — validate credentials, return token | +20 | curl login → valid token |
| C-07 | `worker/src/index.js` | **Pillar 2**: `GET /api/auth/validate?token=xxx` — check not expired + not revoked | +15 | Expired/revoked token → 401 |
| C-08 | `worker/src/index.js` | **Pillar 3**: `POST /api/ingestion` + `PATCH /api/ingestion` | +15 | Log written, status updated |
| C-09 | `worker/src/index.js` | **Pillar 1**: `POST /api/uploads` — create upload with user_id | +15 | 201 with id |
| C-10 | `worker/src/index.js` | **Pillar 1+4**: `POST /api/signals` — batch INSERT OR IGNORE, quota 429 check | +35 | Duplicate → `skipped > 0` |
| C-11 | `worker/src/index.js` | **Pillar 4**: `POST /api/signals/lookup` — bulk hash lookup, multi-tenant | +15 | Returns only missing hashes |
| C-12 | `worker/src/index.js` | **Pillar 1**: `GET /api/uploads?user_id=` — paginated, scoped | +15 | User sees own uploads only |
| C-13 | `worker/src/index.js` | **Pillar 2**: Admin endpoints — list users, upgrade plan, revoke sessions | +25 | Admin-only, 401 for non-admin |

**Gate C**: All 15 Worker endpoints return correct responses. Duplicate row_hash → `skipped > 0`. Invalid token → 401. Quota at 95% → 429.

---

## Phase D (Frontend — IndexedDB + Client-Mediated Sync + Auth UI)

**Goal**: Frontend persistence, auth, and admin UI.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| D-01 | `frontend/src/services/db.js` | **Pillar 4**: IndexedDB wrapper — saveReport, getReport, listReports, deleteReport | +80 | Stores and retrieves across page refresh |
| D-02 | `frontend/src/services/sync.js` | **Pillar 4**: Client-mediated sync — save to IndexedDB, POST to backend with 1s→2s→4s→8s→16s backoff | +60 | Retries, stops at 16s |
| D-03 | `frontend/src/services/auth.js` | **Pillar 2**: Login, signup, logout, getSession, isAuthenticated, isAdmin | +50 | Session persists across refresh |
| D-04 | `frontend/src/pages/LoginPage.jsx` | **Pillar 2**: Login/signup form with toggle | +80 | Signs up, logs in, redirects |
| D-05 | `frontend/src/pages/AdminPage.jsx` | **Pillar 2**: Admin dashboard — user list, upgrade/downgrade, revoke sessions, quota | +120 | Admin-only, shows user table |
| D-06 | `frontend/src/services/api.js` | **Pillar 4**: Inject auth token. After WS complete, trigger sync.js. | +15 | Authenticated requests work |
| D-07 | `frontend/src/components/Dashboard.jsx` | **Pillar 4**: Load from IndexedDB on mount if no active WS session | +10 | Dashboard loads from IndexedDB |
| D-08 | `frontend/src/App.jsx` | **Pillar 2**: Add /login, /signup, /dashboard/admin routes | +15 | Routing works, protected routes enforced |

**Gate D**: User can sign up, log in, run backtest, close browser, reopen → report in Dashboard. Admin sees users, upgrades plans, revokes sessions.

---

## Phase E (Dual-Stage Lookup — Backtester Integration)

**Goal**: Before yfinance calls, check D1 for existing row_hashes and skip known rows.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| E-01 | `backend/core/backtester.py` | **Pillar 4**: After CSV parsing, compute row_hashes. Call `POST /signals/lookup`. Split into `known` + `new`. | +15 | Existing tests pass (mocked D1) |
| E-02 | `backend/core/backtester.py` | **Pillar 4**: Skip yfinance for `known` signals. Fetch yfinance only for `new`. | +20 | Reduced yfinance calls |
| E-03 | `backend/tests/test_dual_stage.py` | Test: known rows skip yfinance, new rows fetch. Mock D1 lookup. | +40 | All tests pass |

**Gate E**: Backtest with 100 signals where 80 are already in D1 → only 20 yfinance calls.

---

## File Inventory

| File | Phase | Status |
|---|---|---|
| `backend/persistence.py` | A | ✅ Committed |
| `backend/tests/test_persistence.py` | A | ✅ Committed |
| `backend/config.py` | B | 📝 Edit (+6 lines) |
| `backend/main.py` | B | 📝 Edit (+192 lines) |
| `backend/tests/test_auth.py` | B | ✨ New |
| `backend/tests/test_ingestion.py` | B | ✨ New |
| `worker/migrations/001_init.sql` | C | ✨ New (on disk) |
| `worker/src/index.js` | C | ✨ New (on disk) |
| `worker/wrangler.toml` | C | ✨ New (on disk) |
| `worker/package.json` | C | ✨ New (on disk) |
| `frontend/src/services/db.js` | D | ✨ New |
| `frontend/src/services/sync.js` | D | ✨ New |
| `frontend/src/services/auth.js` | D | ✨ New |
| `frontend/src/pages/LoginPage.jsx` | D | ✨ New |
| `frontend/src/pages/AdminPage.jsx` | D | ✨ New |
| `frontend/src/services/api.js` | D | 📝 Edit |
| `frontend/src/components/Dashboard.jsx` | D | 📝 Edit |
| `frontend/src/App.jsx` | D | 📝 Edit |
| `backend/core/backtester.py` | E | 📝 Edit (+35 lines) |
| `backend/tests/test_dual_stage.py` | E | ✨ New |

---

## Rollback Plan

| Scenario | Action |
|---|---|
| Phase B breaks existing tests | `git revert B-commit` — revert config.py + main.py changes |
| Phase C Worker SQL error | Fix migration, `npx wrangler deploy` again — zero downtime |
| Phase D IndexedDB corrupt | Clear in devtools, reload — sessionStorage fallback |
| Phase E breaks backtest | `git revert E-commit` — backtester.py returns to original |
| All of it | `git checkout main; git branch -D feat/d1-persistence; npx wrangler rollback` |
