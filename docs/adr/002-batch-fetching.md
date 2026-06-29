# ADR 002: Batch Fetching Architecture

## Problem
The `Backtester.run_backtest_async` engine originally processed signals sequentially. For N signals, it made N blocking HTTP calls to `yfinance.Ticker.history()`. 
A CSV with 50 signals would take 1-2 minutes to process, creating a severely degraded user experience.

## Decision
We implemented a Deterministic 3-Phase Batch Fetching Architecture:
1. **Phase A (Resolve)**: Deterministically extract unique symbols and determine the absolute `Global_Start` and `Global_End` bounds of the entire CSV.
2. **Phase B (Bulk)**: Pass the unique list to a single `yf.download(group_by="ticker")` call to fetch a massive MultiIndex DataFrame.
3. **Phase C (Slice & Fallback)**: Extract the isolated DataFrame for each symbol using pandas slicing (`bulk_df[symbol].dropna(how='all')`) to preserve its exact trading calendar.

If `yfinance` randomly drops a symbol from the bulk payload (due to throttling or API bugs), the system gracefully catches the `KeyError` and triggers a fallback to the original sequential `yf.Ticker.history()` logic.

## Tradeoffs
- Memory footprint increases slightly because the entire DataFrame is held in RAM during calculation. However, even 200 symbols over 1 year consumes less than 10MB of memory, making this a non-issue.
- MultiIndex slicing in Pandas is complex and prone to syntax evolution.

## Validation
A rigorous `DeepDiff` regression test (`verify_regression.py`) was executed. By mocking the Bulk Fetch to fail instantly, we forced the system to run the Sequential Fallback path. We compared the JSON output of the Sequential path to the Bulk path. The results were mathematically identical down to the decimal point.

## Consequences
Backtest speeds increased by roughly ~10x on large files. The fallback path guarantees that the optimization does not compromise system resilience.

## Amendment (2026-05-07): SingleTicker MultiIndex Fix
**Discovery**: `yf.download(group_by='ticker')` returns a `pd.MultiIndex` DataFrame even when only 1 symbol is passed. The original slicing code assumed `len(symbols) == 1` meant a flat index, which caused a `KeyError: 'Close'` crash for single-symbol bulk downloads.

**Fix**: Replaced the `len()` check with `isinstance(bulk_df.columns, pd.MultiIndex)`. This correctly handles all cases regardless of symbol count. Added `[SLICE MISS]` and `[SLICE INFO]` diagnostic logging for future observability.
