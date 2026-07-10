# SPEC: TradingView-Style Candlestick Chart in StockChartModal

## Status: Draft (Awaiting Approval)

---

## 1. Problem

When a user clicks a return cell (7d/30d/90d) in the trades table, the StockChartModal opens showing a Recharts SVG chart with only 4 abstract data points (Entry, Exit, Max High, Max Low). There is no real price history, no interactive crosshair, no meaningful tooltip, and no TradingView-like experience. The chart feels static, sparse, and unprofessional.

## 2. Goals

1. Replace Recharts with lightweight-charts (Canvas-based, 60fps, ~45KB gzip)
2. Fetch real daily OHLCV price data from the backend when the modal opens
3. Render a TradingView-style candlestick chart with crosshair, custom tooltip, and markers
4. Remove the Area/Line/Bar chart type switcher (single chart type: candlestick)
5. Fall back to an interpolated area chart with 4 markers when OHLCV data is unavailable
6. Zero glitches: AbortController stale-response guard, ResizeObserver, StrictMode-safe lifecycle

## 3. Non-Goals

- Adding volume bars (explicitly declined)
- Adding zoom/range controls (lightweight-charts provides pinch-zoom by default; no custom UI)
- Replacing the modal shell (header, stats, legend, footer stay identical)
- Changing the backtest calculation logic or data pipeline
- Persisting price data across frontend sessions (in-memory only)

## 4. Backend Changes

### 4.1 New Endpoint: `GET /api/prices/{symbol}`

**File**: `backend/main.py`

```python
@app.get("/api/prices/{symbol}")
async def get_symbol_prices(symbol: str, start: str = None, end: str = None):
    """
    Return daily OHLCV data for a resolved symbol (e.g. 'ASIANHOTNR.NS').
    Cache-first via get_ticker_data(); yfinance fallback on miss.
    Dates are YYYY-MM-DD strings.
    """
```

**Response shape**:
```json
{
  "symbol": "ASIANHOTNR.NS",
  "prices": [
    {"date": "2026-07-06", "open": 320.65, "high": 324.50, "low": 319.00, "close": 322.30},
    {"date": "2026-07-07", "open": 322.30, "high": 402.55, "low": 320.00, "close": 398.20}
  ]
}
```

**Key behaviors**:
- Calls `get_ticker_data(symbol)` which returns a DataFrame from diskcache (populated during Phase B bulk fetch)
- Filters rows to `[start, end]` inclusive
- Converts `datetime64[ns]` index → `YYYY-MM-DD` strings
- Rounds O/H/L/C to 2 decimal places
- Returns empty `"prices": []` if no data — frontend falls back to interpolated area chart
- No authentication required (same origin as existing endpoints)
- Does NOT call yfinance directly — relies on existing cached data

### 4.2 No Model Changes

`SignalResult` and `BacktestReport` remain unchanged. Price data is fetched lazily, not embedded in trade results.

---

## 5. Frontend Changes

### 5.1 Dependencies

| Action | Package | Reason |
|--------|---------|--------|
| Install | `lightweight-charts` (^5.2.0) | Canvas-based financial charting library |
| Remove | `recharts` | SVG-based, ~150KB gzip, no longer used |

### 5.2 File: `StockChartModal.jsx` (Full Rewrite)

**State**:
```javascript
// Existing (kept)
// - stock, period, onClose (props)
// - chartType — REMOVED (no more switcher)

// New (added)
const chartContainerRef = useRef(null);
const chartRef = useRef(null);
const seriesRef = useRef(null);
const toolTipRef = useRef(null);
const currentSymbolRef = useRef(null);

const [ohlcvData, setOhlcvData] = useState(null);
const [loading, setLoading] = useState(true);
```

**Lifecycle**:

```
1. Modal mounts → show skeleton
2. useEffect fires:
   a. Create lightweight-charts chart instance (once)
   b. Set up ResizeObserver
   c. Create tooltip div element
   d. Subscribe crosshairMove → update tooltip
   e. Fetch GET /api/prices/{symbol}?start={entry}&end={exit}
      → on success: setOhlcvData(prices)
      → on error/fail: setOhlcvData(null) → fallback
3. useEffect watches ohlcvData:
   a. Remove old series (if any)
   b. If ohlcvData.length > 0:
      - Add CandlestickSeries
      - setData(mapped ohlcvData)
      - setMarkers for Entry/Exit/MaxHigh/MaxLow
   c. Else:
      - Add AreaSeries with interpolated smooth curve
      - setMarkers for same 4 points
   d. chart.timeScale().fitContent()
4. Modal unmounts → chart.remove(), observer.disconnect(), AbortController.abort()
```

**Markers** (used in both candlestick and fallback paths):

| Point | Shape | Position | Color | Text |
|-------|-------|----------|-------|------|
| Entry | `arrowUp` | `belowBar` | `#10b981` | `"Entry ₹{price}"` |
| Exit (positive) | `arrowUp` | `aboveBar` | `#10b981` | `"Exit ₹{price}"` |
| Exit (negative) | `arrowDown` | `belowBar` | `#ef4444` | `"Exit ₹{price}"` |
| Max High | `arrowDown` | `aboveBar` | `#8b5cf6` | `"High ₹{price}"` |
| Max Low | `arrowUp` | `belowBar` | `#f59e0b` | `"Low ₹{price}"` |

Marker times are **snapped to nearest trading day** in the price data to prevent floating in whitespace.

**Custom Tooltip** (via `subscribeCrosshairMove`):

```
┌──────────────────────────────────┐
│  ASIANHOTNR.NS                   │
│  O: 320.65   H: 402.55           │
│  L: 320.00   C: 433.45           │
│  +6.24% from entry               │
│  2026-07-07                      │
└──────────────────────────────────┘
```

- Glass-morphism background: `rgba(30, 41, 59, 0.95)` + `backdrop-filter: blur(12px)`
- Tracking position: follows cursor with 15px offset, flips to left side when near right edge
- Hidden when cursor leaves chart bounds
- Created as a DOM element (not React) for performance — no re-render overhead

**Chart Options** (TradingView dark theme):

```javascript
{
  layout: {
    background: { type: 'solid', color: 'transparent' },
    textColor: '#d1d5db',
  },
  grid: {
    vertLines: { color: 'rgba(255,255,255,0.05)' },
    horzLines: { color: 'rgba(255,255,255,0.05)' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: {
      width: 1, color: 'rgba(255,255,255,0.2)',
      style: LineStyle.Dashed, labelBackgroundColor: '#1e293b',
    },
    horzLine: {
      width: 1, color: 'rgba(255,255,255,0.2)',
      style: LineStyle.Dashed, labelBackgroundColor: '#1e293b',
    },
  },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
  timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
}
```

**Stale-response guard**:
```javascript
const symbol = stock.symbol;
currentSymbolRef.current = symbol;
const controller = new AbortController();

fetch(`/api/prices/${symbol}?...`, { signal: controller.signal })
  .then(res => res.json())
  .then(data => {
    if (symbol !== currentSymbolRef.current) return; // discard stale
    setOhlcvData(data.prices);
  });

return () => controller.abort();
```

**StrictMode guard** (React 19 double-mount):
```javascript
useEffect(() => {
  if (chartRef.current) return; // already created
  chartRef.current = createChart(chartContainerRef.current, options);
  // ...
  return () => {
    chartRef.current?.remove();
    chartRef.current = null;
  };
}, []);
```

**Loading skeleton**: A pulsing `<div>` with `animate-pulse` and rounded corners, matching the chart dimensions. Replaced by the chart when data resolves.

### 5.3 File: `frontend/src/services/api.js`

Add helper:
```javascript
export const fetchSymbolPrices = async (symbol, start, end) => {
  const { data } = await axios.get(`${API_URL}/prices/${symbol}`, {
    params: { start, end },
    timeout: 10000,
  });
  return data.prices;
};
```

### 5.4 File: `Dashboard.css`

Add (approx. 50 lines):

```css
/* Chart skeleton loading */
.chart-skeleton {
  width: 100%;
  height: 350px;
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* lightweight-charts tooltip */
.lwc-tooltip {
  position: absolute;
  display: none;
  padding: 12px 16px;
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  z-index: 1000;
  font-family: 'Outfit', sans-serif;
  min-width: 180px;
}
.lwc-tooltip .tt-symbol {
  font-size: 13px;
  font-weight: 700;
  color: #f9fafb;
  margin-bottom: 6px;
}
.lwc-tooltip .tt-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  color: #cbd5e1;
  margin: 2px 0;
}
.lwc-tooltip .tt-change {
  font-size: 14px;
  font-weight: 800;
  margin-top: 6px;
}
.lwc-tooltip .tt-change.positive { color: #10b981; }
.lwc-tooltip .tt-change.negative { color: #ef4444; }
.lwc-tooltip .tt-date {
  font-size: 11px;
  color: #6b7280;
  margin-top: 4px;
}
```

### 5.5 File: `StockChartModal.jsx` — Removed Code

- `import { BarChart, Bar, XAxis, YAxis, ... } from 'recharts'` → `import { createChart, CandlestickSeries, AreaSeries, ... } from 'lightweight-charts'`
- `const [chartType, setChartType] = useState('area')` → removed
- Chart type switcher JSX block → removed
- `getExitDate()` → kept (used for marker calculation)
- `CustomTooltip` React component → replaced by DOM tooltip

---

## 6. Data Flow Diagram

```
┌──────────┐   click 7d/30d/90d    ┌────────────────┐
│ Dashboard │ ───────────────────→  │ StockChartModal │
│ (table)   │                       │                │
└──────────┘                        │ [skeleton]     │
                                    │                │
                                    │ fetch          │
                                    │ /api/prices/X  │
                                    │                │
                                    ▼                │
                              ┌──────────┐          │
                              │  Backend │          │
                              │ get_     │          │
                              │ ticker_  │          │
                              │ data()   │          │
                              │ (cache)  │          │
                              └────┬─────┘          │
                                   │                │
                          ┌────────┴────────┐       │
                          ▼                 ▼       │
                    data.length>0     data empty     │
                          │                 │        │
                          ▼                 ▼        │
                   CandlestickSeries   AreaSeries    │
                   + markers           + markers     │
                   + crosshair         + crosshair   │
                   + custom tooltip    + tooltip     │
                          │                 │        │
                          └──────┬──────────┘        │
                                 │                   │
                                 ▼                   │
                          chart.timeScale()          │
                          .fitContent()              │
                          ──────────────────────────→│
                                                    │
                                                    │
                         close modal → chart.remove()
```

---

## 7. Error Handling Matrix

| Scenario | Frontend Behavior | Backend Behavior |
|----------|------------------|------------------|
| Price data exists for range | Render candlestick + markers + tooltip | Return prices array |
| Price data exists but not in date range | Return empty `prices: []` → fallback area chart | Filter returns empty |
| Symbol not in cache at all | `prices: []` → fallback area chart | `get_ticker_data()` returns None |
| Network error (4xx/5xx) | Catch → fallback area chart | Log error, return 400/500 |
| Aborted (user closed/reopened) | Ignore response | Server sends response to no one (harmless) |
| User clicks same symbol twice | First in-flight promise reused via Map | Single request |
| Market holiday — no candle for exit date | Marker snaps to nearest existing candle | N/A (frontend logic) |

---

## 8. Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| Modal open → skeleton visible | <50ms | Time to first paint |
| Modal open → chart rendered | <300ms (cached) / <3s (cache miss) | Time to chart render |
| Bundle size delta | ≤ -50KB gzip (remove recharts +150KB, add lightweight-charts ~45KB, net saving ~105KB) | Bundle analyzer |
| Crosshair/tooltip FPS | 60fps | DevTools performance tab |
| Memory per chart instance | <5MB | Chrome task manager |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Exit date marker floats in whitespace (no candle at that date) | Medium | Snap marker times to nearest available trading day in price data |
| React 19 StrictMode double-mount creates duplicate chart | Low | Guard: `if (chartRef.current) return` |
| Race condition: fast open/close/reopen different symbol | Medium | `AbortController` + `currentSymbolRef` stale check |
| Backend OOM on concurrent price requests | Low | Requests served from diskcache (no yfinance calls); frontend dedup Map prevents concurrent duplicates |
| backdrop-filter unsupported | Low | Solid fallback background color |
| lightweight-charts v5 API breakage | Low | Pin to `^5.2.0` in package.json; reviewed docs during spec |

---

## 10. Implementation Order

1. `npm install lightweight-charts` + `npm uninstall recharts`
2. Backend: add `GET /api/prices/{symbol}` endpoint in `main.py`
3. Frontend: add `fetchSymbolPrices` helper in `api.js`
4. Frontend: rewrite `StockChartModal.jsx` with:
   a. Chart instantiation + StricMode guard
   b. Skeleton loading state
   c. Data fetching with AbortController
   d. Candlestick series + markers
   e. Area series fallback + markers
   f. Custom tooltip via subscribeCrosshairMove
   g. ResizeObserver
5. Frontend: add `.lwc-tooltip` and `.chart-skeleton` styles in `Dashboard.css`
6. Frontend: remove chart-type-switcher JSX
7. Test: verify candlestick rendering, marker placement, tooltip behavior
8. Test: verify fallback path (mock empty prices response)
9. Test: verify rapid open/close/reopen (race condition)
10. Run full regression: `pytest backend/tests/ -v --asyncio-mode=auto`

---

## 11. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Remove chart type switcher? | Yes — only candlestick |
| Lazy-fetch API or embed in trade results? | Lazy-fetch via `GET /api/prices/{symbol}` |
| Fallback when no data? | Yes — interpolated area chart with 4 markers |
| Volume bars? | No |
| Entry mode affects chart appearance? | No — entry marker reflects stored entry_price regardless of mode |
