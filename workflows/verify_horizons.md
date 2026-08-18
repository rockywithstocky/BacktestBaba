# Workflow: Verify Horizons Output

**Objective:** Verify that the backtester correctly calculates returns across 7, 14, 30, 45, 60, and 90-day horizons for a mix of valid, invalid, and edge-case signals.

**When to use:**
- After modifying how future dates or returns are calculated.
- When you need to ensure weekend date shifting logic is working properly.
- To check how the system handles recent dates that do not have 90-day future data yet.

## Required Tools
- `tools/verify_horizons.py`: A script that runs the backtester against specific edge cases and dumps the JSON payload.

## Steps

1. **Run the Script**
   Execute the script from the project root:
   ```bash
   python tools/verify_horizons.py
   ```

2. **Analyze Output**
   - The script will dump the raw JSON `BacktestReport` output.
   - Verify the following in the JSON:
     - The weekend signal (e.g., TCS on Jan 8, a Sunday) should have its entry shifted to the next trading day (Jan 9).
     - The invalid symbol (`FAKE_XYZ`) should return gracefully without crashing the whole batch.
     - The recent date (e.g., INFY) should have `None` for horizons that exceed the available data.
     - Ensure the percentage returns look mathematically correct.

3. **Handle Failures**
   - If the script fails with an exception or missing data, check the `yfinance` download logic in `backend/core/data_provider.py`.
   - Date manipulation issues usually stem from `backend/utils/date_utils.py`.
