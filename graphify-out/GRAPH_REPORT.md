# Graph Report - D:\AI\Stock Market\ChartInk\BacktestBaba  (2026-05-13)

## Corpus Check
- Corpus is ~19,622 words - fits in a single context window. You may not need a graph.

## Summary
- 93 nodes · 90 edges · 23 communities (14 shown, 9 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]

## God Nodes (most connected - your core abstractions)
1. `Backtester` - 5 edges
2. `run_backtest_async()` - 5 edges
3. `parse_upload_data()` - 4 edges
4. `SignalResult` - 4 edges
5. `BacktestReport` - 4 edges
6. `run_backtest_endpoint()` - 3 edges
7. `DataProvider` - 3 edges
8. `SymbolResolver` - 3 edges
9. `_resolve_uncached()` - 3 edges
10. `get_next_trading_day()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Backtester` --uses--> `DataProvider`  [INFERRED]
  backend/core/backtester.py → backend/core/data_provider.py
- `Backtester` --uses--> `SymbolResolver`  [INFERRED]
  backend/core/backtester.py → backend/core/symbol_resolver.py
- `Backtester` --uses--> `SignalResult`  [INFERRED]
  backend/core/backtester.py → backend/models/schemas.py
- `Backtester` --uses--> `BacktestReport`  [INFERRED]
  backend/core/backtester.py → backend/models/schemas.py
- `SymbolResolver` --uses--> `DataProvider`  [INFERRED]
  backend/core/symbol_resolver.py → backend/core/data_provider.py

## Communities (23 total, 9 thin omitted)

### Community 1 - "Community 1"
Cohesion: 0.26
Nodes (10): BaseModel, Backtester, run_backtest_async(), BacktestReport, BacktestRequest, SignalResult, get_next_trading_day(), parse_date() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.24
Nodes (5): DataProvider, _check_exists(), resolve(), _resolve_uncached(), SymbolResolver

### Community 4 - "Community 4"
Cohesion: 0.38
Nodes (5): parse_upload_data(), REST endpoint for backtest — no progress updates, returns full report., Parse uploaded file bytes into a DataFrame with validation., run_backtest_endpoint(), websocket_endpoint()

## Knowledge Gaps
- **13 isolated node(s):** `Parse uploaded file bytes into a DataFrame with validation.`, `REST endpoint for backtest — no progress updates, returns full report.`, `Fetches historical data for a symbol with caching.`, `Fetches historical data for multiple symbols concurrently via yf.download.`, `Fetches sector and market cap metadata for a symbol.         Uses a 7-day cache` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Backtester` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `Backtester` (e.g. with `DataProvider` and `SymbolResolver`) actually correct?**
  _`Backtester` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Parse uploaded file bytes into a DataFrame with validation.`, `REST endpoint for backtest — no progress updates, returns full report.`, `Fetches historical data for a symbol with caching.` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._