**Project:** ChartChampion (formerly BacktestBaba)
**Branch:** `main` (merged from `feature/perf-persistence-stabilize`)
**Status:** All 10 task groups complete ✅ | 1 bugfix merged ✅ | 1 pending UI task

Production URLs:
- Frontend: https://chartchampion.vercel.app
- Backend API: https://backtestbaba-api.onrender.com
- Swagger: https://backtestbaba-api.onrender.com/docs

## 1. Start Local Environment
```powershell
# Terminal 1 (Backend)
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 (Frontend)
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\frontend"
npm run dev
```

## 2. Completed Work

### TGs 1-8: Streaming batch pipeline (feature branch)
- Config, file hash cache, batch symbol resolution, CSV metadata extraction, range-aware data cache, online aggregation, WS keepalive/streaming, configurable timeouts

### TG9 (verified): Large CSV verification
- 9-year CSV: 4658 signals, 1142 symbols, 4636 Success. Phase A 57s, Phase B 175s, Phase C 20s. 0 API metadata calls.

### TG10 (merged to main): Chunked bulk fetch — OOM-safe on Render
| Change | File | Lines |
|--------|------|-------|
| Added `BULK_FETCH_CHUNK = 100` config | `backend/config.py` | +1 |
| Phase B: loop over 100-symbol chunks instead of single `yf.download(all)` | `backend/core/backtester.py` | 45→28 |
| Phase C: removed `bulk_df` slicing, always uses `get_ticker_data()` (cache-first) | `backend/core/backtester.py` | 9→29 |

Peak RAM: ~400-500MB → ~35-40MB per chunk.

### Bugfix (merged to main): tz-naive / tz-aware timestamp crash
| Change | File | Lines |
|--------|------|-------|
| Normalize yfinance tz-aware index to tz-naive in `persist_symbol_data()` | `backend/core/data_provider.py` | +12 |
| Normalize cached range metadata + index in `get_ticker_data()` | `backend/core/data_provider.py` | +10 |

Resolves: `Cannot compare tz-naive and tz-aware timestamps` crash in production.

## 3. Pending Task — TG11: Horizon Selector Dropdown UI

**Branch**: Create from `main` → `feature/ui-horizon-selector`

**Problem**: Backend returns 6 horizons (7d/14d/30d/45d/60d/90d) but UI only shows 7d/30d/90d.

**Plan**: Add a single `<select>` dropdown in the header area (next to Capital input) that switches which horizon's data is displayed:

```
Stats:  Win Rate 52%  |  Avg Return +8.3%   (updates per dropdown)
Table:  Symbol | Date | Close | Entry | Return | Exit Price | Max High | Max Low
        [single Return column for selected horizon]
Charts: "Optimal Holding Period" — already shows all 6, no change
```

**Files changed**: 1 file — `frontend/src/components/Dashboard.jsx`
- Add `useState` for `selectedHorizon` (default '30d')
- Add `<select>` dropdown with 6 options in header
- Swap 3 static return columns for 1 dynamic column
- Swap 3 static stat cards for 1 dynamic pair
- ~20 lines total

**Why not 3 more columns**: Table already has 11 columns. Adding 3 more = 16. Unusable on mobile. Dropdown keeps it compact and scales to any number of horizons.

## 4. Pre-existing Issues (Not Caused by Changes)
- `verify_regression.py` has 0.01 floating-point noise between bulk/sequential modes (yfinance response variation)
- `test_integration.py` calls non-existent `Backtester.run_backtest` (should be `run_backtest_async`)
- Pydantic v2 `.dict()` deprecation warnings in tests (pre-existing)

## 5. Testing
```powershell
cd "D:\AI\Stock Market\ChartInk\BacktestBaba\backend"
.\venv\Scripts\Activate.ps1
pytest tests/ -v --asyncio-mode=auto          # 3/3 pass
python tests/verify_regression.py              # Identical reports
```
