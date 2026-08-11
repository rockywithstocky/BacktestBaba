# Trade Lane Colors + Return Heatmap + Cap Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Trade Log a colored "trade lane" identity, move heat intensity into a new per-trade Return Heatmap card, and replace the low-value Market Cap chart with a Cap × Horizon matrix — one coherent heat color language.

**Architecture:** Pure helper functions (`getReturnClass`, `buildCapMatrix`) added to Dashboard.jsx with duplicated-in-test coverage per repo convention; three JSX/CSS regions in Dashboard.jsx/Dashboard.css. No backend changes, no data flow changes, no new dependencies.

**Tech Stack:** React 19, Tailwind v4 (custom CSS in `Dashboard.css`), Vitest (pure-function tests, jsdom), Vite 7.

## Global Constraints

- Frontend files only: `frontend/src/components/Dashboard.jsx`, `frontend/src/components/Dashboard.css`, `frontend/src/__tests__/test_latest_return.test.js`, new `frontend/src/__tests__/test_cap_matrix.test.js`
- **Never modify** `getColorClass` (Dashboard.jsx:195) or any stats-table usage (lines 476-489)
- Only 7d/30d/90d returns are populated per trade — 14/45/60d are dead fields, never referenced
- Heat scale: `HEAT_TIER_1 = 2`, `HEAT_TIER_2 = 5`, `HEAT_TIER_3 = 10`; classes `heat-pos-{1..4}`/`heat-neg-{1..4}`; alpha 0.12/0.25/0.40/0.50 via CSS custom props
- CSS rules: tints ONLY via `background-image` (never `background-color`), hover via `background-color` overlay, **never** `filter: brightness()` on sticky `th` (backdrop-filter compositing quirk)
- `th.col-*` rules MUST be placed after the existing `.trade-table th:hover` block (specificity tie at 0,2,1 — file order decides)
- Test convention: duplicate helper code inside test files (existing repo pattern — do not import from Dashboard.jsx)
- Verification gate for every task: `npm test -- --run` and `npm run build` must pass

---
## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/Dashboard.jsx` | `getReturnClass` + `buildCapMatrix` helpers, `capMatrix` useMemo, heatmap card JSX, matrix card JSX (replaces Market Cap card), `col-*` classes on trade table |
| `frontend/src/components/Dashboard.css` | Trade table identity (headers, underlines, tints, scoped text rules), heat tier classes (shared), heatmap + matrix card styles |
| `frontend/src/__tests__/test_latest_return.test.js` | `getReturnClass` tier-boundary tests (duplicated helper) |
| `frontend/src/__tests__/test_cap_matrix.test.js` | `buildCapMatrix` tests (duplicated helper) |

---

### Task 1: `getReturnClass` helper + tier-boundary tests

**Files:**
- Modify: `frontend/src/__tests__/test_latest_return.test.js`
- Modify: `frontend/src/components/Dashboard.jsx:195` (insert helper after `getColorClass`)

**Interfaces:**
- Produces: `getReturnClass(val)` → `'heat-pos-1'..'heat-pos-4'` | `'heat-neg-1'..'heat-neg-4'` | `'neutral'`. Thresholds on `|val|` (2/5/10). `null`/`undefined`/`NaN`/`0` → `'neutral'`. Used by Tasks 4 and 5.

- [ ] **Step 1: Add the failing tests** — append a new `describe` block to `frontend/src/__tests__/test_latest_return.test.js`:

```js
describe('getReturnClass Heat Tiers', () => {
    const HEAT_TIER_1 = 2;
    const HEAT_TIER_2 = 5;
    const HEAT_TIER_3 = 10;

    const getReturnClass = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return 'neutral';
        const sign = val > 0 ? 'pos' : 'neg';
        const abs = Math.abs(val);
        const tier = abs >= HEAT_TIER_3 ? 4 : abs >= HEAT_TIER_2 ? 3 : abs >= HEAT_TIER_1 ? 2 : 1;
        return `heat-${sign}-${tier}`;
    };

    it('maps positive tiers', () => {
        expect(getReturnClass(1.5)).toBe('heat-pos-1');
        expect(getReturnClass(2.0)).toBe('heat-pos-2');
        expect(getReturnClass(4.99)).toBe('heat-pos-2');
        expect(getReturnClass(5.0)).toBe('heat-pos-3');
        expect(getReturnClass(9.99)).toBe('heat-pos-3');
        expect(getReturnClass(10.0)).toBe('heat-pos-4');
        expect(getReturnClass(25)).toBe('heat-pos-4');
    });

    it('maps negative tiers as mirror image', () => {
        expect(getReturnClass(-1.5)).toBe('heat-neg-1');
        expect(getReturnClass(-2.0)).toBe('heat-neg-2');
        expect(getReturnClass(-4.99)).toBe('heat-neg-2');
        expect(getReturnClass(-5.0)).toBe('heat-neg-3');
        expect(getReturnClass(-10.0)).toBe('heat-neg-4');
        expect(getReturnClass(-25)).toBe('heat-neg-4');
    });

    it('handles zero-crossing tiny values', () => {
        expect(getReturnClass(0.001)).toBe('heat-pos-1');
        expect(getReturnClass(-0.001)).toBe('heat-neg-1');
    });

    it('returns neutral for zero, null, undefined, NaN', () => {
        expect(getReturnClass(0)).toBe('neutral');
        expect(getReturnClass(null)).toBe('neutral');
        expect(getReturnClass(undefined)).toBe('neutral');
        expect(getReturnClass(NaN)).toBe('neutral');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail (helper not in Dashboard yet, but this test is self-contained — it fails only if the duplicated logic is wrong)**

Run: `cd frontend; npx vitest run src/__tests__/test_latest_return.test.js`
Expected: the new describe block passes (self-contained), all 13 existing tests still pass.

- [ ] **Step 3: Add the real helper to Dashboard.jsx** — insert directly after `getColorClass` (line 195):

```js
    const HEAT_TIER_1 = 2;
    const HEAT_TIER_2 = 5;
    const HEAT_TIER_3 = 10;

    const getReturnClass = (val) => {
        if (val === null || val === undefined || isNaN(val) || val === 0) return 'neutral';
        const sign = val > 0 ? 'pos' : 'neg';
        const abs = Math.abs(val);
        const tier = abs >= HEAT_TIER_3 ? 4 : abs >= HEAT_TIER_2 ? 3 : abs >= HEAT_TIER_1 ? 2 : 1;
        return `heat-${sign}-${tier}`;
    };
```

- [ ] **Step 4: Run full test suite + build**

Run: `cd frontend; npm test -- --run; npm run build`
Expected: all tests pass; Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/__tests__/test_latest_return.test.js frontend/src/components/Dashboard.jsx
git commit -m "feat: add getReturnClass heat tier helper with boundary tests"
```

---

### Task 2: `buildCapMatrix` helper + tests

**Files:**
- Create: `frontend/src/__tests__/test_cap_matrix.test.js`
- Modify: `frontend/src/components/Dashboard.jsx` (insert helper above the `Dashboard` component's `return` — place next to `getReturnClass`)

**Interfaces:**
- Produces: `buildCapMatrix(trades)` → `[{ name, count, return_7d, return_30d, return_90d, winRate, avgWin, avgLoss, consistency }]`, filtered to `count >= 3`, sorted by `return_30d` desc (`null` sorts last). Used by Task 4.

- [ ] **Step 1: Write the failing tests** — create `frontend/src/__tests__/test_cap_matrix.test.js`:

```js
import { describe, it, expect } from 'vitest';

const buildCapMatrix = (trades) => {
    const buckets = {};
    trades.forEach(t => {
        const name = t.market_cap || 'Unknown';
        if (!buckets[name]) buckets[name] = [];
        buckets[name].push(t);
    });
    return Object.keys(buckets)
        .map(name => {
            const bucketTrades = buckets[name];
            const calc = (key) => {
                const vals = bucketTrades.map(t => t[key]).filter(v => v !== null && v !== undefined && !isNaN(v));
                return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
            };
            const avg30 = calc('return_30d');
            const r30 = bucketTrades.map(t => t.return_30d).filter(v => v !== null && v !== undefined && !isNaN(v));
            const winRate = r30.length === 0 ? null : (r30.filter(v => v > 0).length / r30.length) * 100;
            const wins = r30.filter(v => v > 0);
            const losses = r30.filter(v => v < 0);
            const avgWin = wins.length ? wins.reduce((s, v) => s + v, 0) / wins.length : null;
            const avgLoss = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : null;
            const std = r30.length > 1 ? Math.sqrt(r30.reduce((s, v) => s + (v - avg30) ** 2, 0) / r30.length) : 0;
            const consistency = std > 0 ? avg30 / std : (avg30 > 0 ? 999 : -999);
            return {
                name, count: bucketTrades.length,
                return_7d: calc('return_7d'),
                return_30d: avg30,
                return_90d: calc('return_90d'),
                winRate, avgWin, avgLoss, consistency
            };
        })
        .filter(b => b.count >= 3)
        .sort((a, b) => (b.return_30d ?? -Infinity) - (a.return_30d ?? -Infinity));
};

const makeTrade = (overrides) => ({
    symbol: 'TEST', market_cap: 'Largecap',
    return_7d: 2, return_30d: 4, return_90d: 6,
    ...overrides,
});

describe('buildCapMatrix', () => {
    it('groups trades by market cap and computes averages per horizon', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_7d: 1, return_30d: 2, return_90d: 3 }),
            makeTrade({ symbol: 'B', return_7d: 3, return_30d: 4, return_90d: 5 }),
            makeTrade({ symbol: 'C', return_7d: 5, return_30d: 6, return_90d: 7 }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Largecap');
        expect(result[0].count).toBe(3);
        expect(result[0].return_7d).toBe(3);
        expect(result[0].return_30d).toBe(4);
        expect(result[0].return_90d).toBe(5);
    });

    it('excludes buckets with fewer than 3 signals', () => {
        const result = buildCapMatrix([
            makeTrade({ market_cap: 'Smallcap' }),
            makeTrade({ market_cap: 'Smallcap' }),
            makeTrade({ market_cap: 'Midcap' }),
            makeTrade({ market_cap: 'Midcap' }),
            makeTrade({ market_cap: 'Midcap' }),
            makeTrade({ market_cap: 'Midcap' }),
        ]);
        expect(result.some(b => b.name === 'Smallcap')).toBe(false);
        expect(result.some(b => b.name === 'Midcap')).toBe(true);
    });

    it('skips null returns when averaging', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_7d: 10, return_30d: null }),
            makeTrade({ symbol: 'B', return_7d: 20, return_30d: null }),
            makeTrade({ symbol: 'C', return_7d: 30, return_30d: 12 }),
        ]);
        expect(result[0].return_7d).toBe(20);
        expect(result[0].return_30d).toBe(12);
    });

    it('computes win rate, avg win, avg loss from 30d returns', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_30d: 5 }),
            makeTrade({ symbol: 'B', return_30d: 3 }),
            makeTrade({ symbol: 'C', return_30d: -2 }),
        ]);
        expect(result[0].winRate).toBeCloseTo(66.67, 1);
        expect(result[0].avgWin).toBe(4);
        expect(result[0].avgLoss).toBe(-2);
    });

    it('sorts buckets by 30d average descending', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', market_cap: 'Largecap', return_30d: 2 }),
            makeTrade({ symbol: 'B', market_cap: 'Largecap', return_30d: 4 }),
            makeTrade({ symbol: 'C', market_cap: 'Largecap', return_30d: 3 }),
            makeTrade({ symbol: 'D', market_cap: 'Midcap', return_30d: 10 }),
            makeTrade({ symbol: 'E', market_cap: 'Midcap', return_30d: 12 }),
            makeTrade({ symbol: 'F', market_cap: 'Midcap', return_30d: 11 }),
        ]);
        expect(result[0].name).toBe('Midcap');
        expect(result[1].name).toBe('Largecap');
    });

    it('falls back to Unknown bucket for missing market_cap', () => {
        const result = buildCapMatrix([
            makeTrade({ market_cap: null }),
            makeTrade({ market_cap: undefined }),
            makeTrade({ symbol: 'C' }),
        ]);
        expect(result[0].name).toBe('Unknown');
        expect(result[0].count).toBe(3);
    });

    it('returns empty array for no trades', () => {
        expect(buildCapMatrix([])).toEqual([]);
    });

    it('consistency mirrors stats-table logic (999 when std is 0)', () => {
        const result = buildCapMatrix([
            makeTrade({ symbol: 'A', return_30d: 5 }),
            makeTrade({ symbol: 'B', return_30d: 5 }),
            makeTrade({ symbol: 'C', return_30d: 5 }),
        ]);
        expect(result[0].consistency).toBe(999);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend; npx vitest run src/__tests__/test_cap_matrix.test.js`
Expected: fails with "buildCapMatrix is not defined" (the test file's own copy actually passes — the point is to validate the test logic before adding the real helper; the file imports nothing from Dashboard.jsx yet).

- [ ] **Step 3: Add the real helper to Dashboard.jsx** — insert after `getReturnClass` (added in Task 1):

```js
    const buildCapMatrix = (trades) => {
        const buckets = {};
        trades.forEach(t => {
            const name = t.market_cap || 'Unknown';
            if (!buckets[name]) buckets[name] = [];
            buckets[name].push(t);
        });
        return Object.keys(buckets)
            .map(name => {
                const bucketTrades = buckets[name];
                const calc = (key) => {
                    const vals = bucketTrades.map(t => t[key]).filter(v => v !== null && v !== undefined && !isNaN(v));
                    return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
                };
                const avg30 = calc('return_30d');
                const r30 = bucketTrades.map(t => t.return_30d).filter(v => v !== null && v !== undefined && !isNaN(v));
                const winRate = r30.length === 0 ? null : (r30.filter(v => v > 0).length / r30.length) * 100;
                const wins = r30.filter(v => v > 0);
                const losses = r30.filter(v => v < 0);
                const avgWin = wins.length ? wins.reduce((s, v) => s + v, 0) / wins.length : null;
                const avgLoss = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : null;
                const std = r30.length > 1 ? Math.sqrt(r30.reduce((s, v) => s + (v - avg30) ** 2, 0) / r30.length) : 0;
                const consistency = std > 0 ? avg30 / std : (avg30 > 0 ? 999 : -999);
                return {
                    name, count: bucketTrades.length,
                    return_7d: calc('return_7d'),
                    return_30d: avg30,
                    return_90d: calc('return_90d'),
                    winRate, avgWin, avgLoss, consistency
                };
            })
            .filter(b => b.count >= 3)
            .sort((a, b) => (b.return_30d ?? -Infinity) - (a.return_30d ?? -Infinity));
    };
```

- [ ] **Step 4: Run the new test file to verify it passes**

Run: `cd frontend; npx vitest run src/__tests__/test_cap_matrix.test.js`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/__tests__/test_cap_matrix.test.js frontend/src/components/Dashboard.jsx
git commit -m "feat: add buildCapMatrix helper with tests"
```

---

### Task 3: Trade table "Trade Lane" identity (headers + tints + scoped text rules)

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx` (th/td className additions, lines 546-638)
- Modify: `frontend/src/components/Dashboard.css` (append block after line 713, the end of `.trade-table .clickable-cell:hover::after`)

**Interfaces:**
- Consumes: `getColorClass` (unchanged), existing `.clickable-cell` classes
- Produces: `col-*` classes on the 8 trade-table columns: `col-entry-date`, `col-entry`, `col-latest`, `col-return-7d`, `col-return-30d`, `col-return-90d`, `col-max-high`, `col-max-low`

- [ ] **Step 1: Add `col-*` classes to the `<th>` elements** (Dashboard.jsx lines 546-570). Add `className` to each — example for the first three:

```jsx
<th onClick={() => handleSort('entry_date')} className="col-entry-date">
    Entry Date {sortConfig.key === 'entry_date' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
</th>
<th onClick={() => handleSort('entry_price')} className="col-entry">
    Entry {sortConfig.key === 'entry_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
</th>
<th onClick={() => handleSort('latest_price')} className="col-latest">
    Latest Price {sortConfig.key === 'latest_price' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
</th>
```

Do the same for `col-return-7d` (line 556), `col-return-30d` (559), `col-return-90d` (562), `col-max-high` (565), `col-max-low` (568).

- [ ] **Step 2: Add `col-*` classes to the matching `<td>` elements** (lines 593-638). The cells KEEP their existing `getColorClass`/`clickable-cell`/`positive`/`negative` classes — only append the column class:

```jsx
<td className="col-entry-date">{getEntryDate(trade)}</td>
<td className="col-entry">
    {trade.entry_price && trade.symbol ? ( ...existing link JSX... ) : formatCurrency(trade.entry_price)}
</td>
<td className={`col-latest ${getColorClass(trade.latest_price_return)}`} title={...existing...}> ... </td>
<td className={`clickable-cell col-return-7d ${getColorClass(trade.return_7d)}`} onClick={...} title={...}> ... </td>
<td className={`clickable-cell col-return-30d ${getColorClass(trade.return_30d)}`} onClick={...} title={...}> ... </td>
<td className={`clickable-cell col-return-90d ${getColorClass(trade.return_90d)}`} onClick={...} title={...}> ... </td>
<td className="col-max-high positive" title={...}> ... </td>
<td className="col-max-low negative" title={...}> ... </td>
```

- [ ] **Step 3: Add the CSS block** — append to `frontend/src/components/Dashboard.css` AFTER line 713 (must come after the `.trade-table th:hover` block at line 668 — specificity tie, file order decides):

```css
/* ===============================================
   Trade Lane — Column Identity (Entry → Max Low)
   =============================================== */

/* Newly-styled value text (previously unstyled in this table) */
.trade-table .positive { color: #34d399; font-weight: 600; }
.trade-table .negative { color: #f87171; font-weight: 600; }
.trade-table .neutral { color: #9ca3af; }

/* Colored header labels + solid underlines */
.trade-table th.col-entry-date { color: #818cf8; box-shadow: inset 0 -2px 0 #818cf8; }
.trade-table th.col-entry { color: #38bdf8; box-shadow: inset 0 -2px 0 #38bdf8; }
.trade-table th.col-latest { color: #22d3ee; box-shadow: inset 0 -2px 0 #22d3ee; }
.trade-table th.col-max-high { color: #10b981; box-shadow: inset 0 -2px 0 #10b981; }
.trade-table th.col-max-low { color: #f43f5e; box-shadow: inset 0 -2px 0 #f43f5e; }

/* Return headers: green→red split gradient underline (pseudo-element, box-shadow is solid-only) */
.trade-table th.col-return-7d,
.trade-table th.col-return-30d,
.trade-table th.col-return-90d { position: relative; }
.trade-table th.col-return-7d::after,
.trade-table th.col-return-30d::after,
.trade-table th.col-return-90d::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: linear-gradient(90deg, #10b981, #ef4444);
}

/* Header hover — pinned: brighter glass + underline glow. NO filter (backdrop-filter quirk). */
.trade-table th.col-entry-date:hover { background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 -2px 0 #818cf8, 0 0 12px rgba(129, 140, 248, 0.35); }
.trade-table th.col-entry:hover { background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 -2px 0 #38bdf8, 0 0 12px rgba(56, 189, 248, 0.35); }
.trade-table th.col-latest:hover { background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 -2px 0 #22d3ee, 0 0 12px rgba(34, 211, 238, 0.35); }
.trade-table th.col-return-7d:hover,
.trade-table th.col-return-30d:hover,
.trade-table th.col-return-90d:hover { background: rgba(255, 255, 255, 0.08); }
.trade-table th.col-max-high:hover { background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 -2px 0 #10b981, 0 0 12px rgba(16, 185, 129, 0.35); }
.trade-table th.col-max-low:hover { background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 -2px 0 #f43f5e, 0 0 12px rgba(244, 63, 94, 0.35); }

/* Subtle cell tints via background-image (hover background-color layers beneath) */
.trade-table td.col-entry { background-image: linear-gradient(rgba(56, 189, 248, 0.08), rgba(56, 189, 248, 0.08)); color: #7dd3fc; }
.trade-table td.col-max-high { background-image: linear-gradient(rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.08)); }
.trade-table td.col-max-low { background-image: linear-gradient(rgba(244, 63, 94, 0.08), rgba(244, 63, 94, 0.08)); }

/* Row hover overlay (renders UNDER background-image tints) */
.trade-table tbody tr:hover td { background-color: rgba(255, 255, 255, 0.05); }
```

- [ ] **Step 4: Verify build + tests**

Run: `cd frontend; npm test -- --run; npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.jsx frontend/src/components/Dashboard.css
git commit -m "feat: trade lane column identity - colored headers, underlines, subtle tints"
```

---

### Task 4: Cap × Horizon Matrix card (replaces Market Cap chart)

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx` — remove `capMap` aggregation from `enrichmentStats` useMemo (lines 98-127), add `capMatrix` useMemo, replace the Market Cap chart-card JSX (lines 421-444)
- Modify: `frontend/src/components/Dashboard.css` — matrix styles

**Interfaces:**
- Consumes: `buildCapMatrix` (Task 2), `getReturnClass` (Task 1), `formatPercent` (line 193)
- Produces: `capMatrix` useMemo; JSX card with class `chart-card`, table `cap-matrix heat-table`

- [ ] **Step 1: Remove the dead `capMap` aggregation** — in the `enrichmentStats` useMemo (Dashboard.jsx:96-127), delete the `capMap` initialization, the `capMap[...]` lines, and remove `marketCaps: formatAgg(capMap)` from the return object. Keep the sector logic and `formatAgg` intact.

- [ ] **Step 2: Add the `capMatrix` useMemo** — insert after the `enrichmentStats` useMemo (after line 127):

```js
    const capMatrix = useMemo(() => buildCapMatrix(successfulTrades), [successfulTrades]);
```

- [ ] **Step 3: Replace the Market Cap chart-card JSX** — replace lines 421-444 (the third `<div className="chart-card">` block) with:

```jsx
<div className="chart-card">
    <h3 className="section-title">Strategy Edge by Market Cap (1 Month)</h3>
    <p className="text-xs text-gray-400 mb-4">Avg return by cap bucket across horizons. Min. 3 signals.</p>
    {capMatrix.length > 0 ? (
        <div className="cap-matrix-scroll">
            <table className="cap-matrix heat-table">
                <thead>
                    <tr>
                        <th>Bucket</th>
                        <th>1W</th>
                        <th>1M</th>
                        <th>3M</th>
                    </tr>
                </thead>
                <tbody>
                    {capMatrix.map(b => (
                        <tr key={b.name}>
                            <td className="cap-matrix-bucket">{b.name} <span className="cap-matrix-count">(N={b.count})</span></td>
                            <td className={b.return_7d == null ? 'cap-matrix-na' : getReturnClass(b.return_7d)}
                                title={b.return_7d == null ? 'No data' : `Avg 1W: ${formatPercent(b.return_7d)} (N=${b.count})`}>
                                {b.return_7d == null ? '—' : formatPercent(b.return_7d)}
                            </td>
                            <td className={b.return_30d == null ? 'cap-matrix-na' : getReturnClass(b.return_30d)}
                                title={b.return_30d == null ? 'No data'
                                    : `N: ${b.count} · Win rate: ${b.winRate == null ? 'N/A' : b.winRate.toFixed(0) + '%'} · Avg win: ${b.avgWin == null ? 'N/A' : formatPercent(b.avgWin)} · Avg loss: ${b.avgLoss == null ? 'N/A' : formatPercent(b.avgLoss)} · Consistency: ${b.consistency === 999 ? 'MAX' : b.consistency === -999 ? 'MIN' : b.consistency.toFixed(2)}`}>
                                {b.return_30d == null ? '—' : formatPercent(b.return_30d)}
                            </td>
                            <td className={b.return_90d == null ? 'cap-matrix-na' : getReturnClass(b.return_90d)}
                                title={b.return_90d == null ? 'No data' : `Avg 3M: ${formatPercent(b.return_90d)} (N=${b.count})`}>
                                {b.return_90d == null ? '—' : formatPercent(b.return_90d)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    ) : (
        <div className="flex h-48 items-center justify-center text-gray-500">Not enough market cap data available.</div>
    )}
</div>
```

- [ ] **Step 4: Add the CSS** — append to `frontend/src/components/Dashboard.css` (after the Task 3 block; heat tier rules are added in Task 5, so this task's cells rely on `.cap-matrix-na` + structure only):

```css
/* ===============================================
   Cap × Horizon Matrix
   =============================================== */
.cap-matrix-scroll { max-height: 400px; overflow-y: auto; }

.cap-matrix { width: 100%; border-collapse: collapse; }
.cap-matrix th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: rgba(17, 24, 39, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #9ca3af;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.6rem 0.75rem;
    text-align: left;
}
.cap-matrix td {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    text-align: left;
    white-space: nowrap;
}
.cap-matrix .cap-matrix-bucket { font-weight: 600; color: #e5e7eb; }
.cap-matrix .cap-matrix-count { color: #6b7280; font-weight: 400; font-size: 0.75rem; }
.cap-matrix .cap-matrix-na { color: #6b7280; }
.cap-matrix tbody tr:hover td { background-color: rgba(255, 255, 255, 0.05); }
```

- [ ] **Step 5: Verify build + tests**

Run: `cd frontend; npm test -- --run; npm run build`
Expected: all tests pass; build succeeds (no unused-variable lint errors — `capMap` removal must be complete).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Dashboard.jsx frontend/src/components/Dashboard.css
git commit -m "feat: replace market cap chart with cap x horizon heat matrix"
```

---

### Task 5: Return Heatmap card (4th chart-grid slot)

**Files:**
- Modify: `frontend/src/components/Dashboard.jsx` — insert new chart-card after the matrix card (after the block from Task 4, i.e. before line 445 `</div>` closing `charts-grid`)
- Modify: `frontend/src/components/Dashboard.css` — heatmap styles + shared heat tier rules

**Interfaces:**
- Consumes: `sortedTrades` (line 166 — already search-filtered + sorted by `sortConfig`), `getReturnClass` (Task 1), `handleCellClick(trade, '7d'|'30d'|'90d')` (line 218), `formatPercent` (line 193)
- Produces: chart-card with `heatmap-scroll` container, `heatmap-table heat-table` table

- [ ] **Step 1: Add the heatmap card JSX** — insert directly after the Task 4 matrix card `</div>` and before the closing `</div>` of `charts-grid` (line 445):

```jsx
<div className="chart-card">
    <h3 className="section-title">Return Heatmap</h3>
    <p className="text-xs text-gray-400 mb-4">Darker = stronger move. Click a horizon cell for the chart. ({sortedTrades.length} trades)</p>
    {sortedTrades.length > 0 ? (
        <div className="heatmap-scroll">
            <table className="heatmap-table heat-table">
                <thead>
                    <tr>
                        <th className="heatmap-symbol">Symbol</th>
                        <th>Latest</th>
                        <th>1W</th>
                        <th>1M</th>
                        <th>3M</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedTrades.map((trade, idx) => (
                        <tr key={idx}>
                            <td className="heatmap-symbol">{trade.symbol}</td>
                            <td className={getReturnClass(trade.latest_price_return)}
                                title={trade.latest_price_date ? `Return: ${formatPercent(trade.latest_price_return)} (since ${trade.latest_price_date})` : 'Return: N/A'}>
                                {formatPercent(trade.latest_price_return)}
                            </td>
                            <td className={`heat-click ${getReturnClass(trade.return_7d)}`}
                                onClick={() => handleCellClick(trade, '7d')}
                                title={`${trade.symbol} · 1W: ${formatPercent(trade.return_7d)}`}>
                                {formatPercent(trade.return_7d)}
                            </td>
                            <td className={`heat-click ${getReturnClass(trade.return_30d)}`}
                                onClick={() => handleCellClick(trade, '30d')}
                                title={`${trade.symbol} · 1M: ${formatPercent(trade.return_30d)}`}>
                                {formatPercent(trade.return_30d)}
                            </td>
                            <td className={`heat-click ${getReturnClass(trade.return_90d)}`}
                                onClick={() => handleCellClick(trade, '90d')}
                                title={`${trade.symbol} · 3M: ${formatPercent(trade.return_90d)}`}>
                                {formatPercent(trade.return_90d)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    ) : (
        <div className="flex h-48 items-center justify-center text-gray-500">No trade data available.</div>
    )}
</div>
```

- [ ] **Step 2: Add the CSS** — append to `frontend/src/components/Dashboard.css` (after the Task 4 block). This also adds the **shared heat tier rules** used by both the heatmap and the matrix (both tables carry the `heat-table` class):

```css
/* ===============================================
   Return Heatmap + shared Heat Tier rules
   =============================================== */
.heatmap-scroll { max-height: 400px; overflow-y: auto; }

.heatmap-table { width: 100%; border-collapse: collapse; }
.heatmap-table th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: rgba(17, 24, 39, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #9ca3af;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.6rem 0.75rem;
    text-align: left;
}
.heatmap-table td {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    text-align: left;
    white-space: nowrap;
    transition: all 0.2s;
}
.heatmap-table .heatmap-symbol { font-weight: 600; color: #e5e7eb; }
.heatmap-table .heat-click { cursor: pointer; }
.heatmap-table .heat-click:hover { transform: scale(1.06); font-weight: 800; }
.heatmap-table tbody tr:hover td { background-color: rgba(255, 255, 255, 0.05); }

/* Shared 4-tier heat scale — scoped to .heat-table (heatmap + cap matrix) */
.heat-table {
    --heat-a1: 0.12;
    --heat-a2: 0.25;
    --heat-a3: 0.40;
    --heat-a4: 0.50;
    --heat-pos: 16, 185, 129;
    --heat-neg: 239, 68, 68;
}
.heat-table td.heat-pos-1 { background-image: linear-gradient(rgba(var(--heat-pos), var(--heat-a1)), rgba(var(--heat-pos), var(--heat-a1))); color: #10b981; }
.heat-table td.heat-pos-2 { background-image: linear-gradient(rgba(var(--heat-pos), var(--heat-a2)), rgba(var(--heat-pos), var(--heat-a2))); color: #34d399; }
.heat-table td.heat-pos-3 { background-image: linear-gradient(rgba(var(--heat-pos), var(--heat-a3)), rgba(var(--heat-pos), var(--heat-a3))); color: #6ee7b7; }
.heat-table td.heat-pos-4 { background-image: linear-gradient(rgba(var(--heat-pos), var(--heat-a4)), rgba(var(--heat-pos), var(--heat-a4))); color: #a7f3d0; }
.heat-table td.heat-neg-1 { background-image: linear-gradient(rgba(var(--heat-neg), var(--heat-a1)), rgba(var(--heat-neg), var(--heat-a1))); color: #ef4444; }
.heat-table td.heat-neg-2 { background-image: linear-gradient(rgba(var(--heat-neg), var(--heat-a2)), rgba(var(--heat-neg), var(--heat-a2))); color: #f87171; }
.heat-table td.heat-neg-3 { background-image: linear-gradient(rgba(var(--heat-neg), var(--heat-a3)), rgba(var(--heat-neg), var(--heat-a3))); color: #fca5a5; }
.heat-table td.heat-neg-4 { background-image: linear-gradient(rgba(var(--heat-neg), var(--heat-a4)), rgba(var(--heat-neg), var(--heat-a4))); color: #fecaca; }
.heat-table td.neutral { color: #9ca3af; }
```

- [ ] **Step 3: Verify build + tests**

Run: `cd frontend; npm test -- --run; npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Dashboard.jsx frontend/src/components/Dashboard.css
git commit -m "feat: per-trade return heatmap card with shared 4-tier heat scale"
```

---

### Task 6: Full verification + Docker rebuild

**Files:**
- None (verification only; add AGENTS.md note only if a gap is found)

- [ ] **Step 1: Run the complete verification gate**

Run: `cd frontend; npm test -- --run`
Expected: ALL suites pass (existing 6 files + new `test_cap_matrix.test.js` + extended `test_latest_return.test.js`).

Run: `cd frontend; npm run build`
Expected: Vite build succeeds with no errors.

Run: `cd frontend; npm run lint`
Expected: eslint passes — watch specifically for unused `capMap` variables (Task 4 removal must be complete) and unused imports.

- [ ] **Step 2: Rebuild the Docker frontend image** (multi-stage Dockerfile, NO source volume mount — restart is insufficient)

Run: `docker compose up -d --build frontend`
Expected: image rebuilds; app at http://localhost:5174 shows the new cards.

- [ ] **Step 3: Manual visual checklist** (in browser)
- [ ] First 3 columns (Symbol/Signal Date/Close) remain gray
- [ ] Colored headers: indigo Entry Date, sky Entry, cyan Latest, gradient underline on 1W/1M/3M, emerald Max High, rose Max Low
- [ ] Header hover shows glass brighten + glow (no color flash from base `th:hover`)
- [ ] Entry cells: sky tint + sky price; link still opens screener.in
- [ ] Return cells: colored text only (green/red/gray), NO heat backgrounds
- [ ] Max High/Low: subtle tint + green/red text
- [ ] Row hover highlights full row; row-best/worst left borders still visible
- [ ] Heatmap card: 4 heat tiers visible, Latest column neutral on null, click 1W/1M/3M opens StockChartModal, scroll works at 100+ trades, header sticky within scroll
- [ ] Matrix card: buckets sorted by 1M desc, `(N=x)` counts, tooltips show win rate/avg win/avg loss/consistency on 1M cell, fallback message when <3 signals
- [ ] Sort arrows change color with header; sorting the table re-sorts the heatmap rows in sync
- [ ] Stats table colors unchanged

- [ ] **Step 4: Final commit** (if AGENTS.md gap was found — e.g., a reminder that frontend changes require `--build`; otherwise nothing to commit)

```bash
git status
```

---

## Self-Review Notes

- Spec coverage: Trade Lane identity → Task 3; Return Heatmap → Task 5; Cap Matrix → Task 4; heat scale → Tasks 1+5; tests → Tasks 1+2; verification → Task 6. All spec requirements mapped.
- Type consistency: `getReturnClass` returns `heat-pos-{1..4}`/`heat-neg-{1..4}`/`neutral` — used identically in Tasks 4 and 5. `buildCapMatrix` field names (`name, count, return_7d, return_30d, return_90d, winRate, avgWin, avgLoss, consistency`) match Task 4 JSX reads exactly.
- Placeholder scan: every step contains concrete code. No TBDs.
- Task boundaries: each task is independently testable (helpers tested via duplicated logic; JSX tasks via build + lint + manual gate).
