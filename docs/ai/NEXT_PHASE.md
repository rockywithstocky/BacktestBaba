# Immediate Roadmap

## Active Phase: Phase 2 (Product Improvements)

### Step 2.4: Dashboard Restructuring (Immediate Priority)
- **Target**: `frontend/src/components/Dashboard.jsx` (Currently a 700+ line monolith).
- **Goal**: Decompose into isolated, maintainable components.
  - `SummaryCards.jsx`
  - `PerformanceCharts.jsx`
  - `TradeLogTable.jsx`
  - `StockChartModal.jsx`
- **Constraint**: Purely structural. Zero state logic changes. Zero behavioral regressions.

### Step 2.5: AI Fundamentals Module (Upcoming)
- **Goal**: Replace frontend mock data with real AI-driven analysis.
- **Plan**: Introduce a new `/api/fundamental/{symbol}` REST endpoint.
- **Mechanism**: Feed raw Yahoo Finance data into an LLM (Gemini) to return a structured fundamental verdict (Buy/Sell/Hold rationale).

---

## Future Considerations
- Expand backtest triggers (e.g., dynamic stop-loss, trailing stops).
- Support for intraday resolution (currently D1 only).
- Database persistence for user accounts and historical backtest logs.
