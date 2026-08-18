# Workflow: Run Regression Tests

**Objective:** Verify that the bulk fetch and sequential fallback methods in the backtester produce identical results for a set of known signals.

**When to use:** 
- After making changes to `backend/core/backtester.py`, `backend/core/data_provider.py`, or `backend/core/symbol_resolver.py`.
- When diagnosing data discrepancy issues.

## Required Tools
- `tools/verify_regression.py`: A script that runs the backtester in bulk mode and sequential mode, comparing the outputs with `DeepDiff`.

## Steps

1. **Run the Script**
   Execute the verification script from the project root:
   ```bash
   python tools/verify_regression.py
   ```

2. **Analyze Output**
   - The script will first run "Bulk Fetch Mode" and then "Sequential Fallback Mode".
   - If successful, it prints `SUCCESS: Both methods produced exactly identical reports!`.
   - If failed, it prints `FAIL: Differences found!` followed by a JSON difference trace.

3. **Handle Failures**
   - Inspect the `DeepDiff` output to understand which fields differ.
   - Common culprits: `latest_price` caching issues, timezone handling in dates, or `dropna(how='all')` logic when dealing with single symbols.
   - Resolve the underlying issue in `backend/core/` and re-run this workflow.
