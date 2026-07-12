# SPEC: Enhanced StockChartModal — Candlestick + Hero Return + Stats Reorg

## Status: Implementation In Progress

---

## 1. Problem

When a user clicks a return cell (7d/30d/90d) in the trades table, the StockChartModal opens showing a Recharts SVG chart with only 4 abstract data points (Entry, Exit, Max High, Max Low). There is no real price history, no interactive crosshair, no meaningful tooltip, and no TradingView-like experience. The chart area feels sparse and unprofessional.

## 2. Goals

1. Add TradingView-style candlestick chart as a **4th option** in the existing chart type switcher (Area/Line/Bar remain untouched)
2. Fetch real daily OHLCV price data from a new backend endpoint when candlestick is selected
3. Lazy-import `lightweight-charts` (Canvas-based, 60fps, ~45KB gzip) only when user clicks "Candlestick"
4. Hero the return % as the primary visual element in the modal
5. Reorganize stats into 4 scannable cards (Entry, Exit, Peak, Trough)
6. Zero glitches: AbortController stale-response guard, ResizeObserver, StrictMode-safe lifecycle
7. Fall back to an interpolated area chart when OHLCV data is unavailable

## 3. Non-Goals

- **NOT** replacing Recharts or removing Area/Line/Bar chart types
- **NOT** adding volume bars (explicitly declined)
- **NOT** replacing the modal shell (header, legend, footer stay identical)
- **NOT** changing the backtest calculation logic or data pipeline
- **NOT** persisting price data across frontend sessions (in-memory only)

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
- Calls `get_ticker_data(symbol)` — returns DataFrame from diskcache (populated during bulk fetch)
- Filters rows to `[start, end]` inclusive
- Converts `datetime64[ns]` index → `YYYY-MM-DD` strings
- Rounds O/H/L/C to 2 decimal places
- Returns empty `"prices": []` if no data — frontend falls back to area chart
- Symbol suffix fallback: if `symbol.NS` fails, try `symbol.BO`
- No authentication required (same origin as existing endpoints)

### 4.2 No Model Changes

`SignalResult` and `BacktestReport` remain unchanged. Price data is fetched lazily, not embedded in trade results.

---

## 5. Frontend Changes

### 5.1 Dependencies

| Action | Package | Reason |
|--------|---------|--------|
| Install | `lightweight-charts` (^5.2.0) | Canvas-based financial charting library, lazy-loaded |

Recharts **stays** — Area/Line/Bar remain unchanged.

### 5.2 File: `StockChartModal.jsx` (Enhanced)

**State changes**:
```javascript
// Existing (unchanged)
// - stock, period, onClose (props)
// - chartType — now also accepts 'candlestick' (default remains 'area')

// New (added)
const chartContainerRef = useRef(null);
const chartRef = useRef(null);
const seriesRef = useRef(null);
const toolTipRef = useRef(null);
const currentSymbolRef = useRef(null);

const [ohlcvData, setOhlcvData] = useState(null);
const [candleLoading, setCandleLoading] = useState(false);
```

**Layout (top to bottom)**:
```
1. Header — symbol name, period, close button (unchanged)
2. Hero Return — large color-coded % display
3. Stats Grid — 4 cards: Entry / Exit / Peak / Trough
4. Chart Type Switcher — Area | Line | Bar | Candlestick (unchanged + 1)
5. Chart Container — Recharts OR lightweight-charts (mutually exclusive)
6. Legend — unchanged
7. Footer — signal info + fundamentals link (unchanged)
```

**Candlestick lifecycle**:
```
1. User clicks "Candlestick" in chart type switcher
2. setChartType('candlestick') → setCandleLoading(true)
3. useEffect fires for chartType === 'candlestick':
   a. dynamic import('lightweight-charts')  (cached after first load)
   b. If import fails → setCandleLoading(false), keep area chart
   c. Create chart instance on ref container (StrictMode guard)
   d. Set up ResizeObserver
   e. Create tooltip DOM element
   f. subscribeCrosshairMove → update tooltip
   g. Fetch GET /api/prices/{symbol}?start={entry}&end={exit}
      with AbortController + currentSymbolRef stale check
   h. On success → add CandlestickSeries + markers + reference lines
   i. On empty/error → fallback: show area chart with message
4. User switches back to Area/Line/Bar:
   a. chart.remove(), seriesRef = null
   b. Recharts renders instead
5. Modal unmounts → chart.remove(), observer.disconnect(), controller.abort()
```

**Markers** (used in both candlestick and fallback paths):

| Point | Shape | Position | Color | Text |
|-------|-------|----------|-------|------|
| Entry | `arrowUp` | `belowBar` | `#10b981` | `Entry ₹{price}` |
| Exit (positive) | `arrowUp` | `aboveBar` | `#10b981` | `Exit ₹{price}` |
| Exit (negative) | `arrowDown` | `belowBar` | `#ef4444` | `Exit ₹{price}` |
| Max High | `arrowDown` | `aboveBar` | `#8b5cf6` | `High ₹{price}` |
| Max Low | `arrowUp` | `belowBar` | `#f59e0b` | `Low ₹{price}` |

Marker times are **snapped to nearest trading day** in the price data to prevent floating in whitespace.

**Custom Tooltip** (via `subscribeCrosshairMove`):

```
┌──────────────────────┐
│ ASIANHOTNR.NS        │
│ O: 320.65  H: 402.55 │
│ L: 310.20  C: 360.45 │
│ +12.45% from entry    │
│ 17-10-2018           │
└──────────────────────┘
```

- Glass-morphism background: `rgba(15, 23, 42, 0.95)` + `backdrop-filter: blur(12px)`
- Tracking position: follows cursor with 15px offset, flips to left side when near right edge
- Hidden when cursor leaves chart bounds
- Created as a DOM element (not React) for performance

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
      style: LineStyle.Dashed, labelBackgroundColor: '#0f172a',
    },
    horzLine: {
      width: 1, color: 'rgba(255,255,255,0.2)',
      style: LineStyle.Dashed, labelBackgroundColor: '#0f172a',
    },
  },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
  timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
}
```

**Reference lines**: Horizontal dashed lines at entry price and exit price, drawn as LineSeries on the candlestick chart.

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
    setCandleLoading(false);
  });

return () => controller.abort();
```

**StrictMode guard**:
```javascript
useEffect(() => {
  if (chartRef.current) return; // already created
  chartRef.current = createChart(chartContainerRef.current, options);
  return () => {
    chartRef.current?.remove();
    chartRef.current = null;
  };
}, []);
```

**Dynamic import error boundary**:
```javascript
try {
  const { createChart, CandlestickSeries, AreaSeries, LineSeries } = await import('lightweight-charts');
} catch (err) {
  console.error('Failed to load lightweight-charts:', err);
  setCandleLoading(false);
  // stay on current chart type, user can use area/line/bar
  return;
}
```

**Hero Return section** (new):
```jsx
<div className="modal-hero-return">
  <span className={`hero-value ${isPositive ? 'positive' : 'negative'}`}>
    {isPositive ? '+' : ''}{returnValue?.toFixed(2)}%
  </span>
  <span className="hero-label">Return</span>
</div>
```

**Stats Grid** (restructured from flat row to 4 cards):
```jsx
<div className="modal-stats-grid">
  <div className="stat-card">
    <span className="stat-label">Entry</span>
    <span className="stat-price">₹{stock.entry_price?.toFixed(2)}</span>
    <span className="stat-date">{entryDateStr}</span>
  </div>
  <div className="stat-card">
    <span className="stat-label">Exit</span>
    <span className="stat-price">₹{stock[exitPriceKey]?.toFixed(2)}</span>
    <span className="stat-date">{exitDate}</span>
  </div>
  <div className="stat-card">
    <span className="stat-label">Peak</span>
    <span className="stat-price positive">₹{stock.max_high_90d?.toFixed(2)}</span>
    <span className="stat-date">{stock.max_high_date || 'N/A'}</span>
  </div>
  <div className="stat-card">
    <span className="stat-label">Trough</span>
    <span className="stat-price negative">₹{stock.max_low_90d?.toFixed(2)}</span>
    <span className="stat-date">{stock.max_low_date || 'N/A'}</span>
  </div>
</div>
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

Add:

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
  background: rgba(15, 23, 42, 0.95);
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

/* Hero Return */
.modal-hero-return {
  text-align: center;
  padding: 1.5rem 1.75rem 0.5rem;
}
.hero-value {
  font-family: 'Outfit', sans-serif;
  font-size: 2.5rem;
  font-weight: 800;
  display: block;
  line-height: 1;
}
.hero-value.positive { color: #10b981; }
.hero-value.negative { color: #ef4444; }
.hero-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-weight: 700;
  margin-top: 0.375rem;
  display: block;
}

/* Stats Grid (4 cards) */
.modal-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  padding: 1rem 1.75rem 1.25rem;
}
.stat-card {
  text-align: center;
  padding: 0.75rem;
  background: rgba(17, 24, 39, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.stat-card .stat-label {
  font-size: 0.6875rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  display: block;
  margin-bottom: 0.375rem;
}
.stat-card .stat-price {
  font-family: 'Outfit', sans-serif;
  font-size: 1.125rem;
  font-weight: 700;
  color: #f9fafb;
  display: block;
}
.stat-card .stat-price.positive { color: #10b981; }
.stat-card .stat-price.negative { color: #ef4444; }
.stat-card .stat-date {
  font-size: 0.6875rem;
  color: #6b7280;
  margin-top: 0.25rem;
  display: block;
}
```

### 5.5 Chart Type Switcher — Added Candlestick Button

New 4th button in the existing switcher:
```jsx
<button
  className={`chart-type-btn ${chartType === 'candlestick' ? 'active' : ''}`}
  onClick={() => setChartType('candlestick')}
>
  <CandlestickChart size={18} /> Candlestick
</button>
```

(Import `CandlestickChart` from `lucide-react`)

---

## 6. Data Flow Diagram

```
┌──────────┐   click 7d/30d/90d    ┌──────────────────────────┐
│ Dashboard │ ───────────────────→  │     StockChartModal       │
│ (table)   │                      │                          │
└──────────┘                      │ chartType='area' (default)│
                                   │ → Recharts Area/Line/Bar  │
                                   │   (unchanged)             │
                                   │                          │
                                   │ chartType='candlestick'   │
                                   │ → dynamic import('lw-charts')
                                   │ → fetch /api/prices/X     │
                                   │ → CandlestickSeries       │
                                   │ → crosshair + tooltip     │
                                   │ → markers + ref lines     │
                                   │ → switch back → remove()  │
                                   └──────────────────────────┘
                                              │
                                              ▼
                                       ┌──────────┐
                                       │  Backend  │
                                       │ get_      │
                                       │ ticker_   │
                                       │ data()    │
                                       │ (cache)   │
                                       └──────────┘
```

---

## 7. Error Handling Matrix

| Scenario | Frontend Behavior | Backend Behavior |
|----------|------------------|------------------|
| Price data exists for range | Render candlestick + markers + tooltip | Return prices array |
| Price data exists but not in date range | Return empty `prices: []` → fallback area chart | Filter returns empty |
| Symbol not in cache at all | `prices: []` → fallback area chart | `get_ticker_data()` returns None |
| Network error (4xx/5xx) | Catch → stay on current chart, console warn | Log error, return 400/500 |
| Aborted (user closed/reopened) | Ignore response | Server sends response to no one (harmless) |
| User switches between symbols fast | Stale response guard via currentSymbolRef | N/A |
| Market holiday — no candle for exit date | Marker snaps to nearest existing candle | N/A (frontend logic) |
| Dynamic import('lightweight-charts') fails | Try/catch → stay on area chart | N/A |

---

## 8. Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial bundle impact | **0 KB** (lazy-loaded) | Bundle analyzer |
| Candlestick toggle → chart rendered | <300ms (cached) / <3s (cache miss) | Time to chart render |
| Crosshair/tooltip FPS | 60fps | DevTools performance tab |
| Memory per chart instance | <5MB | Chrome task manager |
| Modal open → hero visible | <50ms | Time to first paint |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Exit date marker floats in whitespace (no candle at that date) | Medium | Snap marker times to nearest available trading day in price data |
| React 19 StrictMode double-mount creates duplicate chart | Low | Guard: `if (chartRef.current) return` |
| Race condition: fast open/close/reopen different symbol | Medium | AbortController + currentSymbolRef stale check |
| Candlestick chart not destroyed on switch away | Low | Explicit `chart.remove()` on toggle + modal close |
| Dynamic import of lightweight-charts fails | Low | Try/catch → fallback to area chart, console error |
| Symbol suffix missing (.NS/.BO) | Low | Backend tries both suffixes |
| backdrop-filter unsupported | Low | Solid fallback background color |
| lightweight-charts v5 API breakage | Low | Pin to ^5.2.0 in package.json |

---

## 10. Implementation Order

1. Backend: add `GET /api/prices/{symbol}` endpoint in `main.py`
2. Frontend: `npm install lightweight-charts`
3. Frontend: add `fetchSymbolPrices` helper in `api.js`
4. Frontend: enhance `StockChartModal.jsx`:
   a. Hero return section
   b. Stats grid (4 cards)
   c. Candlestick as 4th chart type with dynamic import
   d. Chart lifecycle with StrictMode guard
   e. Data fetching with AbortController
   f. Candlestick series + markers + reference lines
   g. Area series fallback + markers
   h. Custom tooltip via subscribeCrosshairMove
   i. Loading skeleton
   j. ResizeObserver
5. Frontend: add CSS classes in `Dashboard.css`
6. Test: verify Area/Line/Bar unchanged
7. Test: verify candlestick rendering, marker placement, tooltip behavior
8. Test: verify fallback path (mock empty prices response)
9. Test: verify rapid open/close/reopen (race condition)
10. Run full regression: `pytest backend/tests/ -v --asyncio-mode=auto`
11. Docker compose up + manual verification
