# ADR 001: Phase 1 Stabilization

## Problem
The backend FastAPI event loop was suffering from complete starvation during Backtests. 
1. `yfinance` network requests are inherently blocking.
2. The WebSocket connection relies on regular ping/pong heartbeats to remain open.
3. Because the event loop was blocked by `yfinance`, the WebSocket would drop connections mid-backtest on large files, failing the entire operation.

Additionally, the frontend API endpoints and CORS origins were hardcoded to Production URLs, completely breaking local development workflows. File uploads failed silently if headers were missing.

## Decision
1. **Async Delegation**: Wrapped `SymbolResolver.resolve` and `DataProvider.get_ticker_data` inside `asyncio.to_thread`.
2. **Environment Configuration**: Extracted `VITE_API_URL`, `VITE_WS_URL`, and `CORS_ORIGINS` into environment files.
3. **Strict Validation**: Explicitly intercepted Pandas parsing errors (`EmptyDataError`, `UnicodeDecodeError`) and enforced a 10MB file size cap, reporting structured JSON errors back over the WebSocket.
4. **Resolution Caching**: Added an in-memory dictionary to `SymbolResolver` to avoid redundant network lookups for symbols that appear multiple times in a single CSV.

## Tradeoffs
- `asyncio.to_thread` introduces minor thread-switching overhead, but the cost is negligible compared to the 100ms+ network latency of Yahoo Finance.
- In-memory resolution caching only lives for the duration of a single Gunicorn worker process, but this is acceptable for the current stateless scale.

## Validation
- Pytest suite was upgraded to use `pytest-asyncio` and verified that the asynchronous backtester logic generates the exact same output.
- WebSockets no longer disconnect on 100+ row CSVs.

## Consequences
The platform is now stable enough for large-scale operations. Local development is unblocked. The foundation is set for performance optimizations.
