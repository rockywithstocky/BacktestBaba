# ADR-001: Right Slide-In Panel for Trade Analyzer

## Status
Accepted

## Date
2026-07-23

## Context
The backtest analyzer tab (`[Report] [Analyzer]` toggle) was flagged as "taking over everything" — toggling away from the Report view broke the user's primary workflow. Three alternatives were considered for integrating the analyzer's 5 features (risk engine, stock lookup, stats tables, tier planner, fresh-stock auto-list):

1. **4-tab approach**: Replace 2-tab toggle with 4-tabs (Report / Stock Lookup / Stats / Planner)
2. **Right slide-in panel**: Overlay panel, Report stays visible
3. **Modal**: Full-screen modal overlay

## Decision
Use a right slide-in panel (420px fixed width) with dual-trigger access.

## Alternatives Considered

### 4-tab approach
- Pros: Equal treatment of all features, no overlay
- Cons: Report hidden on 3 of 4 tabs (same problem as before), Risk Control Bar visible on irrelevant tabs, higher cognitive load
- Rejected: Amplifies the original complaint

### Full-screen modal
- Pros: Focused view for analysis
- Cons: Covers Report entirely, heavy dismissal friction, feels like a context switch
- Rejected: Same problem as tabs — Report is permanently hidden

## Consequences
- Report view is always visible — primary workflow untouched
- Risk Control Bar only renders inside panel (contextually correct)
- Dual trigger covers both exploration (⊕ → fresh stock list) and targeted use (↗ → specific stock)
- No trade table column added — ↗ icon sits inside Symbol cell on hover
- Panel dismissable via ✕ or Escape — zero state change on close
- Implementation complexity is low — no routing, no new pages, no backend changes

## Verification
76 frontend tests pass before and after. Trade row click (return cells) still opens StockChartModal — unchanged. No backend files modified.
