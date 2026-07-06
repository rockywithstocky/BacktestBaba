# TASK_LOG.md — Phase 0: Stabilization

## Overview

Phase 0 fixes 6 verified correctness and reliability bugs, adds structured logging, and establishes the test baseline for all subsequent phases. No architectural changes, no new features, no performance work.

## Frozen Scope (6 items)

| ID | Description | Priority | Status |
|----|-------------|----------|--------|
| 0a | Structured logging — replace `print()` with Python logging | High | Planned |
| 0b | C1/C6 — error isolation + timeout on all yfinance I/O | Critical | Planned |
| 0c | C5 — fix HTTP fallback Content-Type (remove malformed header) | Critical | Planned |
| 0d | H1 — recognize `signal_date` column in CSV parsing | High | Planned |
| 0e | H10 — double-submit guard on "Run Backtest" button | High | Planned |
| 0f | M11 — wrap `JSON.parse(event.data)` in try/catch | Medium | Planned |

## Execution Order

Recommended: 0a → 0b → {0c, 0d, 0e, 0f in any order}

Tasks 0c, 0d, 0e, 0f are independent of each other and of 0a/0b and may be executed in any order.

## Task Records

### Task 0a — Structured Logging

**Objective**: Replace all `print()` calls in backend modules with Python `logging`. Add timing and outcome log lines at phase boundaries.

**Status**: Planned

**Files affected**: `backend/core/backtester.py`, `backend/core/data_provider.py`, `backend/main.py`

**Validation**:
- Run any backtest, verify structured log lines appear with timestamp, logger name, level, message
- Verify Phase A/B/C boundary logs include timing
- Verify no `print()` remains in changed files

**Regression checks**: `pytest backend/tests/test_backtester.py -v`

**Success criteria**: All prints replaced. Phase boundary logs appear on every run.

---

### Task 0b — C1/C6: Error Isolation on All yfinance I/O

**Objective**: Wrap every yfinance call in `DataProvider` with try/except. Add explicit timeout to `get_ticker_data` and `get_latest_price`.

**Status**: Planned

**Files affected**: `backend/core/data_provider.py`

**Validation**:
- Simulate yfinance failure (e.g., pass unresolvable symbol) → backtest completes with `"No Data"`, not 500
- Verify successful runs produce identical results

**Regression checks**: `pytest backend/tests/test_backtester.py -v`

**Success criteria**: Backtest survives yfinance failures. Normal runs unchanged.

---

### Task 0c — C5: HTTP Fallback Content-Type

**Objective**: Remove manually-set `Content-Type: multipart/form-data` from HTTP fallback request.

**Status**: Planned

**Files affected**: `frontend/src/services/api.js`

**Validation**:
- Block WebSocket, upload CSV → HTTP fallback delivers complete report

**Regression checks**: Normal WebSocket backtest still works

**Success criteria**: HTTP fallback delivers report when WS is unavailable.

---

### Task 0d — H1: signal_date Column Recognition

**Objective**: Rename `signal_date` column to `date` during CSV parsing so backtester recognizes it.

**Status**: Planned

**Files affected**: `backend/main.py`

**Validation**:
- Upload CSV with `signal_date` header → trades have valid dates
- CSV with both `date` and `signal_date` → `date` is used (no conflict)

**Regression checks**: Standard CSV with `date` column produces identical results

**Success criteria**: CSV with `signal_date` column produces valid results.

---

### Task 0e — H10: Double-Submit Guard

**Objective**: Disable "Run Backtest" button and ignore duplicate clicks while a backtest is running.

**Status**: Planned

**Files affected**: `frontend/src/pages/BacktesterPage.jsx`

**Validation**:
- Click "Run Backtest" rapidly 3 times → only one WS connection created
- Button re-enables after completion

**Regression checks**: Normal single-click backtest works

**Success criteria**: One WS connection per click session.

---

### Task 0f — M11: JSON.parse Safety in api.js

**Objective**: Wrap `JSON.parse(event.data)` in try/catch to prevent malformed messages from crashing the WS handler.

**Status**: Planned

**Files affected**: `frontend/src/services/api.js`

**Validation**:
- Send malformed JSON via DevTools override → error callback fires

**Regression checks**: Normal backtest produces report as before

**Success criteria**: Malformed backend JSON triggers error callback, not silent crash.
