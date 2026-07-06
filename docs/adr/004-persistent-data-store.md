# ADR 004: Persistent Historical Data Store

## Problem

Every backtest re-fetches all historical OHLCV data from Yahoo Finance for all unique symbols, even symbols and date ranges that were fetched minutes earlier by a previous backtest. The current diskcache uses 24-hour TTL and per-range keys, which is conceptually mismatched with immutable historical data. Fetching completed trading days more than once is structural waste.

## Decision

We will introduce a local persistent store for completed historical OHLCV data, using SQLite as the embedded database engine.

SQLite was chosen because:
- It is embedded — no new infrastructure, deployment dependency, or process management.
- It handles the expected storage size (~300 MB for 10 years of NSE data) without tuning.
- Its concurrency model (single-writer, multiple-reader) matches the application's access pattern: one backtest at a time, reads dominate writes by orders of magnitude.
- It is zero-maintenance for this access pattern — no background compaction, repair, or indexing required.

This decision may be revisited if future requirements materially change (e.g., multi-writer concurrency, distributed deployment, or cross-instance sharing).

## Scope

Only historical OHLCV data goes into this store. Metadata (sector, marketCap) remains in diskcache with TTL. Symbol resolution state remains in the in-memory cache. The store is transparent to the backtester and frontend — only `DataProvider` knows it exists.

## Tradeoffs

- First-run performance is unchanged (data is fetched from Yahoo Finance and stored).
- Subsequent runs with overlapping symbols fetch no data from Yahoo Finance for stored ranges.
- If the store is unavailable, the system degrades gracefully to direct Yahoo Finance fetching.

## Consequences

- The `DataProvider` component evolves from "fetch from origin, cache briefly" to "check local store first, fetch only missing data from origin."
- The bulk download (`yf.download`) is replaced by per-symbol lookups through the persistent store.
- No other component changes.

## Status

Accepted. Implementation deferred to the Persistent Historical Data Store phase of the roadmap.
