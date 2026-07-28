# BacktestBaba — Work State (2026-07-20)

**Branch:** `feat/d1-persistence` (ahead of origin by 3 commits)
**Status:** TradingView link in Latest Price cell — shipped (3 iterations). Gitignore cleanup done.
**Next:** Merge `feat/d1-persistence` → `main` (or fix remaining PR #7 items first)
**Test Count:** Backend 85/85, Frontend 21/21, Build OK

---

## 0. Local Environment (Docker Compose)

```powershell
cd "D:\AI\Stock Market\ChartInk\BacktestBaba"
docker compose up -d --build    # Start all 4 services (rebuild after code changes)
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:5174 | — |
| Backend API | http://localhost:8000 | — |
| Swagger Docs | http://localhost:8000/docs | — |
| pgAdmin (DB GUI) | http://localhost:8080 | `admin@backtestbaba.com` / `admin` |
| PostgreSQL | localhost:5432 | `backtest` / `backtest` / `backtestbaba` |

Tests inside Docker:
```powershell
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto
```

Frontend tests:
```powershell
cd frontend; npm test -- --run
```

---

## 1. Completed This Session (Jul 20, 2026)

### TradingView Link in Latest Price Cell

**3-iteration evolution:**

| # | URL Format | Result |
|---|-----------|--------|
| 1 | `https://in.tradingview.com/chart/?symbol=NSE:SYMBOL` | Colon `:` URL-encoded to `%3A` by browser, TradingView couldn't parse |
| 2 | `https://in.tradingview.com/symbols/NSE-SYMBOL/` | User reported this opens symbol overview page, NOT the chart directly |
| 3 (final) | `https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}` | Produces `?symbol=NSE%3ABAJAJ-AUTO` — TradingView's own URL format, direct chart access |

**`getTradingViewUrl()` helper** (`Dashboard.jsx:173-178`):
- Maps `.NS` → `NSE:`, `.BO` → `BSE:` prefix
- Uses `encodeURIComponent()` on the full `EXCHANGE:SYMBOL` string → colon becomes `%3A`
- Guard clause returns `#` for empty/null symbol
- Inline `style={{ color: 'inherit', textDecoration: 'none' }}` preserves existing text color

**Latest Price cell** (`Dashboard.jsx:500-509`):
- Replaced plain-text price with `<a href={getTradingViewUrl(trade.symbol)} target="_blank" rel="noopener noreferrer">`
- Conditionally rendered only when `trade.latest_price && trade.symbol` are truthy
- Falls back to plain `formatCurrency(price)` or `'N/A'`
- Removed misleading `clickable-cell` class (had no click handler)

### Gitignore Cleanup

- Added `docs/backtest_analyzer*.html` pattern to `.gitignore` (covers all analysis artifacts)
- Deleted stale `docs/backtest_analyzer.html` (committed in `f16d4c1`)
- Two untracked HTML files (`backtest_analyzer_Latest_well.html`, `backtest_analyzer_claude.html`) now ignored

### Docker Rebuild

- Frontend and backend rebuilt and restarted via `docker compose up -d --build`
- Both services respond 200

### Test Results

| Suite | Count | Status |
|-------|-------|--------|
| Backend pytest | 85/85 passed | ✅ |
| Frontend vitest | 21/21 passed | ✅ |
| Frontend Docker build | 2781 modules, 0 errors | ✅ |

### Commits

```
a4ac87b Revert to /chart/ URL with encodeURIComponent for colon handling
         1 file changed, 4 insertions(+), 3 deletions(-)
96fc455 Cleanup: gitignore analysis artifacts, update RESUME_WORK.md, remove stale backtest_analyzer.html
         3 files changed, 66 insertions(+), 658 deletions(-)
```

---

## 2. PR #7 — 4 Actionable Fixes (Todo)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | **Row-hash excludes entry_price** | `persistence.py:16` | Add `entry_price` to `compute_row_hash()` formula so different entry prices produce different hashes |
| 2 | **L2 cache crashes if signal_results table missing** | `main.py:373-435` | Wrap `get_upload_by_user_and_hash` / `get_signals_for_upload` in try/except → fallback to cache MISS |
| 3 | **No auth tests** | `tests/` | Add `test_auth.py` covering signup, login, token validation, expired token, logout revocation |
| 4 | **L1 freshness check compares date, not timestamp** | `main.py:328` | Change `cached_latest_date < "YYYY-MM-DD"` → `cached_latest_ts < now - timedelta(minutes=5)` so same-day re-uploads at 4pm don't skip refresh if cached at 2pm |

---

## 3. Known Issues / Backlog

| ID | Issue | Location | Priority |
|----|-------|----------|----------|
| L3 | Copyright year hardcoded to 2024 in landing page footer | `LandingPage.jsx` | Low |
| P1 | Account deletion API (pre-mortem item) | Not implemented | Tracked |
| R5 | D1WorkerBackend stubs for 9 new methods | `persistence.py` | Must implement before Render deploy w/ persistence |
| **PR7.1** | **Row-hash excludes entry_price** | `persistence.py:16` | **High** — affects dedup correctness |
| **PR7.2** | **L2 cache crashes if signal_results table missing** | `main.py:373-435` | **High** — blocks deploy without Postgres |
| **PR7.3** | **Missing auth tests** | `tests/test_auth.py` | **Medium** — required before prod deploy |
| **PR7.4** | **L1 freshness uses date, not timestamp** | `main.py:328` | **Low** — minor, same-day re-upload edge case |

---

## 4. Quick Resume Commands

```powershell
# Rebuild + start (after code changes)
docker compose up -d --build

# Run all backend tests
docker compose exec backend pytest backend/tests/ -v --asyncio-mode=auto

# Run frontend tests
cd frontend; npm test -- --run

# Frontend build check
cd frontend; npm run build

# View backend logs
docker compose logs -f backend

# Clear diskcache (wipes all caches)
docker compose exec backend python -c "from backend.core.data_provider import cache; cache.clear()"

# Access PostgreSQL
docker compose exec postgres psql -U backtest -d backtestbaba

# Push to main and deploy
git push origin feat/d1-persistence
# Then open PR: main ← feat/d1-persistence
```
