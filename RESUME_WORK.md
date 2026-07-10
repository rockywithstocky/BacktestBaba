**Project:** ChartChampion (formerly BacktestBaba)
**Branch:** `feature/stockchart-modal-enhancement` (not yet merged)
**Status:** StockChartModal enhancement in progress — candlestick as 4th chart type, hero return, stats reorg

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

### OOM Fix 2 (unreleased — not yet pushed to main): Chunk size 25 + explicit GC
Despite TG10, `yf.download(threads=True)` with 100 symbols still spikes past 512MB on Render because 100 parallel threads each hold their own DataFrame + JSON parse buffers simultaneously.
| Change | File | Lines |
|--------|------|-------|
| Reduced default `BULK_FETCH_CHUNK` 100→25 | `backend/config.py:30` | +1 |
| Added `import gc` + `del chunk_df; gc.collect()` after each chunk | `backend/core/backtester.py:2,195-196` | +3 |

Peak RAM per chunk: ~35-40MB → ~15-20MB (25 symbols × ~300KB each + MultiIndex).
Kept `threads=True` to avoid sequential slowdown (25-symbol chunk with threads=True completes in ~2-5s vs ~25s with threads=False).

### Bugfix (merged to main): tz-naive / tz-aware timestamp crash
| Change | File | Lines |
|--------|------|-------|
| Normalize yfinance tz-aware index to tz-naive in `persist_symbol_data()` | `backend/core/data_provider.py` | +12 |
| Normalize cached range metadata + index in `get_ticker_data()` | `backend/core/data_provider.py` | +10 |

Resolves: `Cannot compare tz-naive and tz-aware timestamps` crash in production.

## 3. Current Task — StockChartModal Enhancement

**Branch**: `feature/stockchart-modal-enhancement`

**Problem**: StockChartModal shows only 4 abstract data points (Entry/Exit/MaxHigh/MaxLow) via Recharts. Chart area feels sparse. No price context. No professional charting experience.

**Solution**: 
1. Add TradingView-style candlestick chart as 4th chart type (alongside existing Area/Line/Bar)
2. Hero return % as the primary visual element
3. Reorganize stats into 4 scannable cards (Entry/Exit/Peak/Trough)
4. New backend endpoint `GET /api/prices/{symbol}` for OHLCV data
5. Lazy-import `lightweight-charts` (45KB gzip) — zero impact on initial bundle

**Key guards**:
- Existing Area/Line/Bar charts untouched
- AbortController + stale response guard for fast symbol switching
- React 19 StrictMode double-mount guard
- Marker snap to nearest trading day
- Dynamic import error boundary (graceful fallback to area chart)
- Null-safe marker creation

**Files changed**:
| File | Change |
|------|--------|
| `backend/main.py` | +30 lines — new prices endpoint |
| `frontend/src/services/api.js` | +10 lines — fetchSymbolPrices helper |
| `frontend/src/components/StockChartModal.jsx` | Hero return, stats reorg, candlestick |
| `frontend/src/components/Dashboard.css` | +50 lines — skeleton, tooltip, hero, grid |
| `frontend/package.json` | +lightweight-charts dependency |

**Task breakdown**:
1. Update docs (SPEC, RESUME_WORK, CURRENT_STATE, AGENTS)
2. Backend prices endpoint
3. Frontend npm + api helper
4. StockChartModal rewrite
5. CSS additions
6. Full verification (pytest + build + manual)

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
