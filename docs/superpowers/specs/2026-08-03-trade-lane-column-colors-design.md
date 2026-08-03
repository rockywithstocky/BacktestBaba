# Design: Trade Lane Column Colors — Trade Log Table

**Date:** 2026-08-03
**Branch:** `feature/trade-lane-column-colors`
**Scope:** Frontend only — `frontend/src/components/Dashboard.jsx`, `frontend/src/components/Dashboard.css`, `frontend/src/__tests__/test_latest_return.test.js`

## Problem

The Trade Log table (11 columns) is monochrome apart from scoped classes that are actually unstyled in this table. Users scan rows to find winners/losers, but nothing visually separates the trade lifecycle (entry → live → horizon returns → extremes) or emphasizes return magnitude. The user requested color starting from the Entry column onward.

## Goal

Give columns from **Entry Date → Max Low** a distinct visual identity that (a) marks column meaning via colored sticky headers, and (b) emphasizes return magnitude via a green/red heat scale on the return-bearing columns — while keeping the structure quiet and preserving all existing behavior.

## Chosen Direction: Hybrid "Trade Lane"

| Column | Header (identity) | Cell treatment |
|---|---|---|
| Symbol / Signal Date / Close | Unchanged (gray) | Unchanged |
| Entry Date | Indigo label `#818cf8` + 2px underline | Monochrome (quiet) |
| Entry | Sky label `#38bdf8` + underline | Subtle sky tint `rgba(56,189,248,0.08)` + sky-tinted price text |
| Latest Price | Cyan label `#22d3ee` + underline | **Heat** (4 tiers) by `latest_price_return` |
| 1 Week / 1 Month / 3 Month Return | Label + tiny green→red split-gradient underline (cue: "heat column") | **Heat** — green/red background + text brightness ramp |
| Max High | Emerald label `#10b981` + underline | Subtle tint `rgba(16,185,129,0.08)` + existing green text |
| Max Low | Rose label `#f43f5e` + underline | Subtle tint `rgba(244,63,94,0.08)` + existing red text |
| 0 / null / NaN return | — | `neutral` gray (`#9ca3af`), no heat |

## Heat Scale (shared green/red)

Thresholds on `|value|`; sign decides hue:

| Tier | Condition | Background alpha | Text |
|---|---|---|---|
| 0 | `value == null` or NaN or 0 | none | `#9ca3af` (neutral) |
| 1 | `\|v\| < 2%` | 0.12 | base hue (green `#10b981` / red `#ef4444`) |
| 2 | `2% ≤ \|v\| < 5%` | 0.25 | brighter (green `#34d399` / red `#f87171`) |
| 3 | `5% ≤ \|v\| < 10%` | 0.40 | brighter (green `#6ee7b7` / red `#fca5a5`) |
| 4 | `\|v\| ≥ 10%` | 0.50 | brightest (green `#a7f3d0` / red `#fecaca`) |

- Thresholds defined as named JS constants in `getReturnClass` (`HEAT_TIER_1 = 2`, `HEAT_TIER_2 = 5`, `HEAT_TIER_3 = 10`) so retuning is one line. Alphas defined as CSS custom properties on `.trade-table` scope.
- Alphas capped at 0.50 max to keep text legible on the dark glass background.
- Boundary rule: tier 1 at exactly 0? No — 0 is neutral. `2.00` = tier 2 (≥), `9.99` = tier 3, `10.00` = tier 4.

## Implementation Details

### Dashboard.jsx

1. Add helper `getReturnClass(val)` next to `getColorClass` (line ~195):
   - `null` / `undefined` / `NaN` → `'neutral'`
   - `val > 0` → `'heat-pos-{1..4}'` by tier; `val < 0` → `'heat-neg-{1..4}'` by tier
   - `val === 0` → `'neutral'`
2. Replace `getColorClass(...)` with `getReturnClass(...)` **only** in the trade table body cells (Latest Price line 604, return cells lines 617/624/631).
3. Add column classes to the 8 `<th>` and matching `<td>` elements:
   - `col-entry-date`, `col-entry`, `col-latest`, `col-return-7d`, `col-return-30d`, `col-return-90d`, `col-max-high`, `col-max-low`
   - Return cells keep `clickable-cell`; heat class appended: `clickable-cell col-return-7d heat-pos-3`.
4. Entry price link keeps `color: inherit`; sky tint comes from the cell, not the link.
5. No changes to sort handlers, tooltips, `handleCellClick`, pagination, or the stats table.

### Dashboard.css

1. CSS custom properties for heat **alpha levels** (on `.trade-table` scope).
2. `th.col-*` rules: colored label text + `box-shadow: inset 0 -2px 0 <hue>` (or border-bottom approach) for the underline; uppercase/text-transform from base `th` rule retained.
3. `th.col-*:hover` brighten rules **after** the base `.trade-table th:hover` block (specificity tie — file order decides; must come later).
4. Cell tints via `background-image: linear-gradient(rgba(hue, alpha), rgba(hue, alpha))` — **not** `background-color` — so the hover rule below layers over them.
5. `tbody tr:hover td { background-color: rgba(255,255,255,0.05); }` — preserves row hover highlight while keeping tints (background-color renders under background-image).
6. `.trade-table .neutral { color: #9ca3af; }`.
7. Heat text colors per tier (text hue brightens with tier).
8. Return header underline: `background: linear-gradient(90deg, #10b981, #ef4444)` on the underline element.
9. Legend under the table (next to the existing latest-price note): one line, e.g. "Darker background = stronger move".

### Tests (`test_latest_return.test.js`)

Follow repo convention (duplicate helper in test file). Add `getReturnClass` tests:
- positive tiers: 1.5 → `heat-pos-1`, 2.0 → `heat-pos-2`, 4.99 → `heat-pos-2`, 5.0 → `heat-pos-3`, 9.99 → `heat-pos-3`, 10.0 → `heat-pos-4`, 25 → `heat-pos-4`
- negative mirror: -1.5 → `heat-neg-1`, -2.0 → `heat-neg-2`, -10.0 → `heat-neg-4`
- 0 → `neutral`; null → `neutral`; undefined → `neutral`; NaN → `neutral`

## Explicitly Out of Scope

- Stats table (`getColorClass` usages at Dashboard.jsx:476-489) — untouched
- StockChartModal / UploadCard / hero badges / risk rows — untouched
- Backend, API, WebSocket, persistence — untouched
- Column order — unchanged
- `getColorClass` refactor/removal — kept as-is (avoid scope creep)

## Verification

1. `cd frontend; npm test -- --run` — all tests pass, including new tier-boundary tests
2. `cd frontend; npm run build` — Vite build passes
3. `cd frontend; npm run lint` — eslint passes
4. Docker (no source volume mount in `Dockerfile.frontend`): `docker compose up -d --build frontend`
5. Manual visual check: header colors + hover, row hover, row-best/row-worst left borders, heat tiers, 0/null cells, sort arrows, entry/latest links still clickable

## Risks & Mitigations (from technical review)

| Risk | Mitigation |
|---|---|
| `th:hover` specificity tie with `th.col-*` (0,2,1) | Explicit `th.col-*:hover` rules placed after base hover block |
| Cell tints hiding `tr:hover` / row-best row highlight | Tints via `background-image`; hover via `background-color` (layers beneath image) |
| Null/NaN returns rendering hot | `getReturnClass` returns `neutral`; `.trade-table .neutral` styled gray |
| Filter-based hover perf (rejected) | Not used — background compositing instead |
| Tier thresholds arbitrary | Named JS constants in `getReturnClass`, documented, 1-line retune |
| Rainbow noise | Subtle tints capped at 0.08 alpha; heat confined to 4 return-bearing columns |
