# Consolidated Implementation Plan - BacktestBaba

**Date:** 2026-07-16
**Status:** Phase 0 + 0.5 + 1 — ALL COMPLETE ✅
**Next:** Phase 2 planning or backlog items (see RESUME_WORK.md)

---

## Pre-Flight Checklist (Phase 0 - Prerequisite Fixes) — ✅ COMPLETE

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 0.1 | Remove auth console.log | ✅ Done | `frontend/src/services/auth.js` — stripped |
| 0.2 | Fix win rate percentage | ✅ Done | Removed `* 100` in `BacktesterPage.jsx` |
| 0.3 | Fix capital NaN on empty input | ✅ Done | `Dashboard.jsx`: `useState(0)` → `useState('')`, NaN guard, localStorage persistence |
| 0.4 | Remove gc.collect() from backtester | ✅ Done | `backend/core/backtester.py` — removed |
| 0.5 | Fix test_integration.py method name | ✅ Done | `run_backtest` → `run_backtest_async` |
| 0.6 | Remove double footer | ✅ Done | Removed inline footer from `LandingPage.jsx` |
| 0.7 | Update copyright year | ✅ Done | 2024 → current year |
| 0.8 | Remove console.log from api.js and sync.js | ✅ Done | Stripped WS and IndexedDB console noise |

---

## Quick Performance Wins (Phase 0.5) — ✅ COMPLETE

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 0.9 | Throttle progress updates | ✅ Done | `PROGRESS_THROTTLE_EVERY_N` in config + backtester |
| 0.10 | Add WS watchdog timeout | ✅ Done | Watchdog timer in WS endpoint, re-arms on each progress message |
| 0.11 | Add timeout to metadata fetch | ✅ Done | `asyncio.wait_for(..., timeout=10)` in Semaphore |
| 0.12 | Enable GZip middleware | ✅ Done | `GZipMiddleware(minimum_size=1000)` in `main.py` |
| 0.13 | Precompute timedelta(days=...) | ✅ Done | Hoisted `timedelta(days=duration+10)` and horizon deltas |

---

## Phase 1 - PostgreSQL Persistence — ✅ COMPLETE

> **Council Refinements (all applied):**
> - Circuit breaker: PostgresBackend — 3 failures → NullBackend for 60s
> - `statement_timeout=3000` on all PG queries
> - `compute_row_hash` includes duration: SHA-256(symbol\|signal_date\|entry_mode\|duration)
> - `symbol_freshness` table exists in schema (unused — deferred to Phase 2)
> - `cache_info` in API response (pending — see backlog)
> - App/infra separation: compose splits postgres (infra) from backend/frontend (app)

| ID | Task | Status | Verification |
|----|------|--------|-------------|
| 1.1 | Docker fixes (COPY, typing, volume, version) | ✅ Done | `docker compose up --build` starts clean |
| 1.2 | Fix ABC return types + 6 auth/admin methods | ✅ Done | All pytest pass |
| 1.3 | Replace 7 isinstance guards with polymorphic calls | ✅ Done | Auth + admin endpoints work |
| 1.4 | Create backend/schema.sql | ✅ Done | 6 tables: users, sessions, ingestion_log, uploads, signal_hashes, quota |
| 1.5 | Add DATABASE_URL + selection logic | ✅ Done | PostgresBackend selected when `!is_render()` |
| 1.6 | Create PostgresBackend class | ✅ Done | asyncpg pool, 17 ABC methods, circuit breaker, 3s timeout |
| 1.7 | Add PostgreSQL service to Docker Compose | ✅ Done | postgres:16-alpine, healthcheck, pg_data volume |
| 1.8 | Clean up Docker Compose | ✅ Done | No version keys, depends_on with health condition |
| 1.9 | Update .env.local | ✅ Done | `DATABASE_URL` replaces `WORKER_URL` |
| 1.10 | Full E2E verification | ✅ Done | 59/59 tests, API login, backtest → PostgreSQL persistence confirmed |

### Additional Fixes This Session
| ID | Issue | Status |
|----|-------|--------|
| F1 | `batch_resolve` double-suffixes pre-suffixed symbols (.NS/.BO) | ✅ Fixed in `symbol_resolver.py` |
| F2 | `schema.sql` INSERT fails on GENERATED ALWAYS AS IDENTITY column | ✅ Fixed — removed explicit `id` from INSERT |
| F3 | pgAdmin GUI missing from infra | ✅ Added `dpage/pgadmin4` service on port 8080 |
| F4 | Capital input frozen at 0 (React NaN state lock) | ✅ Fixed — empty initial, NaN guard, localStorage persistence |

---

## Kaizen Batch Breakdown

| Batch | Tasks | Description | Verification Gate |
|-------|-------|-------------|-------------------|
| 1 | 0.1, 0.3, 0.6, 0.7, 0.8 | Auth console logging + capital NaN + double footer + 2024 year + api.js/sync.js console logs - all 1-line fixes | pytest + login check + visual inspection |
| 2 | 0.2 | Win rate percentage fix (remove * 100 in BacktesterPage) | Upload test CSV, verify win rate shows correct % |
| 3 | 0.4, 0.5, 0.13 | GC removal + test fix (rename to run_backtest_async) + precompute timedelta | pytest tests/ -v all green |
| 4 | 0.9, 0.10, 0.11, 0.12 | Progress throttle + WS watchdog + metadata timeout + GZip middleware | Manual WS test with progress visible |
| 5 | 1.1, 1.2 | Docker fixes + ABC return types + new auth/admin methods | pytest test_persistence.py |
| 6 | 1.3 | Replace 7 isinstance guards with polymorphic calls | pytest tests/ -v |
| 7 | 1.4, 1.5, 1.6, 1.7 | Schema + config + PostgresBackend + Docker compose postgres | docker compose up + smoke test |
| 8 | 1.8, 1.9 | Compose cleanup + .env.local | docker compose build clean |
| 9 | 1.10 | Full E2E verification | pytest + Docker smoke + upload history + auth |

---

## Found Bugs Reference

Ten bugs identified during testing assessment.

| # | Bug | Location | Severity |
|---|-----|----------|----------|
| B1 | Auth credentials logged to browser console | frontend/src/services/auth.js:61,65 | Medium |
| B2 | Win rate displayed as 5000% (multiplied by 100 twice) | frontend/src/pages/BacktesterPage.jsx:217 | High |
| B3 | Capital input set to empty string causes NaN in calculations | frontend/src/components/Dashboard.jsx:20,63 | Medium |
| B4 | Double footer on landing page | frontend/src/App.jsx:74 + frontend/src/pages/LandingPage.jsx:162 | Low |
| B5 | Copyright year hardcoded to 2024 | frontend/src/pages/LandingPage.jsx:173 | Low |
| B6 | gc.collect() and del chunk_df in hot path | backend/core/backtester.py:210-211 | Low |
| B7 | test_integration.py calls non-existent run_backtest | backend/tests/test_integration.py:18 | Medium |
| B8 | compute_row_hash excludes duration | backend/persistence.py (current impl) | Medium |
| B9 | Pydantic v2 .dict() deprecation warnings | Multiple files in backend/models/schemas.py | Low |
| B10 | verify_regression.py has 0.01 floating-point noise | backend/tests/verify_regression.py | Low |

---

## Test Coverage Gap

| Area | Existing Tests | Needed Tests | Gap |
|------|---------------|--------------|-----|
| Backtester (core logic) | test_backtester.py - 2 test functions, mocked data | Edge cases: empty CSV, all-fail signals, single signal, 1000+ signals | Medium |
| Persistence ABC | test_persistence.py - 29 tests, all backends | PostgresBackend tests (mocked asyncpg) | High |
| Integration (real data) | test_integration.py - 1 script, calls wrong method | Rename to run_backtest_async, add assertions | High |
| API endpoints | None | POST /api/backtest, GET /api/prices/{symbol}, auth endpoints | Critical |
| WebSocket | None | Progress streaming, reconnection, timeout behavior | Critical |
| Frontend | None | Dashboard calculations, WS reconnection, error states | Critical |
| Regression (bulk vs sequential) | verify_regression.py - manual script | Floating-point tolerance (0.01 noise) | Low |
