# Design: Trade Lane Column Colors + Return Heatmap + Cap × Horizon Matrix

**Date:** 2026-08-03 (v3.3 — user-approved; v3.2 + post-build polish)
**Branch:** `feature/trade-lane-column-colors`
**Scope:** Frontend only — `frontend/src/components/Dashboard.jsx`, `frontend/src/components/Dashboard.css`, `frontend/src/__tests__/test_latest_return.test.js`, `frontend/src/__tests__/test_dashboard_columns.test.js` (or new `test_cap_matrix.test.js`)

## v3.3 Changes (user-directed, after v3.2 shipped)

1. **Cap matrix bucket normalization** — `market_cap` arrives as raw CSV text (`"Midcap"`, `"MID CAP"`, `"mid-cap"`) or yfinance ₹ numbers (`"2483000000000"`), causing duplicate-looking buckets and numeric buckets vanishing under the N≥3 filter. New `normalizeCapLabel()` + `parseCapNumber()` helpers canonicalize to `Largecap`/`Midcap`/`Smallcap`/`Microcap`/`Unknown` (₹ thresholds: ≥₹20k Cr Large, ≥₹2k Cr Mid, ≥₹250 Cr Small, else Micro). Duplicate spellings merge into one bucket.
2. **Layman tooltips** — ℹ️ title on both new card headers, `title` on each `<th>`, and per-cell tooltips now lead with a plain sentence ("How Midcap signals did in 1 month: avg +2.10% (17 signals)") before the stats.
3. **Return Heatmap decoupled from Trade Log sort** — v3.2 mirrored the table `sortConfig`; v3.3 sorts by `signal_date` **descending** (newest first, nulls last, tie → symbol asc) via `sortHeatmapRows()`, and adds a **Signal Date** column.
4. **150-row cap** — `sortHeatmapRows` slices to 150 newest rows (search-filtered). Subtitle shows "Showing latest N of M signals". This is the Trade Log sort-performance fix: the unbounded heatmap was re-rendering thousands of DOM rows synchronously on every table sort.

## Problem

1. The Trade Log table (11 columns) is monochrome apart from scoped classes that are actually **unstyled** in this table (all `.positive`/`.negative` rules are scoped to `.stats-table`, `.hero-badge`, etc.). Users scan rows to find winners/losers, but nothing visually separates the trade lifecycle or emphasizes return magnitude.
2. The "Strategy Edge by Market Cap (1 Month)" chart card shows a single number per bucket (avg 1M return) — no horizon behavior, no trust signals. Low value.
3. The charts-grid (auto-fit, 3 cards) leaves a gap slot after the Market Cap card.

## Goal

A coordinated, one-color-language upgrade:
- **(a)** Trade Log columns from Entry Date → Max Low get identity via colored sticky headers + subtle tints; return cells get **newly-styled** green/red text.
- **(b)** A new **Return Heatmap** card (per-trade, 4 columns) fills the grid gap and becomes the home of the heat scale.
- **(c)** The Market Cap card is **replaced** by a **Cap × Horizon Matrix** — avg return per cap bucket per horizon (1W/1M/3M) using the same heat scale, with trust signals (N, win rate, avg win/loss, consistency) in the tooltip.

## Layout After Change

```
charts-grid (2×2 on wide screens):
[Return Distribution]  [Edge by Sector]
[★ Cap × Horizon Matrix][★ Return Heatmap]
stats-table-card: Return Statistics & Capital Analysis (unchanged)
trade-log-card: Trade Log — identity headers + text colors, NO heat backgrounds
```

## 1. Trade Log — Hybrid "Trade Lane" identity

| Column | Header (identity) | Cell treatment |
|---|---|---|
| Symbol / Signal Date / Close | Unchanged (gray) | Unchanged |
| Entry Date | Indigo label `#818cf8` + 2px underline | Monochrome (quiet) |
| Entry | Sky label `#38bdf8` + underline | Subtle tint `rgba(56,189,248,0.08)` + `color: #7dd3fc` on the cell (link inherits) |
| Latest Price | Cyan label `#22d3ee` + underline | **Colored text only** from `getColorClass(latest_price_return)` |
| 1 Week / 1 Month / 3 Month Return | Label + green→red split-gradient underline (via `::after` pseudo-element — box-shadow is solid-only) | **Colored text only** from `getColorClass(...)` — no heat backgrounds in the table |
| Max High | Emerald label `#10b981` + underline | Subtle tint `rgba(16,185,129,0.08)` + `#34d399` text |
| Max Low | Rose label `#f43f5e` + underline | Subtle tint `rgba(244,63,94,0.08)` + `#f87171` text |
| 0 / null / NaN return | — | `neutral` gray `#9ca3af` |

**Key rules:**
- `getColorClass` stays as-is (returns `positive`/`negative`/`neutral`).
- **New scoped text rules** (the existing classes are unstyled in this table — C1 fix): `.trade-table .positive { color: #34d399; }`, `.trade-table .negative { color: #f87171; }`, `.trade-table .neutral { color: #9ca3af; }`. Scoped so stats table / modal are unaffected.
- Solid underlines via `box-shadow: inset 0 -2px 0 <hue>` (solid-only).
- Return header gradient underline: `th.col-return-*::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, #10b981, #ef4444); }`. Do NOT paint the `th` background itself.
- Header hover pinned (C3): `th.col-*:hover { background: rgba(255,255,255,0.08); box-shadow: inset 0 -2px 0 <hue>, 0 0 12px rgba(<hue>, 0.35); }` — placed **after** base `.trade-table th:hover` (specificity tie, 0,2,1). NO `filter: brightness()` (backdrop-filter compositing quirk on sticky `th`).
- Cell tints (Entry, Max High, Max Low) via `background-image: linear-gradient(rgba(hue, 0.08), rgba(hue, 0.08))` — NOT `background-color` — so the hover overlay layers on top.
- Row hover: `tbody tr:hover td { background-color: rgba(255,255,255,0.05); }` (background-color renders under background-image).

## 2. NEW — Return Heatmap card (4th chart-grid slot)

| Aspect | Design |
|---|---|
| Title | "Return Heatmap" + legend line "Darker = stronger move" |
| Rows | `sortedTrades` (same `sortConfig` as the Trade Log — premortem FM1: table is sorted+paginated; heatmap shows the full sorted set, no pagination) |
| Columns | Latest / 1W / 1M / 3M (all populated per trade; 14/45/60d are dead fields — excluded) |
| Cell | `getReturnClass(value)` — 4-tier green/red heat (below). Latest column: heat on `latest_price_return`, **not clickable** |
| Click 1W/1M/3M cell | Opens StockChartModal via existing `handleCellClick(trade, '7d'|'30d'|'90d')` |
| Tooltip | Native `title`: `SYMBOL · 1M: +12.04%` (pattern: `\`${symbol} · ${horizonLabel}: ${formatPercent(v)}\``) |
| Scroll | `.heatmap-scroll { max-height: 400px; overflow-y: auto; }` — NO sticky-left column (premortem FM2: 500 sticky tds = scroll jank) |
| Header | Same solid-glass background treatment as the trade table header |
| Hover | Identical `tbody tr:hover td` rule as trade table (FM5) |
| Empty state | `successfulTrades.length === 0` → "No trade data available" (FM9) |
| Rows | `key={idx}` per repo convention |

## 3. REPLACE — "Strategy Edge by Market Cap" → Cap × Horizon Matrix

| Aspect | Design |
|---|---|
| Title | "Strategy Edge by Market Cap" (keep title; subtitle: "Avg return by cap bucket across horizons. Min 3 signals.") |
| Structure | Rows = cap buckets (≥3 signals, sorted by 1M avg desc), columns = 1W / 1M / 3M |
| Cell | Avg return % with `getReturnClass()` — same 4-tier heat scale |
| Row label | Bucket name + `(N=12)` |
| Tooltip (`title`) | `N: 12 · Win rate: 67% · Avg win: +6.2% · Avg loss: -2.1% · Consistency: 1.8` |
| Computation | Extracted pure helper `buildCapMatrix(trades)` (unit-testable) |
| Fallback | Keep existing "Not enough market cap data available." when <1 bucket qualifies |

`buildCapMatrix(trades)` spec:
- Group `successfulTrades` by `trade.market_cap || 'Unknown'`.
- Per bucket per horizon `h ∈ {7d, 30d, 90d}`: average of non-null `return_${h}`.
- Bucket qualifies if `count >= 3`; compute win rate (share of non-null 30d returns > 0), avg win / avg loss (30d), consistency (mean/std of 30d returns, `999`/`-999` when std = 0 — mirror the stats-table logic).
- Sort by 30d avg descending.

## Heat Scale (shared: heatmap + matrix + future)

`getReturnClass(val)` — new helper in Dashboard.jsx (replaces nothing; `getColorClass` untouched):

| Tier | Condition (on `|v|`) | Class | Bg alpha | Text color |
|---|---|---|---|---|
| 0 | null / undefined / NaN / 0 | `neutral` | none | `#9ca3af` |
| 1 | `< 2%` | `heat-pos-1` / `heat-neg-1` | 0.12 | `#10b981` / `#ef4444` |
| 2 | `2% ≤ < 5%` | `heat-pos-2` / `heat-neg-2` | 0.25 | `#34d399` / `#f87171` |
| 3 | `5% ≤ < 10%` | `heat-pos-3` / `heat-neg-3` | 0.40 | `#6ee7b7` / `#fca5a5` |
| 4 | `≥ 10%` | `heat-pos-4` / `heat-neg-4` | 0.50 | `#a7f3d0` / `#fecaca` |

- Thresholds as named JS constants: `HEAT_TIER_1 = 2`, `HEAT_TIER_2 = 5`, `HEAT_TIER_3 = 10`. Alphas as CSS custom properties on the heatmap/matrix card scope.
- Tints via `background-image: linear-gradient(rgba(hue, var(--heat-aN)), ...)`.
- **Calibration note (v1.1, not v1):** if <5% of cells land in tier 4 on real data, switch to percentile-based thresholds. Fixed tiers ship first.

## Tests

1. `test_latest_return.test.js` — add duplicated `getReturnClass` (repo convention) with:
   - positive tiers: 1.5→`heat-pos-1`, 2.0→`heat-pos-2`, 4.99→`heat-pos-2`, 5.0→`heat-pos-3`, 9.99→`heat-pos-3`, 10.0→`heat-pos-4`, 25→`heat-pos-4`
   - negative mirror: -1.5→`heat-neg-1`, -2.0→`heat-neg-2`, -10.0→`heat-neg-4`
   - zero-crossing: 0.001→`heat-pos-1`, -0.001→`heat-neg-1`
   - 0/null/undefined/NaN → `neutral`
2. `buildCapMatrix` — new tests (in `test_dashboard_columns.test.js` or new `test_cap_matrix.test.js`): bucket grouping, ≥3 filter, win rate, avg win/loss, consistency, sorting, null-return handling, 'Unknown' bucket.

## Explicitly Out of Scope

- Stats table (`getColorClass` usages at Dashboard.jsx:476-489) — untouched
- StockChartModal / UploadCard / hero badges / risk rows — untouched
- Backend, API, WebSocket, persistence — untouched (14/45/60d stay dead)
- Column order — unchanged
- `getColorClass` refactor — kept as-is
- Percentile heat scaling — v1.1

## Verification

1. `cd frontend; npm test -- --run` — all tests pass incl. new tier-boundary + cap-matrix tests
2. `cd frontend; npm run build` — Vite build passes
3. `cd frontend; npm run lint` — eslint passes
4. Docker (`Dockerfile.frontend` multi-stage, **no source volume mount**): `docker compose up -d --build frontend`
5. Manual visual check: header colors + hover glow (no filter), row hover, row-best/worst left borders, heat tiers in heatmap + matrix, 0/null cells, sort arrows, entry/latest/matrix links & click-through to StockChartModal, **first 3 columns remain gray**, stats-table colors unchanged, market-cap coverage sanity (count of real `market_cap` vs Unknown)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `th:hover` specificity tie (0,2,1) | `th.col-*:hover` rules placed after base hover block |
| Tints hiding row hover / row-best | Tints via `background-image`; hover via `background-color` overlay |
| Null/NaN returns render hot | `getReturnClass` → `neutral`; `.trade-table .neutral` styled |
| Filter-based hover perf (rejected) | Background compositing instead |
| Heat/table "in sync" illusion (FM1) | Heatmap derives from `sortedTrades` (same sortConfig), no pagination |
| Sticky-left column jank at 500 rows (FM2) | Sticky-left dropped; natural scroll only |
| Gradient underline impossible via box-shadow | `th.col-return-*::after` pseudo-element |
| `filter` + `backdrop-filter` quirk on sticky th | Hover pinned to bg + box-shadow glow |
| Max High/Low text would ship colorless | New scoped `.trade-table .positive`/`.negative` rules |
| Heat scale flatness on real data | Fixed tiers v1; percentile fallback flagged v1.1 |
| Empty datasets | Empty-state messages for heatmap card; existing fallback for matrix |
| Frontend rebuild forgotten in Docker | Verification item #4; add AGENTS.md reminder |
