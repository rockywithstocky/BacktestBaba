<!-- section-id: overview, version: 1, status: active -->

# Spec: Analyzer Panel Integration

## 1. Overview

Integrate the backtest analyzer (stock lookup, verified stats, tier planner, risk engine) into the Dashboard as a right slide-in panel instead of a full-page tab toggle. The Report view stays permanently visible. The panel is triggered two ways:

- **Header button** (`⊕` with tooltip "Open analyzer panel") — opens panel showing auto-populated fresh-stock list
- **Trade row hover icon** (`↗` with tooltip "Analyze this trade") — opens panel with that stock pre-selected

The panel is dismissable (✕ button, Escape key). It overlays the right 420px of the viewport with a backdrop.

<!-- section-id: requirements, version: 1, status: active -->

## 2. Requirements

### 2.1 Functional

| ID | Requirement | Verification |
|----|-------------|-------------|
| F1 | Header `⊕` opens panel in fresh-stock-list mode, auto-selects first stock | Visual check |
| F2 | Row hover `↗` opens panel with that stock pre-selected, shows its risk plan | Visual check |
| F3 | Panel closes via ✕ button or Escape key | Visual check |
| F4 | Panel has 3 sub-tabs: [Plan] [Stats] [Planner] | Visual check |
| F5 | Stock Lookup tab auto-populates stocks with `signal_date ≤ 30 days`, sorted most recent first | Test |
| F6 | Each stock row shows: symbol, signal count, last signal date, avg 14d return, tier fit badges | Visual check |
| F7 | 1-trade stocks appear with `⚠️ low confidence` badge, still show risk plan | Visual check |
| F8 | Risk Control Bar appears inside panel (not on Dashboard), updates per selected stock | Visual check |
| F9 | Trade row click (on return cells) still opens StockChartModal — unchanged | E2E |
| F10 | All 76 existing tests continue to pass | `npm test -- --run` |

### 2.2 Non-functional

| ID | Requirement |
|----|-------------|
| NF1 | Panel width: 420px fixed, no drag resize |
| NF2 | Panel background: `bg-gray-950/90 backdrop-blur-xl` |
| NF3 | Fresh stock list uses `bg-gray-900/50 hover:bg-gray-800/70` row styling |
| NF4 | Selected stock row uses `bg-emerald-500/10 border-l-2 border-emerald-500` |
| NF5 | No column added to trade table — `↗` sits inside Symbol cell on hover |
| NF6 | Tooltips on all icon-only buttons |

<!-- section-id: scope, version: 1, status: active -->

## 3. Scope

### 3.1 Files to create

| File | Purpose |
|------|---------|
| `frontend/src/analyzer/AnalyzerPanel.jsx` | New right slide-in panel wrapper, replaces BacktestAnalyzer.jsx |

### 3.2 Files to modify

| File | Change |
|------|--------|
| `frontend/src/components/Dashboard.jsx` | Remove `BacktestAnalyzer` import, `viewMode` toggle, `[Report] [Analyzer]` tab bar. Add panel state + triggers. Add `↗` hover icon in Symbol cell. Import `AnalyzerPanel`. |
| `frontend/src/analyzer/StockLookupPanel.jsx` | Add auto-populated fresh-stock list, auto-select first, search-as-filter mode. Accept new props: `freshStocks`, `selectedStock`, `onSymbolSelect`. |
| `frontend/src/analyzer/RiskControlBar.jsx` | Accept `selectedStock`/`entryPrice` props. Show stock info header (or default if none). |

### 3.3 Files to delete

| File | Reason |
|------|--------|
| `frontend/src/analyzer/BacktestAnalyzer.jsx` | No longer needed — replaced by AnalyzerPanel |

### 3.4 Files unchanged

| File | Reason |
|------|--------|
| `frontend/src/analyzer/riskEngine.js` | Pure functions, no UI — no change needed |
| `frontend/src/analyzer/analyzerUtils.js` | Add `getFreshStocks(trades)` helper only |
| `frontend/src/analyzer/VerifiedStatsPanel.jsx` | No change |
| `frontend/src/analyzer/TierPlannerPanel.jsx` | No change |
| `frontend/src/__tests__/test_risk_engine.test.js` | No change — 27 tests pass |
| `frontend/src/__tests__/test_analyzer_utils.test.js` | No change — 28 tests pass |
| `frontend/src/__tests__/test_latest_return.test.js` | No change — 9 tests pass |
| `frontend/src/__tests__/test_dashboard_columns.test.js` | No change — 5 tests pass |
| `frontend/src/test/Dashboard.test.jsx` | Update if test references removed toggle |

### 3.5 Nothing else in the frontend or backend changes

No backend files, no config files, no CSS files, no Docker files, no routing — zero surface area beyond the 6 files listed above.

<!-- section-id: design, version: 1, status: active -->

## 4. Design

### 4.1 Component tree

```
Dashboard
├── Header (back, title, capital input, save report ⊕)
├── Report content (summary cards, charts, stats table, trade log)
│   └── Trade table rows
│       └── Symbol cell → hover reveals ↗ icon
├── StockChartModal (on return-cell click — unchanged)
└── AnalyzerPanel (conditional, right slide-in)
    ├── Panel header (title + ✕ close)
    ├── RiskControlBar (compact, per selected stock)
    └── 3 sub-tabs: [Plan] [Stats] [Planner]
        ├── Plan tab → StockLookupPanel (fresh-stock list + risk plan card)
        ├── Stats tab → VerifiedStatsPanel
        └── Planner tab → TierPlannerPanel
```

### 4.2 State management (Dashboard.jsx)

```
panelOpen: boolean                 — show/hide panel
panelSymbol: string | null         — pre-selected symbol (null = fresh-stock mode)
selectedSymbol: string | null      — currently selected in StockLookup
entryPrice: number | null          — price for risk plan
```

### 4.3 Fresh stock computation

```typescript
const FRESH_CUTOFF_DAYS = 30;
function getFreshStocks(trades) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FRESH_CUTOFF_DAYS);
  return trades
    .filter(t => new Date(t.signal_date) >= cutoff)
    .reduce((acc, t) => {
      const sym = t.symbol;
      if (!acc[sym]) acc[sym] = { symbol: sym, trades: [], dates: [] };
      acc[sym].trades.push(t);
      acc[sym].dates.push(t.signal_date);
      return acc;
    }, {})
    .map((entry) => {
      entry.count = entry.trades.length;
      entry.lastDate = entry.dates.sort().pop();
      entry.avgReturn14d = entry.trades
        .filter(t => t.return_14d != null)
        .reduce((s, t) => s + t.return_14d, 0) / entry.trades.filter(t => t.return_14d != null).length || 0;
      return entry;
    })
    .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
}
```

### 4.4 Dual trigger flow

```
Header ⊕ click:
  1. setPanelSymbol(null)
  2. setPanelOpen(true)
  3. Panel mounts → StockLookupPanel auto-computes fresh stocks → auto-selects first

Trade row ↗ click:
  1. setPanelSymbol(symbol)
  2. setEntryPrice(trade.entry_price)
  3. setPanelOpen(true)
  4. Panel mounts → StockLookupPanel receives pre-selected symbol → show its risk plan
```

### 4.5 Glass panel styling

```css
/* Applied via Tailwind classes on the panel container */
bg-gray-950/90 backdrop-blur-xl border-l border-white/10
w-[420px] fixed right-0 top-0 h-full z-50
shadow-2xl shadow-black/50
```

<!-- section-id: verification, version: 1, status: active -->

## 5. Verification

### 5.1 Pre-implementation baseline

```
npm test -- --run  →  76 passing, 5 files
```

### 5.2 Post-implementation gate

```
npm test -- --run  →  76+ passing (0 regressions)
```

### 5.3 Manual verification

| Step | Expected |
|------|----------|
| Run backtest | Report renders as before |
| Click return cells | StockChartModal opens (unchanged) |
| Click header `⊕` | Panel slides in, fresh stocks listed |
| Click trade row `↗` | Panel slides in with that stock |
| Press Escape | Panel closes |
| Panel shows [Plan] [Stats] [Planner] tabs | All tabs render content |
| 1-trade stocks appear in fresh list | Low-confidence badge shown |

<!-- section-id: decisions, version: 1, status: active -->

## 6. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Slide-in panel over 4-tab | Report stays visible, analyzer is accessory not replacement |
| D2 | Dual trigger (header ⊕ + row ↗) | Discovery mode + targeted mode, no ambiguous gestures |
| D3 | `↗` in Symbol cell on hover | Zero column loss, no horizontal scroll |
| D4 | 420px fixed width | No over-engineering with drag handle |
| D5 | Risk bar inside panel | Only meaningful when a stock is selected |
| D6 | Auto-populate fresh stocks ≤30d | Zero typing required, meets user requirement |
