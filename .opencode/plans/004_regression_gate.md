# 004 — Regression Gate: Test Scenarios & Test Cases Plan

**Priority**: P0 (Infrastructure — must exist before any code change)
**Status**: Design Complete — Ready for Implementation
**Dependencies**: None

---

## 1. Philosophy

Before any code change, a single command must run all regression tests. If any step fails → **BLOCK**. No code changes accepted unless the gate passes.

```bash
python -m scripts.regression_gate
```

---

## 2. Test Scenarios & Test Cases

### Layer 1: Backend Unit Tests (pytest)

**Target**: `backend/core/`, `backend/utils/`, `backend/models/`

#### A. Date Utils (`date_utils.py`)

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| A1 | `get_next_trading_day` finds same-day | date=Monday(2024-01-01), data has Mon–Fri | Returns Monday |
| A2 | `get_next_trading_day` skips weekend | date=Saturday(2024-01-06), data has Mon–Fri | Returns Monday(2024-01-08) |
| A3 | `get_next_trading_day` no future data | date=Friday, data ends Friday | Returns Friday |
| A4 | `get_next_trading_day` max_lookahead hit | date=Monday, data has no Mon..Fri+5 | Returns None |
| A5 | `get_future_trading_day` skips same-day | date=Monday(2024-01-01), data has Mon–Fri | Returns Tuesday |
| A6 | `get_future_trading_day` skips weekend | date=Saturday(2024-01-06), data has Mon–Fri | Returns Monday(2024-01-08) |
| A7 | `get_future_trading_day` no future data | date=Friday, data ends at Friday | Returns None |
| A8 | `get_future_trading_day` max_lookahead | date=Monday, data has Tue+5 | Returns None if beyond lookahead |
| A9 | `parse_date` ISO format | "2024-01-15" | datetime(2024,1,15) |
| A10 | `parse_date` DD-MM-YYYY | "15-01-2024" | datetime(2024,1,15) |
| A11 | `parse_date` DD/MM/YYYY | "15/01/2024" | datetime(2024,1,15) |
| A12 | `parse_date` invalid | "not-a-date" | raises ValueError |

#### B. Schema Validation (`schemas.py`)

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| B1 | SignalResult defaults | Create with min fields | entry_mode="next_close", next_5_days=None |
| B2 | SignalResult all fields | Create with all 8 new fields | Serializes correctly |
| B3 | BacktestReport with entry_mode | Create with entry_mode | report.dict() includes entry_mode |
| B4 | Old JSON backward compat | Load JSON without new fields | Parses with defaults (next_5_days=None) |

#### C. Backtester — Entry Mode (`backtester.py`)

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| C1 | next_close mode default | No entry_mode passed | entry_price = df[entry_date]["Close"] |
| C2 | next_open mode | entry_mode="next_open" | entry_price = df[entry_date]["Open"] |
| C3 | signal_date preserved | Mock signal_date=2024-01-01 | result.signal_date = "2024-01-01" |
| C4 | signal_close_price populated | Trading day exists on signal_date | result.signal_close_price = Close price |
| C5 | signal_close_price None | No trading day near signal_date | result.signal_close_price = None |
| C6 | entry_date always next day | signal_date=Monday(trading) | entry_date = Tuesday |
| C7 | entry_date None → "No Entry Data" | signal_date too recent | status = "No Entry Data", entry_price=0.0 |
| C8 | All 6 horizons populated | Valid signal | return_7d, 14d, 30d, 45d, 60d, 90d all present |
| C9 | Max high/low in window | Valid signal | max_high_90d >= max_low_90d, dates present |

#### D. Backtester — Next 5 Days

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| D1 | All trading days | entry_date=Monday, full week data | 5 prices, no H/W |
| D2 | Weekend in window | entry_date=Thursday | D+3=W, D+4=W |
| D3 | Holiday in window | entry_date=Monday, Wed no data | D+2=H, others price |
| D4 | Beyond data range | entry_date near end of data | Trailing days = H |
| D5 | Failed trade | status ≠ "Success" | next_5_days = None |

#### E. Backtester — Error Handling

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| E1 | Invalid symbol | SymbolResolver returns None | status="Symbol Not Found" |
| E2 | Invalid date | parse_date fails | status="Invalid Date" |
| E3 | No data returned | get_ticker_data returns None | status="No Data" |
| E4 | Empty symbol or date in CSV | Missing fields | status="Invalid Input" |
| E5 | Bulk fetch fails, fallback works | bulk_df empty → fallback path | Same results via DeepDiff |

---

### Layer 2: Backend Regression Script

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| R1 | Bulk vs sequential parity | 3 symbols, run both paths | DeepDiff(significant_digits=2) = {} |
| R2 | After schema change | Add new field, run regression | New field present in both, no diff |

---

### Layer 3: Frontend Unit Tests (vitest + @testing-library/react)

#### F. UploadCard Component

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| F1 | Renders drop zone | Default render | File input + label visible |
| F2 | Shows file name after selection | Simulate file select | File name appears |
| F3 | Entry mode selector visible after file | File selected, not loading | 2 buttons (Next Open, Next Close) visible |
| F4 | Entry mode defaults to next_close | No onEntryModeChange | Next Close button has .active class |
| F5 | Clicking Next Open calls callback | Click Next Open button | onEntryModeChange("next_open") called |
| F6 | Clicking Next Close switches | After Next Open, click Next Close | onEntryModeChange("next_close") called |
| F7 | Submit button calls onUpload | File selected, click Run | onUpload(file) called |
| F8 | Submit disabled when loading | isLoading=true | Button not rendered (or disabled) |
| F9 | Progress bar shown when loading | isLoading=true, progress object | Progress bar rendered with correct % |
| F10 | Entry selector hidden when no file | No file selected | Entry mode section not rendered |

#### G. Dashboard Component

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| G1 | Renders trade table with all columns | report with 2 trades | Headers: Symbol, Signal Date, Close, Entry Date, Entry Price, Mode, D+1..D+5, 1W, 1M, 3M, Max High, Max Low |
| G2 | Mode badge shows Open/Close | trade.entry_mode="next_open" | Badge shows "Open" with open class |
| G3 | Mode badge fallback | No entry_mode on trade | Badge shows "Close" (default) |
| G4 | Close column shows price | signal_close_price=1500.5 | "₹1,500.50" |
| G5 | Close column shows dash | no signal_close_price | "-" |
| G6 | Entry date shows fallback | trade.entry_date=null | Shows trade.signal_date |
| G7 | Next 5 days renders prices | trade.next_5_days populated | 5 cells with correct content |
| G8 | Next 5 days handles null | trade.next_5_days=null | 5 cells with "-" |
| G9 | D+1..D+5 headers not sortable | Click header | No sortConfig change |
| G10 | Sorting by signal_date works | Click Signal Date header | Trades reorder by date |
| G11 | Default sort is signal_date asc | No sort clicked | Trades sorted by date ascending |
| G12 | Format percent for positive/negative | return_7d=5.5 vs -3.2 | "+5.50%" vs "-3.20%" |
| G13 | Pagination with >25 trades | 50 trades | Page 1 shows 25, page 2 shows rest |

#### H. StockChartModal Component

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| H1 | Entry point uses entry_date | stock has entry_date | Chart entry point = entry_date |
| H2 | Entry point fallback | stock has no entry_date | Chart entry point = signal_date |
| H3 | Footer shows both dates | stock has both | "Signal: ... \| Entry: ..." |

#### I. BacktesterPage Component

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| I1 | UploadCard receives entryMode prop | entryMode="next_open" | UploadCard shows Next Open active |
| I2 | runBacktestWS called with entryMode | handleUpload(file) | WS URL includes ?entry_mode= |

---

### Layer 4: Integration Tests

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| INT1 | Full backtest flow (mock WS) | Upload file, receive progress + complete | Report received with all trades |
| INT2 | HTTP fallback (no WS) | WS fails, HTTP fallback succeeds | Same report via POST /api/backtest |
| INT3 | Real data (limited) | 2 symbols, 1 month range | entry_price > 0, status="Success" |

---

### Layer 5: E2E Tests (future — Playwright or Cypress)

| # | Scenario | Test Case | Expected |
|---|---|---|---|
| E2E1 | Full user journey | Open page → select file → choose Next Open → run → see results | Dashboard renders with correct entry prices |
| E2E2 | Mode toggle changes results | Run with Next Close, then Next Open | Entry prices differ between runs |

---

## 3. Regression Gate Command

```bash
# Single command — MUST pass before any commit/push
python -m scripts.regression_gate
```

### Steps executed in order:

| Step | Command | Failure = Block? |
|---|---|---|
| 1 | `cd frontend && npm run lint` | Yes |
| 2 | `pytest backend/tests/ -v --asyncio-mode=auto --cov=backend` | Yes |
| 3 | `python backend/tests/verify_regression.py` | Yes |
| 4 | `cd frontend && npx vitest run` | Yes |
| 5 | `cd frontend && npm run build` | Yes |

If any step fails → **BLOCK**. No code changes accepted.

---

## 4. Required Infrastructure

| # | Item | Purpose | Status |
|---|---|---|---|
| 1 | `pytest.ini` | Default flags (--asyncio-mode=auto, --cov) | Not created |
| 2 | `conftest.py` | Shared fixtures, mock DataProvider globally | Not created |
| 3 | `pytest-cov` | Coverage measurement | Not installed |
| 4 | `vitest` + `@testing-library/react` | Frontend unit testing | Not installed |
| 5 | `vitest.config.js` | Vitest configuration | Not created |
| 6 | `.github/workflows/test.yml` | CI/CD — run gate on push/PR | Not created |
| 7 | `scripts/regression_gate.py` | Orchestrator script | Not created |
| 8 | Individual test files (A–I) | All test cases above | Not created |
