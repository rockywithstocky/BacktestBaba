# Implementation Plan: D1 Persistence Microservice

**Worker URL**: `https://backtestbaba-d1-proxy.rockywithstocky-ff8.workers.dev`

**Branch**: `feat/d1-persistence` — never commit directly to `main`.

---

## Architecture — 3 Layers, 4 Pillars

```
FRONTEND (Vercel, serverless)
├── IndexedDB (L2 cache — persists across tabs)
├── Client-Mediated Sync (exponential backoff 1s→2s→4s→...→16s)
└── Auth UI + Admin Dashboard (hidden route /dashboard/admin)

BACKEND (Render, stateless container)
├── Phase A ✅  persistence.py (ABC + NullBackend + D1WorkerBackend)
├── Phase B     config.py + main.py hooks
├── ingestion_log immediate write (Pillar 3)
├── Auth endpoints + session validation (Pillar 2)
├── Dual-stage lookup: D1 check BEFORE yfinance (Pillar 4)
└── Multi-tenant WHERE user_id = ? on all queries (Pillar 2)

WORKER (Cloudflare, D1 gateway)
├── 15 endpoints across 6 domains:
│   ├── /api/health
│   ├── /api/auth/*        (signup, login, validate)
│   ├── /api/ingestion     (log + update status)
│   ├── /api/uploads       (create, list)
│   ├── /api/signals       (batch insert, bulk lookup)
│   ├── /api/signals/lookup (Pillar 4 — dual-stage)
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
| `backend/persistence.py` | Committed — ABC, NullBackend, D1WorkerBackend, dataclasses |
| `backend/tests/test_persistence.py` | Committed — 29 tests, all passing |

**Gate A**: `pytest backend/tests/test_persistence.py -v --asyncio-mode=auto` → 29/29 pass.

---

## Phase B (Backend Integration — Config + Hooks + Auth)

**Goal**: Wire persistence, ingestion, auth, and dual-stage lookup into the existing backend. All gated by `PERSISTENCE_ENABLED=False` by default.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| B-01 | `backend/config.py` | Add `PERSISTENCE_ENABLED`, `WORKER_URL`, `PERSISTENCE_TIMEOUT`, `PASSWORD_SALT` | +8 | Import works |
| B-02 | `backend/main.py` | Import `D1WorkerBackend`, `NullBackend`. Init `persistence` at startup. | +10 | App starts with `NullBackend` by default |
| B-03 | `backend/main.py` | **Pillar 3**: Add `ingestion_log` write at entry of `_handle_backtest()`, BEFORE FileHashCache check | +15 | Log written on every upload attempt |
| B-04 | `backend/main.py` | **Pillar 2**: Add auth endpoints — `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | +60 | curl signup → returns user + token |
| B-05 | `backend/main.py` | **Pillar 2**: Add auth middleware — validate session token on protected endpoints | +20 | Invalid token returns 401 |
| B-06 | `backend/main.py` | **Pillar 4**: Add dual-stage lookup route — `POST /api/signals/lookup` proxy to Worker | +10 | Returns set of existing row_hashes |
| B-07 | `backend/main.py` | **Pillar 4**: Add `_persist_upload()` fire-and-forget hook after `FileHashCache.set()` | +25 | Runs in background after WS response sent |
| B-08 | `backend/main.py` | **Pillar 2**: Add admin proxy endpoints — `GET /api/admin/users`, `POST /api/admin/users/plan`, `POST /api/admin/sessions/revoke` | +20 | Requires admin session token |
| B-09 | `backend/tests/test_auth.py` | Test signup, login, session validation, invalid credentials | +60 | `pytest -v --asyncio-mode=auto` → pass |
| B-10 | `backend/tests/test_ingestion.py` | Test ingestion log write, filename isolation | +30 | `pytest -v --asyncio-mode=auto` → pass |

**Gate B**: `pytest backend/tests/ -v --asyncio-mode=auto` → all tests pass (both old and new). Auth endpoints return correct responses with mocked Worker.

---

## Phase C (Worker — Cloudflare Edge Code)

**Goal**: Deploy the Worker with all 15 endpoints across 6 domains. You deploy — I write.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| C-01 | `worker/migrations/001_init.sql` | **Pillar 1-4**: DDL for all 6 tables (users, sessions, ingestion_log, uploads, signal_hashes, quota) | +75 | `npx wrangler d1 migrations apply` succeeds |
| C-02 | `worker/wrangler.toml` | D1 binding + PASSWORD_SALT vars | +12 | `npx wrangler deploy` succeeds |
| C-03 | `worker/package.json` | Minimal — `"private": true` | +7 | `npm install` succeeds |
| C-04 | `worker/src/index.js` | **Pillar 1**: `GET /api/health`, `GET /api/quota` — returns D1 status + write counter | +20 | curl returns correct JSON |
| C-05 | `worker/src/index.js` | **Pillar 2**: `POST /api/auth/signup` — validate email uniqueness, hash password (SHA-256 + salt), create user + session, return token | +25 | curl signup → 201 with user + token |
| C-06 | `worker/src/index.js` | **Pillar 2**: `POST /api/auth/login` — validate credentials, create session, return token | +20 | curl login → valid token |
| C-07 | `worker/src/index.js` | **Pillar 2**: `GET /api/auth/validate?token=xxx` — check session not expired + not revoked, return user with plan + limits | +15 | Expired/revoked token → 401 |
| C-08 | `worker/src/index.js` | **Pillar 3**: `POST /api/ingestion` + `PATCH /api/ingestion` — immediate log write + status updates | +15 | Log written before any processing |
| C-09 | `worker/src/index.js` | **Pillar 1**: `POST /api/uploads` — create upload with user_id FK, increment quota | +15 | 201 with upload id |
| C-10 | `worker/src/index.js` | **Pillar 1+4**: `POST /api/signals` — batch INSERT OR IGNORE, quota check (429 at 95%), increment trade_count + quota | +35 | Duplicate row_hash → `skipped > 0` |
| C-11 | `worker/src/index.js` | **Pillar 4**: `POST /api/signals/lookup` — bulk SELECT row_hash IN (...), multi-tenant WHERE user_id = ? | +15 | Returns only non-duplicate hashes |
| C-12 | `worker/src/index.js` | **Pillar 1**: `GET /api/uploads?user_id=...` — paginated, user-scoped | +15 | Returns user's uploads only |
| C-13 | `worker/src/index.js` | **Pillar 2**: `GET /api/admin/users` — list all users, `POST /api/admin/users/plan` — upgrade/downgrade, `POST /api/admin/sessions/revoke` | +25 | Admin-only operations |

**Gate C**: All 15 Worker endpoints return correct responses. Duplicate row_hash → `skipped > 0`. Invalid token → 401. Quota at 95% → 429.

---

## Phase D (Frontend — IndexedDB + Client-Mediated Sync + Auth UI)

**Goal**: Frontend persistence, auth, and admin UI.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| D-01 | `frontend/src/services/db.js` | **Pillar 4**: IndexedDB wrapper — saveReport, getReport, listReports, deleteReport | +80 | Stores and retrieves across page refresh |
| D-02 | `frontend/src/services/sync.js` | **Pillar 4**: Client-mediated sync — on WS complete, save to IndexedDB, then POST to backend with exponential backoff (1s→2s→4s→8s→16s) | +60 | Retries on failure, stops at 16s |
| D-03 | `frontend/src/services/auth.js` | **Pillar 2**: Login, signup, logout, getSession, isAuthenticated, isAdmin. Token stored in localStorage. | +50 | Session persists across refresh |
| D-04 | `frontend/src/pages/LoginPage.jsx` | **Pillar 2**: Login/signup form with toggle | +80 | Signs up, logs in, redirects to /dashboard |
| D-05 | `frontend/src/pages/AdminPage.jsx` | **Pillar 2**: Admin dashboard — user list, plan upgrade/downgrade, revoke sessions, quota display | +120 | Admin-only route, shows user table |
| D-06 | `frontend/src/services/api.js` | **Pillar 4**: Inject auth token into WS/HTTP headers. After WS complete, call sync.js. | +15 | Authenticated requests work |
| D-07 | `frontend/src/components/Dashboard.jsx` | **Pillar 4**: Load from IndexedDB if no active session | +10 | Dashboard loads from IndexedDB on page load |
| D-08 | `frontend/src/App.jsx` | **Pillar 2**: Add /login, /signup, /dashboard/admin routes. ProtectedRoute checks auth + admin. | +15 | Routing works |

**Gate D**: User can sign up, log in, run backtest, close browser, reopen → report still in Dashboard. Admin can see users, upgrade plans, revoke sessions.

---

## Phase E (Dual-Stage Lookup — Backtester Integration)

**Goal**: Before yfinance calls, check D1 for existing row_hashes and skip known rows.

| Task | File | Action | Lines | Verification |
|---|---|---|---|---|
| E-01 | `backend/core/backtester.py` | **Pillar 4**: After CSV parsing, compute all row_hashes. Call D1 `POST /signals/lookup` to get existing set. Split signals into `known` + `new`. | +15 | Existing tests still pass (mocked) |
| E-02 | `backend/core/backtester.py` | **Pillar 4**: Skip yfinance fetch for `known` signals — build `SignalResult` from cached D1 data. Fetch yfinance only for `new` signals. | +20 | Reduced yfinance calls |
| E-03 | `backend/tests/test_dual_stage.py` | Test: known rows skip yfinance, new rows fetch. Mock D1 lookup. | +40 | Zero regression — existing tests pass |

**Gate E**: Backtest with 100 signals where 80 are already in D1 → only 20 yfinance calls made.

---

## File Inventory

| File | Phase | Status |
|---|---|---|
| `backend/persistence.py` | A | ✅ Committed |
| `backend/tests/test_persistence.py` | A | ✅ Committed |
| `backend/config.py` | B | 📝 Edit (+8 lines) |
| `backend/main.py` | B | 📝 Edit (+160 lines) |
| `backend/tests/test_auth.py` | B | ✨ New |
| `backend/tests/test_ingestion.py` | B | ✨ New |
| `worker/migrations/001_init.sql` | C | ✨ New — written |
| `worker/src/index.js` | C | ✨ New — written |
| `worker/wrangler.toml` | C | ✨ New — written |
| `worker/package.json` | C | ✨ New — written |
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
| Phase B breaks existing tests | `git revert B-commit` — 8 lines added to config.py, ~160 to main.py |
| Phase C Worker has SQL error | Fix, `npx wrangler deploy` again — zero downtime |
| Phase D IndexedDB corrupts | Clear IndexedDB in browser devtools, reload — data re-fetched from sessionStorage fallback |
| Phase E breaks backtest | `git revert E-commit` — backtester.py returns to original, no functional loss |
| All of it | `git checkout main; git branch -D feat/d1-persistence; npx wrangler rollback` |
