# ADR 003: Market Enrichment

## Problem
Traders requested visibility into the `sector` and `marketCap` of backtested symbols to enable better filtering and post-backtest analysis. However, Yahoo Finance's `.info` endpoint is notoriously slow and heavily rate-limited. Fetching this data per-signal would completely destroy the performance gains achieved in ADR 002.

## Decision
We implemented a strictly optional, heavily cached enrichment layer.
1. **Aggressive Caching**: Added a 7-day TTL cache via `diskcache` for all metadata fetches.
2. **Concurrency**: Triggered metadata fetching concurrently (`asyncio.gather`) during Phase B of the backtest.
3. **Rate Limiting**: Protected the concurrent fetches with an `asyncio.Semaphore(10)` to prevent connection flooding.
4. **Raw State**: Preserved `market_cap` as raw integers internally to allow frontend formatting flexibility.

## Tradeoffs
- First-time backtests of completely unknown symbols will incur a slight delay as `.info` is resolved.
- Market Caps will be up to 7 days out of date, which is highly acceptable for backtesting auxiliary metadata.

## Validation
Wrapped the fetch logic in a broad `try...except Exception` block with structured `[ENRICHMENT ERROR]` logging. Forced the endpoint to fail and verified that the core backtest still succeeded, simply returning `null` for the missing metadata.

## Consequences
The UI gains powerful new dimensions for filtering, while the core backtesting engine remains completely decoupled and safe from metadata API instability.
