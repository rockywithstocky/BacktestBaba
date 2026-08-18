import asyncio
import sys
import os
import pandas as pd
from deepdiff import DeepDiff
from unittest.mock import patch

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from backend.core.backtester import Backtester
from backend.core.data_provider import DataProvider

async def main():
    signals = [
        {"symbol": "RELIANCE", "date": "2023-01-05"},
        {"symbol": "TCS", "date": "2023-01-09"},
        {"symbol": "HDFCBANK", "date": "2023-05-15"}
    ]

    print("--- 1. Running Bulk Fetch Mode ---")
    bulk_report = await Backtester.run_backtest_async(signals)
    bulk_dict = bulk_report.model_dump()

    print("\n--- 2. Running Sequential Fallback Mode ---")
    # Mock the bulk fetch to return an empty dataframe, forcing fallback to sequential for every symbol
    with patch.object(DataProvider, 'get_bulk_ticker_data', return_value=pd.DataFrame()):
        seq_report = await Backtester.run_backtest_async(signals)
        seq_dict = seq_report.model_dump()

    print("\n--- 3. Running DeepDiff ---")
    diff = DeepDiff(seq_dict, bulk_dict, significant_digits=4, ignore_numeric_type_changes=True)
    
    if diff:
        print("FAIL: Differences found!")
        print(diff)
        sys.exit(1)
    else:
        print("SUCCESS: Both methods produced exactly identical reports!")

if __name__ == "__main__":
    asyncio.run(main())
